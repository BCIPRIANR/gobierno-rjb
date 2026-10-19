"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { registrarAuditoria } from "@/lib/auditoria";
import { calcularSha256 } from "@/lib/cargas/hash";
import { procesarCarga } from "@/lib/cargas/procesar";
import { esquemaCarga, MIME_XLSX, rutaStorage, validarArchivoXlsx } from "@/lib/cargas/validacion";
import { NOMBRE_MES } from "@/lib/parser/texto";

export type EstadoSubida = {
  /** `exito`: aceptada o recibida · `rechazo`: el archivo no pasó los checks · `error`: fallo de validación o del sistema */
  tipo: "exito" | "rechazo" | "error" | null;
  mensaje: string | null;
};

function falla(mensaje: string): EstadoSubida {
  return { tipo: "error", mensaje };
}

/**
 * Recibe un .xlsx del contador, lo guarda y lo revisa automáticamente.
 * Orden: sesión → campos (zod) → archivo → permiso (puede_cargar) → hash →
 * Storage → fila en `cargas` (procesando) → parser + checks → aceptada/rechazada → auditoría.
 * Toda escritura usa el cliente service_role después de verificar permiso.
 */
export async function subirArchivo(_anterior: EstadoSubida, formData: FormData): Promise<EstadoSubida> {
  // 1. Sesión
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return falla("Tu sesión expiró. Vuelve a iniciar sesión e intenta de nuevo.");
  }

  // 2. Campos
  const campos = esquemaCarga.safeParse({
    empresa_id: formData.get("empresa_id"),
    tipo_archivo: formData.get("tipo_archivo"),
    periodo: formData.get("periodo"),
    caracter: formData.get("caracter"),
  });
  if (!campos.success) {
    return falla(campos.error.issues[0]?.message ?? "Revisa los datos del formulario.");
  }
  const { empresa_id, tipo_archivo, periodo, caracter } = campos.data;

  // 3. Archivo
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) {
    return falla("Adjunta el archivo .xlsx que quieres cargar.");
  }
  const validacion = validarArchivoXlsx({ nombre: archivo.name, tamano: archivo.size });
  if (!validacion.ok) {
    return falla(validacion.error);
  }

  // 4. Permiso sobre la empresa (admin o contador asignado)
  const admin = crearClienteAdmin();
  const { data: puede, error: errorPermiso } = await admin.rpc("puede_cargar", {
    p_usuario: user.id,
    p_empresa: empresa_id,
  });
  if (errorPermiso || puede !== true) {
    return falla("No tienes permiso para cargar archivos de esta empresa.");
  }

  const { data: tipo } = await admin.from("tipos_archivo").select("codigo").eq("codigo", tipo_archivo).maybeSingle();
  if (!tipo) {
    return falla("El tipo de archivo elegido no existe. Recarga la página e intenta de nuevo.");
  }

  // 5. Hash antes de procesar
  const contenido = new Uint8Array(await archivo.arrayBuffer());
  const hash = calcularSha256(contenido);

  // 6. Número de versión
  const { data: ultima } = await admin
    .from("cargas")
    .select("version")
    .eq("empresa_id", empresa_id)
    .eq("tipo_archivo", tipo_archivo)
    .eq("periodo", periodo)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (ultima?.version ?? 0) + 1;

  // 7. Archivo original a Storage (bucket privado)
  const id = randomUUID();
  const ruta = rutaStorage(empresa_id, periodo, id);
  const { error: errorStorage } = await admin.storage
    .from("cargas")
    .upload(ruta, contenido, { contentType: MIME_XLSX, upsert: false });
  if (errorStorage) {
    console.error("[cargas] fallo al subir a storage", errorStorage.message);
    return falla("No se pudo guardar el archivo. Intenta de nuevo en un momento.");
  }

  // 8. Fila en cargas (procesando)
  const { error: errorInsert } = await admin.from("cargas").insert({
    id,
    empresa_id,
    tipo_archivo,
    periodo,
    version,
    vigente: true,
    estado: "procesando",
    caracter,
    nombre_archivo: archivo.name,
    storage_path: ruta,
    hash_sha256: hash,
    subido_por: user.id,
  });
  if (errorInsert) {
    console.error("[cargas] fallo al registrar la carga", errorInsert.code);
    await admin.storage.from("cargas").remove([ruta]);
    return falla("No se pudo registrar la carga. Intenta de nuevo en un momento.");
  }

  // 9. Parser + checks → aceptada / rechazada. Si es aceptada, la versión anterior deja de ser vigente.
  const resultado = await procesarCarga(admin, { id, empresa_id, tipo_archivo, periodo }, contenido);

  // 10. Auditoría (sin cifras ni datos personales)
  await registrarAuditoria({
    usuarioId: user.id,
    accion: "subir_carga",
    entidad: "cargas",
    entidadId: id,
    detalle: { empresa_id, tipo_archivo, periodo, version, caracter, tamano_bytes: archivo.size, estado: resultado.estado },
  });

  revalidatePath("/cargas");

  switch (resultado.estado) {
    case "aceptada": {
      const mes = resultado.ultimoMes ? NOMBRE_MES[resultado.ultimoMes] : null;
      const avisos = resultado.avisos > 0 ? ` Hay ${resultado.avisos} ${resultado.avisos === 1 ? "aviso" : "avisos"} en el historial.` : "";
      const reemplazo = version > 1 ? ` Reemplaza a la versión ${version - 1}.` : "";
      const kpis = resultado.avisoKpi
        ? ` ${resultado.avisoKpi}`
        : ` KPI calculados: ${resultado.kpis}${resultado.kpisNd > 0 ? ` (${resultado.kpisNd} en N/D por datos faltantes)` : ""}.`;
      return {
        tipo: "exito",
        mensaje: `Archivo aceptado: ${resultado.hechos.toLocaleString("es-CO")} valores registrados${mes ? `, datos hasta ${mes}` : ""}.${reemplazo}${kpis}${avisos}`,
      };
    }
    case "rechazada":
      return { tipo: "rechazo", mensaje: `Archivo rechazado. ${resultado.motivo}` };
    case "procesando":
      return { tipo: "exito", mensaje: resultado.mensaje };
    case "error":
      return falla(resultado.mensaje);
  }
}

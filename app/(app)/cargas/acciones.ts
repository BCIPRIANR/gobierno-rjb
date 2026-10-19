"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { registrarAuditoria } from "@/lib/auditoria";
import { calcularSha256 } from "@/lib/cargas/hash";
import { esquemaCarga, MIME_XLSX, rutaStorage, validarArchivoXlsx } from "@/lib/cargas/validacion";

export type EstadoSubida = {
  ok: boolean;
  mensaje: string | null;
};

function falla(mensaje: string): EstadoSubida {
  return { ok: false, mensaje };
}

/**
 * Recibe un .xlsx del contador y crea una carga en estado `procesando`.
 * Orden: sesión → campos (zod) → archivo → permiso (puede_cargar) → hash →
 * Storage → fila en `cargas` → versiones anteriores no vigentes → auditoría.
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

  const { data: tipo } = await admin
    .from("tipos_archivo")
    .select("codigo")
    .eq("codigo", tipo_archivo)
    .maybeSingle();
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

  // 8. Fila en cargas (procesando). Los checks del Bloque 3 la pasan a aceptada/rechazada.
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

  // 9. Versiones anteriores dejan de ser vigentes. Nada se borra.
  await marcarAnterioresNoVigentes(admin, { empresa_id, tipo_archivo, periodo, idActual: id });

  // 10. Auditoría (sin cifras ni datos personales)
  await registrarAuditoria({
    usuarioId: user.id,
    accion: "subir_carga",
    entidad: "cargas",
    entidadId: id,
    detalle: { empresa_id, tipo_archivo, periodo, version, caracter, tamano_bytes: archivo.size },
  });

  revalidatePath("/cargas");
  return {
    ok: true,
    mensaje:
      version === 1
        ? "Archivo recibido. Quedó en revisión automática."
        : `Archivo recibido como versión ${version}. La versión anterior ya no está vigente.`,
  };
}

async function marcarAnterioresNoVigentes(
  admin: ReturnType<typeof crearClienteAdmin>,
  c: { empresa_id: string; tipo_archivo: string; periodo: string; idActual: string },
) {
  const { error } = await admin
    .from("cargas")
    .update({ vigente: false })
    .eq("empresa_id", c.empresa_id)
    .eq("tipo_archivo", c.tipo_archivo)
    .eq("periodo", c.periodo)
    .neq("id", c.idActual)
    .eq("vigente", true);
  if (error) {
    console.error("[cargas] no se pudo marcar versiones anteriores", error.code);
  }
}

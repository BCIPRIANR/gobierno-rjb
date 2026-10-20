"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { registrarAuditoria } from "@/lib/auditoria";
import { generarInformeJunta } from "@/lib/informes/generar";

export type EstadoAccion = { tipo: "exito" | "error" | null; mensaje: string | null };

const ROLES = new Set(["founder", "admin", "gerente"]);

type Autorizacion = { error: string } | { usuarioId: string; rol: string };

/** Sesión + rol + permiso sobre la empresa (RLS: si la ve, puede trabajar su informe). */
async function autorizar(empresaId: string): Promise<Autorizacion> {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const { data: perfil } = await supabase.from("perfiles").select("id, rol, activo").eq("id", user.id).maybeSingle();
  if (!perfil || !perfil.activo || !ROLES.has(perfil.rol)) return { error: "Tu rol no puede trabajar informes de Junta." };
  const { data: empresa } = await supabase.from("empresas").select("id").eq("id", empresaId).maybeSingle();
  if (!empresa) return { error: "No tienes acceso a esa empresa." };
  return { usuarioId: user.id, rol: perfil.rol };
}

const esquemaGenerar = z.object({
  empresa_id: z.string().uuid(),
  periodo: z.string().regex(/^\d{4}-\d{2}-01$/),
});

export async function generarInforme(_anterior: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const datos = esquemaGenerar.safeParse({ empresa_id: formData.get("empresa_id"), periodo: formData.get("periodo") });
  if (!datos.success) return { tipo: "error", mensaje: "Datos inválidos. Recarga la página." };
  const auth = await autorizar(datos.data.empresa_id);
  if ("error" in auth) return { tipo: "error", mensaje: auth.error };

  const admin = crearClienteAdmin();
  const r = await generarInformeJunta(admin, { empresaId: datos.data.empresa_id, periodo: datos.data.periodo, generadoPor: auth.usuarioId, avisar: true });
  await registrarAuditoria({
    usuarioId: auth.usuarioId,
    accion: "generar_informe",
    entidad: "informes_junta",
    entidadId: r.ok ? r.informeId : undefined,
    detalle: { empresa_id: datos.data.empresa_id, periodo: datos.data.periodo, ok: r.ok, con_ia: r.ok ? r.conIa : false },
  });
  revalidatePath("/informes");
  if (!r.ok) return { tipo: "error", mensaje: r.mensaje };
  return {
    tipo: "exito",
    mensaje: r.conIa ? "Borrador generado con resumen y alertas. Completa los bloques del gerente." : `Borrador generado sin redacción de la IA: ${r.avisoIa}`,
  };
}

const esquemaBloques = z.object({
  informe_id: z.string().uuid(),
  causas_acciones: z.string().trim().max(4000).optional(),
  hechos_relevantes: z.string().trim().max(4000).optional(),
  decisiones_junta: z.string().trim().max(4000).optional(),
  compromisos: z.string().trim().max(4000).optional(),
});

async function informeYEmpresa(informeId: string) {
  const admin = crearClienteAdmin();
  const { data } = await admin.from("informes_junta").select("id, empresa_id, estado").eq("id", informeId).maybeSingle();
  return { admin, informe: data };
}

export async function guardarBloques(_anterior: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const datos = esquemaBloques.safeParse(Object.fromEntries(formData.entries()));
  if (!datos.success) return { tipo: "error", mensaje: datos.error.issues[0]?.message ?? "Datos inválidos." };
  const { admin, informe } = await informeYEmpresa(datos.data.informe_id);
  if (!informe) return { tipo: "error", mensaje: "El informe no existe." };
  const auth = await autorizar(informe.empresa_id);
  if ("error" in auth) return { tipo: "error", mensaje: auth.error };
  if (informe.estado === "aprobado") return { tipo: "error", mensaje: "El informe ya está aprobado y no se puede editar." };

  const { error } = await admin
    .from("informes_junta")
    .update({
      causas_acciones: datos.data.causas_acciones || null,
      hechos_relevantes: datos.data.hechos_relevantes || null,
      decisiones_junta: datos.data.decisiones_junta || null,
      compromisos: datos.data.compromisos || null,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", informe.id);
  if (error) return { tipo: "error", mensaje: "No se pudieron guardar los bloques. Intenta de nuevo." };

  await registrarAuditoria({ usuarioId: auth.usuarioId, accion: "editar_informe", entidad: "informes_junta", entidadId: informe.id });
  revalidatePath("/informes");
  return { tipo: "exito", mensaje: "Bloques del gerente guardados." };
}

export async function aprobarInforme(_anterior: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const id = z.string().uuid().safeParse(formData.get("informe_id"));
  if (!id.success) return { tipo: "error", mensaje: "Datos inválidos." };
  const { admin, informe } = await informeYEmpresa(id.data);
  if (!informe) return { tipo: "error", mensaje: "El informe no existe." };
  const auth = await autorizar(informe.empresa_id);
  if ("error" in auth) return { tipo: "error", mensaje: auth.error };

  const { error } = await admin
    .from("informes_junta")
    .update({ estado: "aprobado", aprobado_en: new Date().toISOString(), aprobado_por: auth.usuarioId, actualizado_en: new Date().toISOString() })
    .eq("id", informe.id);
  if (error) return { tipo: "error", mensaje: "No se pudo aprobar el informe." };

  await registrarAuditoria({ usuarioId: auth.usuarioId, accion: "aprobar_informe", entidad: "informes_junta", entidadId: informe.id });
  revalidatePath("/informes");
  return { tipo: "exito", mensaje: "Informe aprobado. Ya no se puede editar ni regenerar." };
}

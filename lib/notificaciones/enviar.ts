import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/tipos";
import { enviarEmail } from "./email";
import { enviarWhatsApp } from "./whatsapp";
import type { MensajeAviso } from "./plantillas";

type Admin = SupabaseClient<Database>;

export type Canal = "whatsapp" | "email";
export type TipoAviso = "recordatorio_carga" | "carga_aceptada" | "carga_rechazada" | "resumen" | "alerta";

export type Destinatario = {
  id: string;
  nombre: string;
  email: string;
  telefono_whatsapp: string | null;
};

export type ResumenEnvio = { enviados: number; fallidos: number; omitidos: number };

/**
 * Registra el aviso en `notificaciones` (pendiente), lo envía por cada canal y
 * actualiza el estado (enviada / fallida con error). Nunca lanza: un aviso que
 * falla no debe tumbar la acción que lo originó. No registra cifras en logs.
 */
export async function notificar(
  admin: Admin,
  p: { destinatario: Destinatario; empresaId: string | null; tipo: TipoAviso; mensaje: MensajeAviso; canales: Canal[] },
): Promise<ResumenEnvio> {
  const resumen: ResumenEnvio = { enviados: 0, fallidos: 0, omitidos: 0 };

  for (const canal of p.canales) {
    if (canal === "whatsapp" && !p.destinatario.telefono_whatsapp) {
      resumen.omitidos++;
      continue;
    }

    const { data: fila, error: errorInsert } = await admin
      .from("notificaciones")
      .insert({
        destinatario_id: p.destinatario.id,
        empresa_id: p.empresaId,
        canal,
        tipo: p.tipo,
        asunto: p.mensaje.asunto,
        cuerpo: p.mensaje.cuerpo,
        estado: "pendiente",
      })
      .select("id")
      .single();
    if (errorInsert || !fila) {
      console.error("[notificaciones] no se pudo registrar el aviso", p.tipo, canal, errorInsert?.code);
      resumen.fallidos++;
      continue;
    }

    const resultado =
      canal === "whatsapp"
        ? await enviarWhatsApp(p.destinatario.telefono_whatsapp as string, p.mensaje.cuerpo)
        : await enviarEmail(p.destinatario.email, p.mensaje.asunto, p.mensaje.cuerpo);

    const { error: errorUpdate } = await admin
      .from("notificaciones")
      .update(
        resultado.ok
          ? { estado: "enviada", enviado_en: new Date().toISOString(), error: null }
          : { estado: "fallida", error: resultado.error.slice(0, 500) },
      )
      .eq("id", fila.id);
    if (errorUpdate) console.error("[notificaciones] no se pudo actualizar el estado", errorUpdate.code);

    if (resultado.ok) resumen.enviados++;
    else resumen.fallidos++;
  }

  return resumen;
}

/** Hubo un aviso igual (mismo destinatario, tipo y asunto) en las últimas `horas`. */
export async function yaAvisado(admin: Admin, destinatarioId: string, tipo: TipoAviso, asunto: string, horas = 20): Promise<boolean> {
  const desde = new Date(Date.now() - horas * 3_600_000).toISOString();
  const { count } = await admin
    .from("notificaciones")
    .select("id", { count: "exact", head: true })
    .eq("destinatario_id", destinatarioId)
    .eq("tipo", tipo)
    .eq("asunto", asunto)
    .gte("creado_en", desde);
  return (count ?? 0) > 0;
}

import "server-only";

import { Resend } from "resend";
import type { ResultadoEnvio } from "./whatsapp";

const REMITENTE_POR_DEFECTO = "Gobierno RJB <onboarding@resend.dev>";

export function emailConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Correo de texto plano vía Resend. */
export async function enviarEmail(para: string, asunto: string, texto: string): Promise<ResultadoEnvio> {
  const llave = process.env.RESEND_API_KEY;
  if (!llave) {
    return { ok: false, error: "Canal de correo no configurado (falta RESEND_API_KEY)." };
  }
  try {
    const resend = new Resend(llave);
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_REMITENTE || REMITENTE_POR_DEFECTO,
      to: para,
      subject: asunto,
      text: texto,
    });
    if (error) return { ok: false, error: `Resend: ${error.message}` };
    return { ok: true, idExterno: data?.id ?? null };
  } catch (e) {
    return { ok: false, error: `Correo sin respuesta: ${e instanceof Error ? e.message : "error de red"}` };
  }
}

import "server-only";

/**
 * WhatsApp Cloud API (Meta). Envía un mensaje de texto a un número E.164 sin `+`.
 *
 * Nota: fuera de la ventana de 24 h desde el último mensaje del usuario, Meta
 * exige una plantilla aprobada; en ese caso el envío falla con un error claro
 * y queda registrado en `notificaciones`.
 */

const VERSION_API = "v21.0";

export type ResultadoEnvio = { ok: true; idExterno: string | null } | { ok: false; error: string };

export function whatsappConfigurado(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function enviarWhatsApp(telefono: string, texto: string): Promise<ResultadoEnvio> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    return { ok: false, error: "Canal WhatsApp no configurado (faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID)." };
  }
  if (!/^\d{8,15}$/.test(telefono)) {
    return { ok: false, error: "Teléfono inválido: debe ser E.164 sin '+', p. ej. 573001234567." };
  }

  try {
    const respuesta = await fetch(`https://graph.facebook.com/${VERSION_API}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: telefono,
        type: "text",
        text: { preview_url: false, body: texto },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const datos = (await respuesta.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { message?: string; code?: number };
    };
    if (!respuesta.ok || datos.error) {
      return { ok: false, error: `WhatsApp ${respuesta.status}: ${datos.error?.message ?? "error desconocido"}` };
    }
    return { ok: true, idExterno: datos.messages?.[0]?.id ?? null };
  } catch (e) {
    return { ok: false, error: `WhatsApp sin respuesta: ${e instanceof Error ? e.message : "error de red"}` };
  }
}

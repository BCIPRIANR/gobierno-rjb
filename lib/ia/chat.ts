import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/tipos";
import type { UsuarioActual } from "@/lib/auth";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { ejecutarHerramienta, HERRAMIENTAS } from "./herramientas";

const MODELO_POR_DEFECTO = "claude-opus-5-5";
const MAX_ITERACIONES = 8;
const MAX_HISTORIAL = 20;

/**
 * Instrucciones fijas (se cachean). Las reglas vienen de CLAUDE.md › Principios:
 * la IA solo narra lo calculado, nunca estima, y dice N/D cuando falta un dato.
 */
const SISTEMA = `Eres el asistente financiero del Grupo RJB. Respondes al Founder y a los gerentes en español, con frases cortas y voz activa.

Reglas que no puedes romper:
1. Ningún número sale de tu memoria: toda cifra viene de una herramienta. Si no la consultaste, no la digas.
2. Si un dato no existe o está en N/D, di "N/D" y explica el motivo que devuelve la herramienta. Nunca estimes, promedies ni rellenes meses faltantes.
3. Di siempre de qué empresa y mes hablas, y el estado del dato: real (viene del archivo), calculado, meta o N/D. Si la carga es preliminar, dilo.
4. Si la empresa es de demostración (es_demo = true), empieza con "DATOS DE DEMOSTRACIÓN".
5. Solo ves las empresas que te devuelven las herramientas. Si preguntan por otra, di que no tienes acceso a ella.
6. No llames "EBITDA" ni "utilidad operacional" a ingresos menos costos: se llama "excedente entre ingresos y costos/gastos". Recaudo menos pagos es "flujo neto de caja operativo".
7. No digas que una empresa "crea valor" o "destruye valor": ese criterio (ROIC > WACC, EVA > 0) no está calculado en el sistema.
8. Usa los valores ya formateados por las herramientas (COP millones, porcentajes, p.p.). Comparaciones: mes actual vs anterior, acumulado del año, meta si existe ("Sin meta definida" si no hay).
9. Si la pregunta no se puede responder con las herramientas disponibles, dilo y sugiere qué sí puedes consultar.

Responde con 2 a 6 frases. Usa una lista corta solo si hay varias cifras. Termina, si aplica, con una observación útil basada solo en los datos consultados.`;

export type MensajeChat = { rol: "user" | "assistant"; contenido: string };

export type RespuestaChat =
  | { ok: true; respuesta: string; herramientas: string[]; modelo: string }
  | { ok: false; error: string; codigo: "no_configurado" | "modelo" | "interno" };

export function iaConfigurada(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Responde una pregunta del usuario con el historial de la conversación. Las
 * herramientas leen con la sesión del usuario (RLS). Guarda ambos turnos en
 * chat_mensajes con las herramientas usadas en metadatos.
 */
export async function responderChat(p: {
  usuario: UsuarioActual;
  supabase: SupabaseClient<Database>;
  conversacionId: string;
  pregunta: string;
}): Promise<RespuestaChat> {
  if (!iaConfigurada()) {
    return { ok: false, codigo: "no_configurado", error: "El chat con IA no está configurado: falta ANTHROPIC_API_KEY en el servidor." };
  }
  const modelo = process.env.ANTHROPIC_MODEL || MODELO_POR_DEFECTO;
  const admin = crearClienteAdmin();

  // Historial reciente de esta conversación (RLS: solo la del usuario).
  const { data: previos } = await p.supabase
    .from("chat_mensajes")
    .select("rol, contenido")
    .eq("conversacion_id", p.conversacionId)
    .in("rol", ["user", "assistant"])
    .order("creado_en", { ascending: false })
    .limit(MAX_HISTORIAL);
  const historial: Anthropic.MessageParam[] = (previos ?? [])
    .reverse()
    .map((m) => ({ role: m.rol === "user" ? "user" : "assistant", content: m.contenido }));

  await admin.from("chat_mensajes").insert({
    conversacion_id: p.conversacionId,
    usuario_id: p.usuario.id,
    canal: "web",
    rol: "user",
    contenido: p.pregunta,
  });

  const cliente = new Anthropic();
  const mensajes: Anthropic.MessageParam[] = [...historial, { role: "user", content: p.pregunta }];
  const herramientasUsadas: string[] = [];
  const ctx = { supabase: p.supabase, usuarioId: p.usuario.id };

  try {
    let texto = "";
    for (let i = 0; i < MAX_ITERACIONES; i++) {
      const respuesta = await cliente.messages.create({
        model: modelo,
        max_tokens: 4096,
        output_config: { effort: "low" },
        system: [{ type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } }],
        tools: HERRAMIENTAS,
        messages: mensajes,
      });

      if (respuesta.stop_reason === "refusal") {
        texto = "No puedo responder esa pregunta. Pregunta por los KPI, el semáforo de cargas o los cruces entre empresas.";
        break;
      }

      const usosHerramienta = respuesta.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      texto = respuesta.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      if (respuesta.stop_reason !== "tool_use" || usosHerramienta.length === 0) break;

      mensajes.push({ role: "assistant", content: respuesta.content });
      const resultados: Anthropic.ToolResultBlockParam[] = [];
      for (const uso of usosHerramienta) {
        herramientasUsadas.push(uso.name);
        try {
          const r = await ejecutarHerramienta(ctx, uso.name, uso.input);
          resultados.push({ type: "tool_result", tool_use_id: uso.id, content: JSON.stringify(r) });
        } catch (e) {
          resultados.push({
            type: "tool_result",
            tool_use_id: uso.id,
            content: JSON.stringify({ error: e instanceof Error ? e.message : "error al ejecutar la herramienta" }),
            is_error: true,
          });
        }
      }
      mensajes.push({ role: "user", content: resultados });
    }

    if (!texto) texto = "No pude construir una respuesta con los datos disponibles. Intenta con otra pregunta.";

    await admin.from("chat_mensajes").insert({
      conversacion_id: p.conversacionId,
      usuario_id: p.usuario.id,
      canal: "web",
      rol: "assistant",
      contenido: texto,
      metadatos: { modelo, herramientas: herramientasUsadas } as Json,
    });

    return { ok: true, respuesta: texto, herramientas: herramientasUsadas, modelo };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return { ok: false, codigo: "no_configurado", error: "La clave de Anthropic no es válida. Revisa ANTHROPIC_API_KEY." };
    }
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, codigo: "modelo", error: "El servicio de IA está saturado. Intenta de nuevo en un momento." };
    }
    if (e instanceof Anthropic.APIError) {
      console.error("[chat] error de la API", e.status, e.message);
      return { ok: false, codigo: "modelo", error: `El servicio de IA respondió con un error (${e.status}). Intenta de nuevo.` };
    }
    console.error("[chat] error inesperado", e instanceof Error ? e.message : e);
    return { ok: false, codigo: "interno", error: "Ocurrió un error inesperado. Intenta de nuevo." };
  }
}

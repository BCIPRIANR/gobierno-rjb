import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { DatosInforme } from "@/lib/informes/armar";
import { iaConfigurada } from "./chat";

const MODELO_POR_DEFECTO = "claude-opus-5-5";

/** Salida estructurada: la IA solo redacta; no puede introducir cifras nuevas. */
const esquemaRedaccion = z.object({
  resumen: z.object({
    ventas: z.string().describe("Una frase sobre ingresos: cuánto, frente al mes anterior y frente a la meta si existe."),
    rentabilidad: z.string().describe("Una frase sobre costos y excedente entre ingresos y costos/gastos."),
    caja_cartera: z.string().describe("Una frase sobre recaudo, flujo neto y cartera; si están en N/D, decirlo y por qué."),
  }),
  alertas: z
    .array(
      z.object({
        indicador: z.string().describe("Nombre del indicador tal como aparece en los datos."),
        estado: z.enum(["amarillo", "rojo"]),
        texto: z.string().describe("Una frase: qué pasó y qué tan lejos de la meta está. Sin recomendaciones inventadas."),
      }),
    )
    .describe("Una entrada por cada indicador en amarillo o rojo. Vacío si no hay."),
});

export type Redaccion = z.infer<typeof esquemaRedaccion>;

const SISTEMA = `Redactas la sección "Resumen del mes" y las "Alertas del mes" del informe mensual para la Junta Directiva del Grupo RJB. Escribes en español, frases cortas, voz activa, sin adjetivos vacíos.

Reglas que no puedes romper:
1. Usa solo las cifras que vienen en los datos, con el texto ya formateado (COP millones, %, p.p.). No calcules ni estimes nada nuevo.
2. Si un indicador está en N/D, dilo así y repite el motivo de los datos. Nunca lo reemplaces por 0 ni lo omitas si es relevante.
3. Di el estado del dato cuando importe: si la carga es preliminar, menciónalo en la frase de ventas.
4. Si la empresa es de demostración (es_demo = true), empieza la frase de ventas con "DATOS DE DEMOSTRACIÓN:".
5. No uses "EBITDA" ni "utilidad operacional". Di "excedente entre ingresos y costos/gastos" y "flujo neto de caja operativo".
6. No digas que la empresa "crea valor" o "destruye valor".
7. Alertas: exactamente una por cada indicador cuyo semáforo sea amarillo o rojo, con el nombre del indicador. Los que están sin meta o en N/D no son alertas (ya se listan aparte).
8. Sin meta no hay cumplimiento: no inventes una.`;

export type ResultadoRedaccion =
  | { ok: true; redaccion: Redaccion; modelo: string }
  | { ok: false; error: string };

/** Pide a la IA el resumen y las alertas a partir de los datos ya armados (sin acceso a nada más). */
export async function redactarInforme(datos: DatosInforme): Promise<ResultadoRedaccion> {
  if (!iaConfigurada()) {
    return { ok: false, error: "La IA no está configurada (falta ANTHROPIC_API_KEY): el informe queda sin resumen ni alertas redactadas." };
  }
  const modelo = process.env.ANTHROPIC_MODEL || MODELO_POR_DEFECTO;
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  const cliente = new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});

  // Solo lo necesario para redactar: sin ids internos.
  const entrada = {
    empresa: datos.empresa.nombre,
    es_demo: datos.empresa.es_demo,
    periodo: datos.periodoTexto,
    caracter_carga: datos.origen?.caracter ?? null,
    estado_general: datos.estadoGeneral,
    indicadores: datos.indicadores.map((i) => ({
      indicador: i.nombre,
      grupo: i.grupo,
      mes: i.mes.texto,
      motivo_nd: i.mes.motivoNd,
      acumulado_anio: i.acumulado.texto,
      variacion_vs_mes_anterior: i.variacion.texto,
      meta: i.meta.texto,
      semaforo: i.semaforo.color,
      sentido: i.sentido,
    })),
    caja: datos.caja,
    cartera: { total: datos.cartera.total.texto, top5: datos.cartera.top5.map((t) => ({ deudor: t.concepto, saldo: t.texto, participacion: t.participacion, cambio: t.cambio })) },
  };

  try {
    const respuesta = await cliente.messages.parse({
      model: modelo,
      max_tokens: 2048,
      output_config: { effort: "low", format: zodOutputFormat(esquemaRedaccion) },
      system: [{ type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Datos del mes (JSON):\n${JSON.stringify(entrada)}` }],
    });
    if (respuesta.stop_reason === "refusal" || !respuesta.parsed_output) {
      return { ok: false, error: "La IA no devolvió una redacción válida." };
    }
    return { ok: true, redaccion: respuesta.parsed_output, modelo };
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error("[informe] error de la API", e.status, e.message);
      return { ok: false, error: `El servicio de IA respondió con un error (${e.status}).` };
    }
    console.error("[informe] error inesperado", e instanceof Error ? e.message : e);
    return { ok: false, error: "Error inesperado al redactar el informe." };
  }
}

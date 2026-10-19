import type { Json } from "@/lib/supabase/tipos";
import { TIPO_ACUMULADO } from "./calcular";

/**
 * Comparaciones para el tablero (funciones puras): acumulado del año, promedio
 * mensual y variación contra el mes anterior. Si falta un dato, el resultado es
 * `null`, nunca 0.
 */

export type ResultadoMes = {
  kpi_codigo: string;
  /** `YYYY-MM-01` */
  periodo: string;
  valor: number | null;
  estado: "real" | "calculado" | "meta" | "nd";
  insumos: Json;
};

export type Unidad = "cop" | "pct" | "x" | "dias" | "personas";

export type Acumulado =
  | { tipo: "suma"; valor: number; meses: number; promedio: number }
  | { tipo: "razon"; valor: number; meses: number }
  | { tipo: "ninguno" }
  | { tipo: "nd"; motivo: string };

export type Variacion =
  | { tipo: "relativa"; valor: number; anterior: number }
  | { tipo: "puntos"; valor: number; anterior: number }
  | { tipo: "absoluta"; valor: number; anterior: number }
  | { tipo: "nd"; motivo: string };

function leerNumero(json: Json, ...ruta: string[]): number | null {
  let actual: Json = json;
  for (const k of ruta) {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) return null;
    actual = (actual as Record<string, Json | undefined>)[k] ?? null;
  }
  return typeof actual === "number" ? actual : null;
}

/**
 * Acumulado de enero al mes indicado (mismo año) para un KPI.
 * - `suma`: suma de los meses con dato; si algún mes está en N/D, el acumulado es N/D.
 * - `razon`: Σ numerador ÷ Σ denominador tomados de los insumos.
 */
export function acumuladoAnual(codigo: string, periodo: string, resultados: ResultadoMes[]): Acumulado {
  const tipo = TIPO_ACUMULADO[codigo] ?? "ninguno";
  if (tipo === "ninguno") return { tipo: "ninguno" };

  const anio = periodo.slice(0, 4);
  const delAnio = resultados
    .filter((r) => r.kpi_codigo === codigo && r.periodo.startsWith(anio) && r.periodo <= periodo)
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  if (delAnio.length === 0) return { tipo: "nd", motivo: "Sin resultados en el año." };
  const enNd = delAnio.filter((r) => r.estado === "nd" || r.valor === null);
  if (enNd.length > 0) {
    return { tipo: "nd", motivo: `Falta ${enNd.map((r) => r.periodo.slice(0, 7)).join(", ")}.` };
  }

  if (tipo === "suma") {
    const valor = delAnio.reduce((s, r) => s + (r.valor as number), 0);
    return { tipo: "suma", valor, meses: delAnio.length, promedio: valor / delAnio.length };
  }

  let num = 0;
  let den = 0;
  for (const r of delAnio) {
    const n = leerNumero(r.insumos, "numerador", "valor");
    const d = leerNumero(r.insumos, "denominador", "valor");
    if (n === null || d === null) return { tipo: "nd", motivo: `Faltan insumos en ${r.periodo.slice(0, 7)}.` };
    num += n;
    den += d;
  }
  if (den === 0) return { tipo: "nd", motivo: "El denominador acumulado es 0." };
  return { tipo: "razon", valor: num / den, meses: delAnio.length };
}

/** Variación del mes contra el anterior: relativa (cop), en p.p. (pct) o absoluta (personas, días, x). */
export function variacionMensual(codigo: string, unidad: Unidad, periodo: string, resultados: ResultadoMes[]): Variacion {
  const actual = resultados.find((r) => r.kpi_codigo === codigo && r.periodo === periodo);
  const anterior = resultados.find((r) => r.kpi_codigo === codigo && r.periodo === periodoAnterior(periodo));
  if (!actual || actual.valor === null || actual.estado === "nd") return { tipo: "nd", motivo: "El mes actual está en N/D." };
  if (!anterior || anterior.valor === null || anterior.estado === "nd") return { tipo: "nd", motivo: "No hay dato del mes anterior." };

  if (unidad === "pct") return { tipo: "puntos", valor: actual.valor - anterior.valor, anterior: anterior.valor };
  if (unidad === "cop") {
    if (anterior.valor === 0) return { tipo: "nd", motivo: "El mes anterior es 0; la variación no se puede calcular." };
    return { tipo: "relativa", valor: (actual.valor - anterior.valor) / Math.abs(anterior.valor), anterior: anterior.valor };
  }
  return { tipo: "absoluta", valor: actual.valor - anterior.valor, anterior: anterior.valor };
}

export function periodoAnterior(periodo: string): string {
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(5, 7));
  const d = new Date(Date.UTC(anio, mes - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Serie de 12 meses del año para la mini tendencia; `null` donde no hay dato. */
export function serieAnual(codigo: string, anio: string, resultados: ResultadoMes[]): (number | null)[] {
  const serie: (number | null)[] = Array.from({ length: 12 }, () => null);
  for (const r of resultados) {
    if (r.kpi_codigo !== codigo || !r.periodo.startsWith(anio)) continue;
    const mes = Number(r.periodo.slice(5, 7));
    serie[mes - 1] = r.estado === "nd" ? null : r.valor;
  }
  return serie;
}

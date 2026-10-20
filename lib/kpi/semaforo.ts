/**
 * Semáforo contra meta (regla única del analista, ver CLAUDE.md › Informe de Junta).
 * Función pura: nunca inventa una meta; sin meta → gris.
 */

export type Sentido = "mayor_mejor" | "menor_mejor" | "neutro";
export type ColorSemaforo = "verde" | "amarillo" | "rojo" | "sin_meta" | "nd" | "sin_semaforo";

export type Semaforo = {
  color: ColorSemaforo;
  /** Cumplimiento = valor ÷ meta (o meta ÷ valor en "menos es mejor"); null si no aplica. */
  cumplimiento: number | null;
  motivo: string;
};

const TOLERANCIA_AMARILLO = 0.1; // 10%

/** KPI que son rojos siempre que sean negativos (excedente / flujo de caja). */
const ROJO_SI_NEGATIVO = new Set(["flujo_neto", "excedente"]);

/** KPI que se evalúan como rango ±10% alrededor de la meta. */
const EVALUAR_COMO_RANGO = new Set(["dias_proveedores"]);

export function evaluarSemaforo(p: { codigo: string; valor: number | null; meta: number | null; sentido: Sentido }): Semaforo {
  if (p.valor === null) return { color: "nd", cumplimiento: null, motivo: "Sin dato (N/D)." };

  if (ROJO_SI_NEGATIVO.has(p.codigo) && p.valor < 0) {
    return { color: "rojo", cumplimiento: p.meta ? p.valor / p.meta : null, motivo: "Resultado negativo: siempre rojo." };
  }

  if (p.sentido === "neutro") return { color: "sin_semaforo", cumplimiento: null, motivo: "Indicador informativo, sin semáforo." };
  if (p.meta === null) return { color: "sin_meta", cumplimiento: null, motivo: "Sin meta definida." };

  if (EVALUAR_COMO_RANGO.has(p.codigo)) {
    if (p.meta === 0) return { color: "sin_meta", cumplimiento: null, motivo: "Meta en 0: no se puede evaluar el rango." };
    const desvio = Math.abs(p.valor - p.meta) / Math.abs(p.meta);
    return desvio <= TOLERANCIA_AMARILLO
      ? { color: "verde", cumplimiento: p.valor / p.meta, motivo: "Dentro del rango ±10% de la meta." }
      : { color: "rojo", cumplimiento: p.valor / p.meta, motivo: "Fuera del rango ±10% de la meta." };
  }

  if (p.sentido === "mayor_mejor") {
    if (p.valor >= p.meta) return { color: "verde", cumplimiento: razon(p.valor, p.meta), motivo: "Cumple la meta." };
    if (p.meta <= 0) return { color: "rojo", cumplimiento: null, motivo: "Por debajo de la meta." };
    const c = p.valor / p.meta;
    return c >= 0.9
      ? { color: "amarillo", cumplimiento: c, motivo: "Entre 90% y 99,9% de la meta." }
      : { color: "rojo", cumplimiento: c, motivo: "Por debajo del 90% de la meta." };
  }

  // menor_mejor
  if (p.valor <= p.meta) return { color: "verde", cumplimiento: razon(p.meta, p.valor), motivo: "Igual o por debajo de la meta." };
  if (p.meta <= 0) return { color: "rojo", cumplimiento: null, motivo: "Por encima de la meta." };
  const exceso = (p.valor - p.meta) / p.meta;
  return exceso <= TOLERANCIA_AMARILLO
    ? { color: "amarillo", cumplimiento: p.meta / p.valor, motivo: "Hasta 10% por encima de la meta." }
    : { color: "rojo", cumplimiento: p.meta / p.valor, motivo: "Más de 10% por encima de la meta." };
}

function razon(num: number, den: number): number | null {
  return den === 0 ? null : num / den;
}

/** Estado general del informe: el peor color presente entre los indicadores con semáforo. */
export function estadoGeneral(colores: ColorSemaforo[]): { color: "verde" | "amarillo" | "rojo" | "sin_meta"; verdes: number; amarillos: number; rojos: number; sinMeta: number } {
  const verdes = colores.filter((c) => c === "verde").length;
  const amarillos = colores.filter((c) => c === "amarillo").length;
  const rojos = colores.filter((c) => c === "rojo").length;
  const sinMeta = colores.filter((c) => c === "sin_meta").length;
  const color = rojos > 0 ? "rojo" : amarillos > 0 ? "amarillo" : verdes > 0 ? "verde" : "sin_meta";
  return { color, verdes, amarillos, rojos, sinMeta };
}

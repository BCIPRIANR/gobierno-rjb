/** Utilidades puras de periodos (`YYYY-MM-01`, primer día del mes). */

function primerDia(anio: number, mesIndice: number): string {
  const d = new Date(Date.UTC(anio, mesIndice, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** El mes que se reporta hoy: el mes anterior (el archivo de julio se entrega en agosto). */
export function periodoDeReporte(hoy: Date = new Date()): string {
  return primerDia(hoy.getFullYear(), hoy.getMonth() - 1);
}

/** Los últimos `n` periodos de reporte, del más reciente al más antiguo. */
export function ultimosPeriodos(n: number, hoy: Date = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => primerDia(hoy.getFullYear(), hoy.getMonth() - 1 - i));
}

/** `2026-07` → `2026-07-01`; devuelve null si no tiene el formato esperado. */
export function periodoDesdeMes(mes: unknown): string | null {
  return typeof mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? `${mes}-01` : null;
}

/** Días entre hoy y una fecha `YYYY-MM-DD` (positivo si la fecha ya pasó). */
export function diasDesde(fecha: string, hoy: Date = new Date()): number {
  const f = new Date(`${fecha}T00:00:00Z`);
  const h = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((h - f.getTime()) / 86_400_000);
}

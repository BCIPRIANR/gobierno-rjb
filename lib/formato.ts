/**
 * Formatos de presentación (ver CLAUDE.md › Formatos). Locale es-CO:
 * separador de miles `.`, decimal `,`. La zona horaria es la de Colombia.
 */

const ZONA = "America/Bogota";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** `2026-07-01` → `Julio 2026`. Acepta también `2026-07`. */
export function formatearPeriodo(periodo: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(periodo);
  if (!m) return periodo;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return periodo;
  return `${MESES[mes - 1]} ${m[1]}`;
}

/** `2026-07-01` → `Jul 2026` (para tablas estrechas). */
export function formatearPeriodoCorto(periodo: string): string {
  const largo = formatearPeriodo(periodo);
  if (largo === periodo) return periodo;
  const [mes, anio] = largo.split(" ");
  return `${mes.slice(0, 3)} ${anio}`;
}

const formatoFechaHora = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** ISO → `19/10/2026, 15:30` */
export function formatearFechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatoFechaHora.format(d);
}

/** Bytes → `1,3 MB` / `820 KB` */
export function formatearTamano(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// ---------------------------------------------------------------------------
// Cifras (CLAUDE.md › Formatos): miles con `.`, decimal con `,`.
// ---------------------------------------------------------------------------

const numero1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const numero2 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const entero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/** Pesos completos → `$5.846,0 M` (COP millones). Negativo: `-$1.056,1 M`. */
export function formatearCOPMillones(pesos: number): string {
  const signo = pesos < 0 ? "-" : "";
  return `${signo}$${numero1.format(Math.abs(pesos) / 1_000_000)} M`;
}

/** Fracción (0,433) → `43,3%`. */
export function formatearPorcentaje(fraccion: number): string {
  return `${numero1.format(fraccion * 100)}%`;
}

/** Diferencia de fracciones (0,021) → `+2,1 p.p.`. */
export function formatearPuntosPorcentuales(delta: number): string {
  const signo = delta > 0 ? "+" : "";
  return `${signo}${numero1.format(delta * 100)} p.p.`;
}

/** Variación relativa (0,123) → `+12,3%`. */
export function formatearVariacion(fraccion: number): string {
  const signo = fraccion > 0 ? "+" : "";
  return `${signo}${numero1.format(fraccion * 100)}%`;
}

export function formatearRatio(x: number): string {
  return `${numero2.format(x)}x`;
}

export function formatearDias(n: number): string {
  return `${entero.format(Math.round(n))} días`;
}

export function formatearEntero(n: number): string {
  return entero.format(n);
}

export type UnidadKpi = "cop" | "pct" | "x" | "dias" | "personas";

/** Formato de un valor según la unidad del KPI. */
export function formatearValorKpi(valor: number, unidad: UnidadKpi): string {
  switch (unidad) {
    case "cop":
      return formatearCOPMillones(valor);
    case "pct":
      return formatearPorcentaje(valor);
    case "x":
      return formatearRatio(valor);
    case "dias":
      return formatearDias(valor);
    case "personas":
      return formatearEntero(valor);
  }
}

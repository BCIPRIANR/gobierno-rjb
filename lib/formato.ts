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

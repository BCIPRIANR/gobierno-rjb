/** Utilidades puras de texto para leer encabezados y títulos de los archivos. */

/** Mayúsculas, sin tildes, espacios colapsados. Para comparar títulos y claves. */
export function normalizarTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Concepto tal como se guarda: espacios colapsados y recortados, sin cambiar mayúsculas. */
export function limpiarConcepto(v: unknown): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

const MESES: Record<string, number> = {
  ENE: 1, ENERO: 1,
  FEB: 2, FEBRERO: 2,
  MAR: 3, MARZO: 3,
  ABR: 4, ABRIL: 4,
  MAY: 5, MAYO: 5,
  JUN: 6, JUNIO: 6,
  JUL: 7, JULIO: 7,
  AGO: 8, AGOSTO: 8,
  SEP: 9, SEPT: 9, SET: 9, SEPTIEMBRE: 9,
  OCT: 10, OCTUBRE: 10,
  NOV: 11, NOVIEMBRE: 11,
  DIC: 12, DICIEMBRE: 12,
};

export const NOMBRE_MES = [
  "", "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** `ene`, `ENERO`, `7`, `"7"` → 7. Cualquier otra cosa → null. */
export function mesDesdeEncabezado(v: unknown): number | null {
  if (typeof v === "number") {
    return Number.isInteger(v) && v >= 1 && v <= 12 ? v : null;
  }
  const t = normalizarTexto(v);
  if (!t) return null;
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    return n >= 1 && n <= 12 ? n : null;
  }
  return MESES[t] ?? null;
}

/** `800.130.907-1` → `800130907`; `900156264` → `900156264`; vacío → null. */
export function normalizarNit(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const texto = typeof v === "number" ? String(Math.trunc(v)) : String(v).trim();
  if (!texto) return null;
  const conDv = /^([\d.\s]+)\s*-\s*\d\s*$/.exec(texto);
  const base = conDv ? conDv[1] : texto;
  const digitos = base.replace(/\D/g, "");
  return digitos.length > 0 ? digitos : null;
}

export function esVacio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/** Número finito → el número; texto vacío → null; cualquier otra cosa → `NaN` (no numérico). */
export function leerNumero(v: unknown): number | null {
  if (esVacio(v)) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : Number.NaN;
  return Number.NaN;
}

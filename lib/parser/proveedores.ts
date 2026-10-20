import * as XLSX from "xlsx";
import type { Hecho, ProblemaCelda } from "./tipos";
import { esVacio, leerNumero, limpiarConcepto, normalizarNit, normalizarTexto } from "./texto";

/**
 * Lector del archivo PROVEEDORES (facturación / pagos mensuales por proveedor).
 * Hoja de datos: encabezado con NIT, nombre del proveedor, días de cartera, concepto y
 * una columna por mes (fechas). Después de los proveedores vienen categorías sin NIT
 * (arriendo, nómina, …) y al final filas de totales, que se ignoran.
 * Se detecta por encabezado, nunca por nombre de hoja ni posición. Función pura.
 */

type Celda = string | number | boolean | Date | null;
type Fila = Celda[];

/** Hecho de proveedores: lleva su propio periodo porque el año viene de la columna, no de la carga. */
export type HechoProveedor = Hecho & { periodo: string };

export type ProveedorLeido = {
  nit: string | null;
  nombre: string;
  diasCartera: number | null;
  concepto: string | null;
  fila: number;
};

export type ResultadoProveedores = {
  hoja: string | null;
  fechaCorte: string | null;
  filaEncabezado: number | null;
  meses: { periodo: string; columna: string }[];
  empresaDeclarada: string | null;
  proveedores: ProveedorLeido[];
  /** Hechos: seccion `pagos`, un valor por proveedor y mes (celdas vacías = sin factura, no se guardan). */
  hechos: HechoProveedor[];
  problemas: ProblemaCelda[];
  nitInvalidos: { fila: number; nombre: string; valor: string }[];
  nitRepetidos: { nit: string; nombres: string[]; filas: number[] }[];
  faltantes: string[];
  notas: string[];
};

const MIN_MESES = 6;

export function parsearProveedores(contenido: Uint8Array): ResultadoProveedores {
  const libro = XLSX.read(contenido, { type: "array", cellDates: true });
  const r: ResultadoProveedores = {
    hoja: null,
    fechaCorte: null,
    filaEncabezado: null,
    meses: [],
    empresaDeclarada: null,
    proveedores: [],
    hechos: [],
    problemas: [],
    nitInvalidos: [],
    nitRepetidos: [],
    faltantes: [],
    notas: [],
  };

  // 1. Hoja y encabezado: la primera fila (en cualquier hoja) con NIT + nombre y ≥ 6 columnas de fecha.
  let hoja: { nombre: string; filas: Fila[]; filaBase: number; colBase: number } | null = null;
  let iEnc = -1;
  let enc: { colNit: number; colNombre: number; colCartera: number | null; colConcepto: number | null; meses: { periodo: string; col: number }[]; colEmpresa: number | null } | null = null;

  for (const nombre of libro.SheetNames) {
    const ws = libro.Sheets[nombre];
    if (!ws["!ref"]) continue;
    const rango = XLSX.utils.decode_range(ws["!ref"]);
    const filas = XLSX.utils.sheet_to_json<Fila>(ws, { header: 1, raw: true, defval: null, blankrows: true });
    for (let i = 0; i < Math.min(filas.length, 30); i++) {
      const e = detectarEncabezado(filas[i] ?? []);
      if (e) {
        hoja = { nombre, filas, filaBase: rango.s.r, colBase: rango.s.c };
        iEnc = i;
        enc = e;
        break;
      }
    }
    if (hoja) break;
  }

  if (!hoja || !enc) {
    r.faltantes.push(`No se encontró una hoja con encabezado NIT / proveedor y al menos ${MIN_MESES} columnas de mes (fechas).`);
    return r;
  }
  const h = hoja;
  const filaExcel = (i: number) => h.filaBase + i + 1;
  const letra = (j: number) => XLSX.utils.encode_col(h.colBase + j);

  r.hoja = h.nombre;
  r.filaEncabezado = filaExcel(iEnc);
  r.meses = enc.meses.map((m) => ({ periodo: m.periodo, columna: letra(m.col) }));

  // Fecha de corte: una fecha sola en las filas previas al encabezado.
  for (let i = 0; i < iEnc; i++) {
    const d = (h.filas[i] ?? []).find((c) => c instanceof Date);
    if (d instanceof Date) {
      r.fechaCorte = d.toISOString().slice(0, 10);
      break;
    }
  }

  // 2. Filas de datos hasta la primera fila de totales.
  const vistos = new Map<string, { nombres: Set<string>; filas: number[] }>();
  const empresas = new Set<string>();

  for (let i = iEnc + 1; i < h.filas.length; i++) {
    const f = h.filas[i] ?? [];
    const nombreCrudo = f[enc.colNombre];
    const nitCrudo = f[enc.colNit];
    if (esVacio(nombreCrudo) && esVacio(nitCrudo)) continue;
    const nombre = limpiarConcepto(nombreCrudo);
    if (/^TOTAL\b/.test(normalizarTexto(nombre))) break;
    if (!nombre) continue;

    let nit: string | null = null;
    if (!esVacio(nitCrudo)) {
      const texto = String(nitCrudo).trim();
      const primero = texto.includes("/") ? texto.split("/")[0] : texto;
      nit = normalizarNit(primero);
      if (!nit || nit.length < 5) {
        r.nitInvalidos.push({ fila: filaExcel(i), nombre, valor: texto.slice(0, 30) });
        nit = null;
      } else if (texto.includes("/")) {
        r.notas.push(`Fila ${filaExcel(i)} ("${nombre}"): el NIT trae dos valores; se usó el primero (${nit}).`);
      }
    }

    const cartera = enc.colCartera !== null ? leerNumero(f[enc.colCartera]) : null;
    const concepto = enc.colConcepto !== null && !esVacio(f[enc.colConcepto]) ? limpiarConcepto(f[enc.colConcepto]) : null;
    r.proveedores.push({ nit, nombre, diasCartera: cartera !== null && !Number.isNaN(cartera) ? cartera : null, concepto, fila: filaExcel(i) });

    if (nit) {
      const v = vistos.get(nit) ?? { nombres: new Set<string>(), filas: [] };
      v.nombres.add(nombre);
      v.filas.push(filaExcel(i));
      vistos.set(nit, v);
    }
    if (enc.colEmpresa !== null && !esVacio(f[enc.colEmpresa])) empresas.add(limpiarConcepto(f[enc.colEmpresa]));

    for (const m of enc.meses) {
      const n = leerNumero(f[m.col]);
      if (n === null) continue;
      if (Number.isNaN(n)) {
        r.problemas.push({ hoja: h.nombre, fila: filaExcel(i), columna: letra(m.col), valor: String(f[m.col]).slice(0, 40), seccion: "pagos" });
        continue;
      }
      r.hechos.push({
        seccion: "pagos",
        concepto: nombre,
        nit,
        mes: Number(m.periodo.slice(5, 7)),
        valor: n,
        unidad: "COP",
        hoja_origen: h.nombre,
        fila_origen: filaExcel(i),
        columna_origen: letra(m.col),
        periodo: m.periodo,
      });
    }
  }

  for (const [nit, v] of vistos) {
    if (v.filas.length > 1) r.nitRepetidos.push({ nit, nombres: [...v.nombres], filas: v.filas });
  }
  if (empresas.size === 1) r.empresaDeclarada = [...empresas][0];
  else if (empresas.size > 1) r.notas.push(`La columna Empresa trae más de un valor: ${[...empresas].join(", ")}.`);
  if (r.proveedores.length === 0) r.faltantes.push("No se encontraron filas de proveedores bajo el encabezado.");

  return r;
}

function detectarEncabezado(fila: Fila) {
  const norm = fila.map(normalizarTexto);
  const colNit = norm.indexOf("NIT");
  const colNombre = norm.findIndex((t) => /^PROVE+DOR(ES)?$/.test(t) || t === "PROVEEDOR" || t === "PROVEDORES" || t === "NOMBRE");
  if (colNit < 0 || colNombre < 0) return null;

  const meses: { periodo: string; col: number }[] = [];
  fila.forEach((c, j) => {
    const p = periodoDeCelda(c);
    if (p) meses.push({ periodo: p, col: j });
  });
  if (meses.length < MIN_MESES) return null;

  const colCartera = norm.findIndex((t) => t.startsWith("CARTERA"));
  const colEmpresa = norm.indexOf("EMPRESA");
  // Concepto: columna sin título entre el nombre/cartera y el primer mes, o una titulada CONCEPTO.
  let colConcepto = norm.indexOf("CONCEPTO");
  if (colConcepto < 0) {
    const primerMes = meses[0].col;
    for (let j = Math.max(colNombre, colCartera) + 1; j < primerMes; j++) {
      if (norm[j] === "") {
        colConcepto = j;
        break;
      }
    }
  }
  return { colNit, colNombre, colCartera: colCartera >= 0 ? colCartera : null, colConcepto: colConcepto >= 0 ? colConcepto : null, meses, colEmpresa: colEmpresa >= 0 ? colEmpresa : null };
}

/** Celda de encabezado → `YYYY-MM-01` si es una fecha (Date o texto ISO/`YYYY-MM`). */
function periodoDeCelda(c: Celda): string | null {
  if (c instanceof Date && !Number.isNaN(c.getTime())) {
    return `${c.getUTCFullYear()}-${String(c.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  if (typeof c === "string") {
    const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(c.trim());
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[1]}-${m[2]}-01`;
  }
  return null;
}

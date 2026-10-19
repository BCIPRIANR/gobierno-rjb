import * as XLSX from "xlsx";
import type {
  ColumnaMes,
  ComparacionTotal,
  Duplicado,
  Hecho,
  ProblemaCelda,
  ResultadoParser,
  Seccion,
  TablaDetectada,
  TotalRecaudo,
  Unidad,
} from "./tipos";
import { esVacio, leerNumero, limpiarConcepto, mesDesdeEncabezado, normalizarNit, normalizarTexto } from "./texto";

/**
 * Lector del formato INFORMES MULTI (hojas TD, cartera y TD ING RET).
 *
 * Reglas (ver CLAUDE.md): las secciones se detectan por TÍTULO en la columna A,
 * nunca por posición fija; los meses se detectan por encabezado; cada valor
 * conserva hoja, fila y columna de origen. Función pura: no toca red ni BD.
 */

type Celda = string | number | boolean | Date | null;
type Fila = Celda[];

type Hoja = {
  nombre: string;
  filas: Fila[];
  /** Desplazamiento del rango (`A2` → filaBase = 1) para convertir índices a filas de Excel. */
  filaBase: number;
  columnaBase: number;
};

type Encabezado = {
  indiceFila: number;
  colConcepto: number;
  colNit: number | null;
  meses: ColumnaMes[]; // columna = índice dentro de la fila
  colTotal: number | null;
};

/** Títulos de sección en la hoja TD y cuántas tablas de meses tiene cada uno. */
const SECCIONES_TD: { titulo: string; secciones: Seccion[] }[] = [
  { titulo: "INGRESOS", secciones: ["ingresos"] },
  { titulo: "COSTOS Y GASTOS", secciones: ["costos_gastos"] },
  { titulo: "RECAUDO", secciones: ["recaudo_entidad", "recaudo_medio_pago"] },
  { titulo: "PAGOS", secciones: ["pagos"] },
];

const TITULOS_TD = new Set(SECCIONES_TD.map((s) => s.titulo));

export function parsearInformesMulti(contenido: Uint8Array): ResultadoParser {
  const libro = XLSX.read(contenido, { type: "array", cellDates: false });

  const resultado: ResultadoParser = {
    hojas: libro.SheetNames,
    tablas: [],
    hechos: [],
    problemas: [],
    duplicados: [],
    comparacionesTotales: [],
    totalRecaudo: null,
    faltantes: [],
    notas: [],
  };

  const td = cargarHoja(libro, "TD");
  const cartera = cargarHoja(libro, "CARTERA");
  const personal = cargarHoja(libro, "TD ING RET");

  if (td) {
    leerTD(td, resultado);
  } else {
    for (const s of SECCIONES_TD.flatMap((x) => x.secciones)) {
      resultado.faltantes.push({ seccion: s, motivo: "No existe la hoja TD" });
    }
    resultado.faltantes.push({ seccion: "total_recaudo", motivo: "No existe la hoja TD" });
  }

  if (cartera) {
    leerCartera(cartera, resultado);
  } else {
    resultado.faltantes.push({ seccion: "cartera", motivo: "No existe la hoja cartera" });
  }

  if (personal) {
    leerPersonal(personal, resultado);
  } else {
    resultado.faltantes.push({ seccion: "personal_ingreso", motivo: "No existe la hoja TD ING RET" });
    resultado.faltantes.push({ seccion: "personal_retiro", motivo: "No existe la hoja TD ING RET" });
  }

  return resultado;
}

// ---------------------------------------------------------------------------
// Hoja TD
// ---------------------------------------------------------------------------

function leerTD(hoja: Hoja, r: ResultadoParser) {
  // 1. Ubicar títulos de sección por texto en la columna A.
  const titulos: { titulo: string; indice: number }[] = [];
  hoja.filas.forEach((fila, i) => {
    const a = normalizarTexto(fila[0]);
    if (TITULOS_TD.has(a) && fila.slice(1).every(esVacio)) {
      titulos.push({ titulo: a, indice: i });
    }
  });

  for (const def of SECCIONES_TD) {
    const t = titulos.find((x) => x.titulo === def.titulo);
    if (!t) {
      for (const s of def.secciones) {
        r.faltantes.push({ seccion: s, motivo: `No se encontró el título "${def.titulo}" en la hoja TD` });
      }
      if (def.titulo === "RECAUDO") {
        r.faltantes.push({ seccion: "total_recaudo", motivo: 'No se encontró la sección "RECAUDO" en la hoja TD' });
      }
      continue;
    }

    // La sección termina donde empieza el siguiente título.
    const siguiente = titulos.filter((x) => x.indice > t.indice).map((x) => x.indice);
    const fin = siguiente.length ? Math.min(...siguiente) : hoja.filas.length;

    let desde = t.indice + 1;
    const encabezadosUsados: Encabezado[] = [];
    for (const seccion of def.secciones) {
      const enc = buscarEncabezado(hoja, desde, fin);
      if (!enc) {
        r.faltantes.push({
          seccion,
          motivo: `En "${def.titulo}" no se encontró una tabla con meses en el encabezado`,
        });
        break;
      }
      const finTabla = leerTabla(hoja, enc, seccion, "COP", r);
      encabezadosUsados.push(enc);
      desde = finTabla + 1;
    }

    if (def.titulo === "RECAUDO") {
      leerTotalRecaudo(hoja, desde, fin, encabezadosUsados, r);
    }
  }
}

function leerTotalRecaudo(hoja: Hoja, desde: number, fin: number, encabezados: Encabezado[], r: ResultadoParser) {
  let indice = -1;
  for (let i = desde; i < fin; i++) {
    if (normalizarTexto(hoja.filas[i]?.[0]) === "TOTAL RECAUDO") {
      indice = i;
      break;
    }
  }
  if (indice < 0) {
    r.faltantes.push({ seccion: "total_recaudo", motivo: 'No se encontró la fila "TOTAL RECAUDO" en la hoja TD' });
    return;
  }

  const fila = hoja.filas[indice];
  // Última columna con valor: sirve para elegir el encabezado cuya columna "Total general" coincide.
  let ultimaCol = -1;
  fila.forEach((c, j) => {
    if (!esVacio(c)) ultimaCol = j;
  });
  let enc = encabezados.find((e) => e.colTotal === ultimaCol) ?? null;
  if (!enc) {
    enc = encabezados[encabezados.length - 1] ?? null;
    if (enc) {
      r.notas.push(
        "La fila TOTAL RECAUDO no coincide con la columna Total general de ninguna tabla; se interpretó con la última tabla de RECAUDO.",
      );
    }
  }
  if (!enc) {
    r.faltantes.push({ seccion: "total_recaudo", motivo: "No hay tabla de RECAUDO para interpretar la fila TOTAL RECAUDO" });
    return;
  }

  const porMes: TotalRecaudo["porMes"] = [];
  for (const { mes, columna } of enc.meses) {
    const n = leerNumero(fila[columna]);
    if (n === null) continue;
    if (Number.isNaN(n)) {
      r.problemas.push(problema(hoja, indice, columna, fila[columna], "recaudo_entidad"));
      continue;
    }
    porMes.push({ mes, valor: n, columna: letraColumna(hoja, columna) });
  }
  const tg = enc.colTotal !== null ? leerNumero(fila[enc.colTotal]) : null;

  r.totalRecaudo = {
    hoja: hoja.nombre,
    fila: filaExcel(hoja, indice),
    porMes,
    totalGeneral: tg !== null && !Number.isNaN(tg) ? tg : null,
  };
}

// ---------------------------------------------------------------------------
// Hoja cartera
// ---------------------------------------------------------------------------

function leerCartera(hoja: Hoja, r: ResultadoParser) {
  const enc = buscarEncabezado(hoja, 0, hoja.filas.length);
  if (!enc) {
    r.faltantes.push({ seccion: "cartera", motivo: "En la hoja cartera no se encontró un encabezado con meses" });
    return;
  }
  if (enc.colNit === null) {
    r.notas.push("La hoja cartera no tiene columna NIT; las entidades no se enlazarán a terceros.");
  }
  leerTabla(hoja, enc, "cartera", "COP", r);
}

// ---------------------------------------------------------------------------
// Hoja TD ING RET (ingresos y retiros de personal por cargo)
// ---------------------------------------------------------------------------

function leerPersonal(hoja: Hoja, r: ResultadoParser) {
  // Sub-encabezado: fila cuya columna A dice CARGO y que tiene "ingreso"/"retiro" en las demás.
  let iSub = -1;
  for (let i = 0; i < hoja.filas.length; i++) {
    const f = hoja.filas[i];
    if (normalizarTexto(f[0]) === "CARGO" && f.some((c) => ["INGRESO", "RETIRO"].includes(normalizarTexto(c)))) {
      iSub = i;
      break;
    }
  }
  if (iSub < 1) {
    r.faltantes.push({ seccion: "personal_ingreso", motivo: 'En TD ING RET no se encontró el encabezado "CARGO | ingreso | retiro"' });
    r.faltantes.push({ seccion: "personal_retiro", motivo: 'En TD ING RET no se encontró el encabezado "CARGO | ingreso | retiro"' });
    return;
  }

  // Fila de meses: la primera no vacía por encima del sub-encabezado.
  let iMeses = iSub - 1;
  while (iMeses >= 0 && hoja.filas[iMeses].every(esVacio)) iMeses--;
  const filaMeses = iMeses >= 0 ? hoja.filas[iMeses] : [];
  const sub = hoja.filas[iSub];

  // Cada columna hereda el último mes visto; "Total <mes>" corta la herencia.
  const columnas: { col: number; mes: number; tipo: "ingreso" | "retiro" }[] = [];
  let mesActual: number | null = null;
  const ancho = Math.max(filaMeses.length, sub.length);
  for (let j = 1; j < ancho; j++) {
    const etiquetaMes = filaMeses[j];
    if (!esVacio(etiquetaMes)) {
      const m = mesDesdeEncabezado(etiquetaMes);
      if (m !== null) mesActual = m;
      else if (normalizarTexto(etiquetaMes).startsWith("TOTAL")) mesActual = null;
    }
    const tipo = normalizarTexto(sub[j]);
    if (mesActual !== null && (tipo === "INGRESO" || tipo === "RETIRO")) {
      columnas.push({ col: j, mes: mesActual, tipo: tipo === "INGRESO" ? "ingreso" : "retiro" });
    }
  }
  if (columnas.length === 0) {
    r.faltantes.push({ seccion: "personal_ingreso", motivo: "En TD ING RET no se pudieron asociar las columnas ingreso/retiro a un mes" });
    r.faltantes.push({ seccion: "personal_retiro", motivo: "En TD ING RET no se pudieron asociar las columnas ingreso/retiro a un mes" });
    return;
  }

  const mesesIng = columnas.filter((c) => c.tipo === "ingreso").map((c) => ({ mes: c.mes, columna: c.col }));
  const mesesRet = columnas.filter((c) => c.tipo === "retiro").map((c) => ({ mes: c.mes, columna: c.col }));
  const ultimo: Record<"personal_ingreso" | "personal_retiro", number | null> = { personal_ingreso: null, personal_retiro: null };
  const vistos = new Map<string, number[]>();

  let i = iSub + 1;
  let filasDatos = 0;
  for (; i < hoja.filas.length; i++) {
    const f = hoja.filas[i];
    const etiqueta = f[0];
    if (normalizarTexto(etiqueta) === "TOTAL GENERAL") break;
    if (esVacio(etiqueta)) break;
    const concepto = limpiarConcepto(etiqueta);
    filasDatos++;
    const clave = normalizarTexto(concepto);
    vistos.set(clave, [...(vistos.get(clave) ?? []), filaExcel(hoja, i)]);

    for (const c of columnas) {
      const n = leerNumero(f[c.col]);
      if (n === null) continue;
      const seccion: Seccion = c.tipo === "ingreso" ? "personal_ingreso" : "personal_retiro";
      if (Number.isNaN(n)) {
        r.problemas.push(problema(hoja, i, c.col, f[c.col], seccion));
        continue;
      }
      r.hechos.push({
        seccion,
        concepto,
        nit: null,
        mes: c.mes,
        valor: n,
        unidad: "personas",
        hoja_origen: hoja.nombre,
        fila_origen: filaExcel(hoja, i),
        columna_origen: letraColumna(hoja, c.col),
      });
      ultimo[seccion] = Math.max(ultimo[seccion] ?? 0, c.mes);
    }
  }

  for (const [, filas] of vistos) {
    if (filas.length > 1) {
      // En personal las variantes (p. ej. "MEDICO GENERAL " con espacio) son cargos distintos en la nómina;
      // se reportan como aviso, nunca como duplicado idéntico.
      const concepto = limpiarConcepto(hoja.filas[filas[0] - hoja.filaBase - 1]?.[0]);
      r.duplicados.push({ seccion: "personal_ingreso", hoja: hoja.nombre, concepto, filas, identicos: false });
    }
  }

  const filaFin = filaExcel(hoja, i - 1);
  r.tablas.push({
    seccion: "personal_ingreso",
    hoja: hoja.nombre,
    filaEncabezado: filaExcel(hoja, iSub),
    filaInicio: filaExcel(hoja, iSub + 1),
    filaFin,
    meses: mesesIng,
    ultimoMes: ultimo.personal_ingreso,
    filasDatos,
  });
  r.tablas.push({
    seccion: "personal_retiro",
    hoja: hoja.nombre,
    filaEncabezado: filaExcel(hoja, iSub),
    filaInicio: filaExcel(hoja, iSub + 1),
    filaFin,
    meses: mesesRet,
    ultimoMes: ultimo.personal_retiro,
    filasDatos,
  });
}

// ---------------------------------------------------------------------------
// Tablas genéricas "concepto | mes | mes | ... | Total general"
// ---------------------------------------------------------------------------

/** Busca, entre `desde` y `hasta`, la primera fila que parece un encabezado de meses. */
function buscarEncabezado(hoja: Hoja, desde: number, hasta: number): Encabezado | null {
  for (let i = desde; i < hasta; i++) {
    const enc = detectarEncabezado(hoja.filas[i], i);
    if (enc) return enc;
  }
  return null;
}

function detectarEncabezado(fila: Fila | undefined, indiceFila: number): Encabezado | null {
  if (!fila) return null;

  // Caso cartera: "NIT | ENTIDAD | ENERO | ...". Caso general: "etiqueta | ene | feb | ...".
  const normalizadas = fila.map(normalizarTexto);
  const colNit = normalizadas.indexOf("NIT");
  const colEntidad = normalizadas.indexOf("ENTIDAD");
  let colConcepto = 0;
  let colNitFinal: number | null = null;
  if (colNit >= 0 && colEntidad >= 0 && colEntidad === colNit + 1) {
    colConcepto = colEntidad;
    colNitFinal = colNit;
  }

  if (typeof fila[colConcepto] !== "string" || normalizadas[colConcepto] === "") return null;

  const meses: ColumnaMes[] = [];
  let colTotal: number | null = null;
  for (let j = colConcepto + 1; j < fila.length; j++) {
    const c = fila[j];
    if (esVacio(c)) break;
    if (normalizadas[j] === "TOTAL GENERAL") {
      colTotal = j;
      break;
    }
    const m = mesDesdeEncabezado(c);
    if (m === null) break;
    if (meses.length && m <= meses[meses.length - 1].mes) return null; // no es un encabezado de meses
    meses.push({ mes: m, columna: j });
  }

  if (meses.length < 2) return null;
  return { indiceFila, colConcepto, colNit: colNitFinal, meses, colTotal };
}

/**
 * Lee las filas de datos bajo un encabezado hasta la fila "Total general" (o una fila sin
 * concepto). Devuelve el índice de la última fila consumida.
 */
function leerTabla(hoja: Hoja, enc: Encabezado, seccion: Seccion, unidad: Unidad, r: ResultadoParser): number {
  const sumas = new Map<number, number>();
  const vistos = new Map<string, { concepto: string; filas: number[]; valores: string[] }>();
  let ultimoMes: number | null = null;
  let filasDatos = 0;
  let totales: Fila | null = null;

  let i = enc.indiceFila + 1;
  for (; i < hoja.filas.length; i++) {
    const f = hoja.filas[i] ?? [];
    const etiqueta = f[enc.colConcepto];
    const esTotal = normalizarTexto(etiqueta) === "TOTAL GENERAL";
    const hayValores = enc.meses.some((m) => !esVacio(f[m.columna]));

    if (esTotal) {
      totales = f;
      break;
    }
    if (esVacio(etiqueta)) {
      if (hayValores) totales = f; // fila de totales sin etiqueta (hoja cartera)
      break;
    }

    const concepto = limpiarConcepto(etiqueta);
    const nit = enc.colNit !== null ? normalizarNit(f[enc.colNit]) : null;
    filasDatos++;
    const valoresFila: string[] = [];

    for (const { mes, columna } of enc.meses) {
      const n = leerNumero(f[columna]);
      if (n === null) {
        valoresFila.push("");
        continue;
      }
      if (Number.isNaN(n)) {
        r.problemas.push(problema(hoja, i, columna, f[columna], seccion));
        valoresFila.push("?");
        continue;
      }
      valoresFila.push(String(n));
      r.hechos.push({
        seccion,
        concepto,
        nit,
        mes,
        valor: n,
        unidad,
        hoja_origen: hoja.nombre,
        fila_origen: filaExcel(hoja, i),
        columna_origen: letraColumna(hoja, columna),
      });
      sumas.set(mes, (sumas.get(mes) ?? 0) + n);
      ultimoMes = Math.max(ultimoMes ?? 0, mes);
    }

    const clave = normalizarTexto(concepto);
    const previo = vistos.get(clave);
    if (previo) {
      previo.filas.push(filaExcel(hoja, i));
      previo.valores.push(valoresFila.join("|"));
    } else {
      vistos.set(clave, { concepto, filas: [filaExcel(hoja, i)], valores: [valoresFila.join("|")] });
    }
  }

  for (const v of vistos.values()) {
    if (v.filas.length > 1) {
      const identicos = v.valores.every((x) => x === v.valores[0]);
      r.duplicados.push({ seccion, hoja: hoja.nombre, concepto: v.concepto, filas: v.filas, identicos });
    }
  }

  if (totales) {
    for (const { mes, columna } of enc.meses) {
      const t = leerNumero(totales[columna]);
      if (t === null || Number.isNaN(t)) continue;
      r.comparacionesTotales.push({ seccion, hoja: hoja.nombre, mes, totalFila: t, sumaFilas: sumas.get(mes) ?? 0 });
    }
  }

  r.tablas.push({
    seccion,
    hoja: hoja.nombre,
    filaEncabezado: filaExcel(hoja, enc.indiceFila),
    filaInicio: filaExcel(hoja, enc.indiceFila + 1),
    filaFin: filaExcel(hoja, Math.max(enc.indiceFila + 1, i)),
    meses: enc.meses,
    ultimoMes,
    filasDatos,
  });

  return i;
}

// ---------------------------------------------------------------------------
// Utilidades de hoja
// ---------------------------------------------------------------------------

function cargarHoja(libro: XLSX.WorkBook, nombreNormalizado: string): Hoja | null {
  const nombre = libro.SheetNames.find((n) => normalizarTexto(n) === nombreNormalizado);
  if (!nombre) return null;
  const ws = libro.Sheets[nombre];
  const ref = ws["!ref"];
  if (!ref) return { nombre, filas: [], filaBase: 0, columnaBase: 0 };
  const rango = XLSX.utils.decode_range(ref);
  const filas = XLSX.utils.sheet_to_json<Fila>(ws, { header: 1, raw: true, defval: null, blankrows: true });
  return { nombre, filas, filaBase: rango.s.r, columnaBase: rango.s.c };
}

/** Índice dentro de `filas` → número de fila de Excel (1-based, respetando el rango). */
function filaExcel(hoja: Hoja, indice: number): number {
  return hoja.filaBase + indice + 1;
}

function letraColumna(hoja: Hoja, indice: number): string {
  return XLSX.utils.encode_col(hoja.columnaBase + indice);
}

function problema(hoja: Hoja, indiceFila: number, columna: number, valor: Celda, seccion: Seccion): ProblemaCelda {
  return {
    hoja: hoja.nombre,
    fila: filaExcel(hoja, indiceFila),
    columna: letraColumna(hoja, columna),
    valor: String(valor).slice(0, 40),
    seccion,
  };
}

export { type ComparacionTotal, type Duplicado, type Hecho, type ResultadoParser, type TablaDetectada };

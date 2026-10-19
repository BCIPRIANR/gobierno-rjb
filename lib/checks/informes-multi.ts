import type { ResultadoParser, Seccion } from "@/lib/parser/tipos";
import { NOMBRE_MES } from "@/lib/parser/texto";
import type { Evaluacion, ResultadoCheck } from "./tipos";

/** Diferencia máxima (en pesos) tolerada entre un total y la suma de sus partes. */
const TOLERANCIA_PESOS = 1;

const NOMBRE_SECCION: Record<Seccion | "total_recaudo", string> = {
  ingresos: "INGRESOS",
  costos_gastos: "COSTOS Y GASTOS",
  recaudo_entidad: "RECAUDO por entidad",
  recaudo_medio_pago: "RECAUDO por medio de pago",
  pagos: "PAGOS",
  cartera: "cartera",
  personal_ingreso: "TD ING RET (ingresos de personal)",
  personal_retiro: "TD ING RET (retiros de personal)",
  planta: "planta",
  total_recaudo: "fila TOTAL RECAUDO",
};

const SECCIONES_REQUERIDAS: (Seccion | "total_recaudo")[] = [
  "ingresos",
  "costos_gastos",
  "recaudo_entidad",
  "recaudo_medio_pago",
  "total_recaudo",
  "pagos",
  "cartera",
  "personal_ingreso",
  "personal_retiro",
];

function mes(n: number): string {
  return NOMBRE_MES[n] ?? String(n);
}

function pesos(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

/**
 * Controles de integridad de una carga INFORMES MULTI. Un check de nivel `error` que
 * falla rechaza la carga; los de nivel `aviso` quedan registrados pero no bloquean.
 * @param periodo fecha `YYYY-MM-01` declarada por el contador.
 */
export function evaluarInformesMulti(parser: ResultadoParser, periodo: string): Evaluacion {
  const checks: ResultadoCheck[] = [];
  const mesPeriodo = Number(periodo.slice(5, 7));

  // 1. Secciones encontradas
  const faltantes = SECCIONES_REQUERIDAS.filter((s) => parser.faltantes.some((f) => f.seccion === s));
  if (faltantes.length === 0) {
    checks.push({
      codigo: "secciones",
      ok: true,
      nivel: "error",
      mensaje: `Se encontraron las ${SECCIONES_REQUERIDAS.length} secciones esperadas (TD, cartera y TD ING RET).`,
    });
  } else {
    const detalle = faltantes
      .map((s) => {
        const motivo = parser.faltantes.find((f) => f.seccion === s)?.motivo ?? "";
        return `${NOMBRE_SECCION[s]}: ${motivo}`;
      })
      .join("; ");
    checks.push({
      codigo: "secciones",
      ok: false,
      nivel: "error",
      mensaje: `Faltan secciones en el archivo. ${detalle}. Revisa que las hojas y los títulos no hayan cambiado.`,
    });
  }

  // 2. Sin valores no numéricos
  if (parser.problemas.length === 0) {
    checks.push({ codigo: "valores_numericos", ok: true, nivel: "error", mensaje: "Todas las celdas de valores son numéricas." });
  } else {
    const ejemplos = parser.problemas
      .slice(0, 3)
      .map((p) => `${p.hoja}!${p.columna}${p.fila} ("${p.valor}")`)
      .join(", ");
    const extra = parser.problemas.length > 3 ? ` y ${parser.problemas.length - 3} más` : "";
    checks.push({
      codigo: "valores_numericos",
      ok: false,
      nivel: "error",
      mensaje: `Hay ${parser.problemas.length} celdas con texto donde debería haber un número: ${ejemplos}${extra}. Corrige esas celdas y vuelve a subir.`,
    });
  }

  // 3. Sin duplicados
  const identicos = parser.duplicados.filter((d) => d.identicos);
  const variantes = parser.duplicados.filter((d) => !d.identicos);
  if (identicos.length > 0) {
    const detalle = identicos
      .slice(0, 3)
      .map((d) => `"${d.concepto}" en ${NOMBRE_SECCION[d.seccion]} (filas ${d.filas.join(" y ")})`)
      .join("; ");
    checks.push({
      codigo: "duplicados",
      ok: false,
      nivel: "error",
      mensaje: `Hay filas repetidas con los mismos valores: ${detalle}. Elimina la fila duplicada y vuelve a subir.`,
    });
  } else {
    checks.push({ codigo: "duplicados", ok: true, nivel: "error", mensaje: "No hay filas repetidas." });
  }
  if (variantes.length > 0) {
    const detalle = variantes
      .slice(0, 4)
      .map((d) => `"${d.concepto}" en ${NOMBRE_SECCION[d.seccion]} (filas ${d.filas.join(", ")})`)
      .join("; ");
    checks.push({
      codigo: "conceptos_repetidos",
      ok: true,
      nivel: "aviso",
      mensaje: `Conceptos que aparecen más de una vez con valores distintos (suelen ser espacios o mayúsculas): ${detalle}. Se suman al calcular; conviene unificar el nombre en el origen.`,
    });
  }

  // 4. TOTAL RECAUDO cuadra con entidad + medio de pago
  if (parser.totalRecaudo) {
    const sumaPorMes = (seccion: Seccion, m: number) =>
      parser.hechos.filter((h) => h.seccion === seccion && h.mes === m).reduce((acc, h) => acc + h.valor, 0);
    const descuadres: string[] = [];
    for (const { mes: m, valor } of parser.totalRecaudo.porMes) {
      const esperado = sumaPorMes("recaudo_entidad", m) + sumaPorMes("recaudo_medio_pago", m);
      if (Math.abs(esperado - valor) > TOLERANCIA_PESOS) {
        descuadres.push(`${mes(m)}: la fila dice ${pesos(valor)} y la suma da ${pesos(esperado)}`);
      }
    }
    if (descuadres.length === 0) {
      const meses = parser.totalRecaudo.porMes.map((x) => mes(x.mes)).join(", ");
      checks.push({
        codigo: "total_recaudo",
        ok: true,
        nivel: "error",
        mensaje: `La fila TOTAL RECAUDO coincide con recaudo por entidad + recaudo por medio de pago (${meses}).`,
      });
    } else {
      checks.push({
        codigo: "total_recaudo",
        ok: false,
        nivel: "error",
        mensaje: `La fila TOTAL RECAUDO no cuadra con la suma de recaudo por entidad y por medio de pago. ${descuadres.join("; ")}. Revisa las tablas dinámicas de RECAUDO.`,
      });
    }
  } else if (faltantes.length === 0) {
    checks.push({ codigo: "total_recaudo", ok: false, nivel: "error", mensaje: "No se pudo leer la fila TOTAL RECAUDO." });
  }

  // 5. Último mes con datos coincide con el periodo declarado
  const tabla = (s: Seccion) => parser.tablas.find((t) => t.seccion === s);
  const ultimoIngresos = tabla("ingresos")?.ultimoMes ?? null;
  const ultimoGlobal = parser.tablas.reduce<number | null>(
    (acc, t) => (t.ultimoMes === null ? acc : Math.max(acc ?? 0, t.ultimoMes)),
    null,
  );

  if (ultimoIngresos === null) {
    checks.push({
      codigo: "ultimo_mes",
      ok: false,
      nivel: "error",
      mensaje: "La sección INGRESOS no tiene ningún valor. Revisa que la tabla dinámica esté actualizada.",
    });
  } else if (ultimoGlobal !== null && ultimoGlobal > mesPeriodo) {
    checks.push({
      codigo: "ultimo_mes",
      ok: false,
      nivel: "error",
      mensaje: `El archivo trae datos hasta ${mes(ultimoGlobal)} pero el periodo elegido es ${mes(mesPeriodo)}. Elige el periodo correcto o quita los meses posteriores.`,
    });
  } else if (ultimoIngresos < mesPeriodo) {
    checks.push({
      codigo: "ultimo_mes",
      ok: false,
      nivel: "error",
      mensaje: `El periodo elegido es ${mes(mesPeriodo)} pero los INGRESOS solo llegan hasta ${mes(ultimoIngresos)}. Actualiza la tabla dinámica o elige ${mes(ultimoIngresos)} como periodo.`,
    });
  } else {
    checks.push({
      codigo: "ultimo_mes",
      ok: true,
      nivel: "error",
      mensaje: `Los INGRESOS llegan hasta ${mes(ultimoIngresos)}, igual que el periodo elegido.`,
    });
    const atrasadas = parser.tablas
      .filter((t) => t.ultimoMes !== null && t.ultimoMes < mesPeriodo)
      .map((t) => `${NOMBRE_SECCION[t.seccion]} hasta ${mes(t.ultimoMes as number)}`);
    if (atrasadas.length > 0) {
      checks.push({
        codigo: "secciones_atrasadas",
        ok: true,
        nivel: "aviso",
        mensaje: `Secciones sin datos de ${mes(mesPeriodo)}: ${atrasadas.join("; ")}. Los KPI que dependan de ellas quedarán en N/D para ese mes.`,
      });
    }
  }

  // 6. Totales de cada tabla (aviso): la fila "Total general" vs la suma de filas
  const descuadresTotales = parser.comparacionesTotales.filter(
    (c) => Math.abs(c.totalFila - c.sumaFilas) > TOLERANCIA_PESOS,
  );
  if (descuadresTotales.length > 0) {
    const detalle = descuadresTotales
      .slice(0, 3)
      .map((c) => `${NOMBRE_SECCION[c.seccion]} ${mes(c.mes)}: total ${pesos(c.totalFila)} vs suma ${pesos(c.sumaFilas)}`)
      .join("; ");
    checks.push({
      codigo: "totales_filas",
      ok: true,
      nivel: "aviso",
      mensaje: `La fila "Total general" no coincide con la suma de las filas en: ${detalle}. Se usan las filas, no el total.`,
    });
  }

  for (const nota of parser.notas) {
    checks.push({ codigo: "nota_parser", ok: true, nivel: "aviso", mensaje: nota });
  }

  const errores = checks.filter((c) => c.nivel === "error" && !c.ok);
  return {
    estado: errores.length === 0 ? "aceptada" : "rechazada",
    checks,
    motivoRechazo: errores.length === 0 ? null : errores.map((c) => c.mensaje).join(" · "),
    ultimoMesDatos: ultimoIngresos,
  };
}

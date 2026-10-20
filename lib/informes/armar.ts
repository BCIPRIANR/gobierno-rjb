import { acumuladoAnual, variacionMensual, type ResultadoMes } from "@/lib/kpi/comparar";
import { estadoGeneral, evaluarSemaforo, type ColorSemaforo, type Sentido } from "@/lib/kpi/semaforo";
import { periodoAnteriorDe } from "@/lib/kpi/calcular";
import {
  formatearCOPMillones,
  formatearPeriodo,
  formatearPorcentaje,
  formatearPuntosPorcentuales,
  formatearValorKpi,
  formatearVariacion,
  type UnidadKpi,
} from "@/lib/formato";

/**
 * Armado de las secciones automáticas del informe de Junta (función pura).
 * Todo valor viene de kpi_resultados / hechos_financieros ya calculados; lo que
 * falta queda como N/D con motivo. El resultado se guarda tal cual en
 * `informes_junta.datos` para que el informe sea reproducible y trazable.
 */

export type DefinicionInforme = {
  codigo: string;
  nombre: string;
  unidad: UnidadKpi;
  sentido: Sentido;
  definicion: string;
};

export type CargaOrigen = { id: string; version: number; caracter: "preliminar" | "definitivo"; periodo: string; subido_en: string };

export type EntradaInforme = {
  empresa: { id: string; nombre: string; es_demo: boolean };
  /** `YYYY-MM-01` */
  periodo: string;
  definiciones: DefinicionInforme[];
  /** Resultados del año del periodo (todos los KPI). */
  resultados: ResultadoMes[];
  /** Motivo N/D por KPI para el periodo. */
  motivosNd: Record<string, string | null>;
  /** Metas del periodo por KPI. */
  metas: Record<string, number>;
  carga: CargaOrigen | null;
  /** Cartera por concepto del periodo y del mes anterior (de la carga de origen). */
  cartera: { actual: { concepto: string; valor: number }[]; anterior: { concepto: string; valor: number }[] };
};

export type GrupoIndicador = "VENTAS Y RENTABILIDAD" | "CAJA" | "CARTERA" | "PERSONAL";

export type IndicadorInforme = {
  codigo: string;
  nombre: string;
  grupo: GrupoIndicador;
  unidad: UnidadKpi;
  sentido: Sentido;
  mes: { valor: number | null; estado: string; texto: string; motivoNd: string | null };
  acumulado: { texto: string };
  variacion: { texto: string; valor: number | null };
  meta: { valor: number | null; texto: string };
  semaforo: { color: ColorSemaforo; motivo: string };
};

export type DatosInforme = {
  version: 1;
  empresa: { id: string; nombre: string; es_demo: boolean };
  periodo: string;
  periodoTexto: string;
  origen: CargaOrigen | null;
  estadoGeneral: ReturnType<typeof estadoGeneral>;
  indicadores: IndicadorInforme[];
  caja: {
    recaudo: { texto: string; valor: number | null };
    liquidezMinima: { texto: string; valor: number | null; motivo: string };
    excedente: { texto: string; valor: number | null; motivo: string };
  };
  cartera: {
    edades: { disponible: false; motivo: string };
    total: { texto: string; valor: number | null };
    top5: { concepto: string; valor: number; texto: string; participacion: string; cambio: string }[];
  };
  pendientes: string[];
};

const GRUPO: Record<string, GrupoIndicador> = {
  ingresos: "VENTAS Y RENTABILIDAD",
  costos_gastos: "VENTAS Y RENTABILIDAD",
  excedente: "VENTAS Y RENTABILIDAD",
  pct_costos_ingresos: "VENTAS Y RENTABILIDAD",
  recaudo_total: "CAJA",
  eficiencia_recaudo: "CAJA",
  pagos: "CAJA",
  flujo_neto: "CAJA",
  cartera_total: "CARTERA",
  var_cartera: "CARTERA",
  concentracion_top5: "CARTERA",
  personal_ingresos: "PERSONAL",
  personal_retiros: "PERSONAL",
};

const ORDEN = Object.keys(GRUPO);

export function armarDatosInforme(e: EntradaInforme): DatosInforme {
  const pendientes: string[] = [];

  const indicadores: IndicadorInforme[] = ORDEN.flatMap((codigo) => {
    const def = e.definiciones.find((d) => d.codigo === codigo);
    if (!def) return [];
    const r = e.resultados.find((x) => x.kpi_codigo === codigo && x.periodo === e.periodo);
    const valor = r && r.estado !== "nd" ? r.valor : null;
    const meta = e.metas[codigo] ?? null;
    const semaforo = evaluarSemaforo({ codigo, valor, meta, sentido: def.sentido });
    const acumulado = acumuladoAnual(codigo, e.periodo, e.resultados);
    const variacion = variacionMensual(codigo, def.unidad, e.periodo, e.resultados);

    return [
      {
        codigo,
        nombre: def.nombre,
        grupo: GRUPO[codigo],
        unidad: def.unidad,
        sentido: def.sentido,
        mes: {
          valor,
          estado: r?.estado ?? "nd",
          texto: valor === null ? "N/D" : formatearValorKpi(valor, def.unidad),
          motivoNd: valor === null ? (e.motivosNd[codigo] ?? (r ? "Sin dato." : `Sin resultado para ${formatearPeriodo(e.periodo)}.`)) : null,
        },
        acumulado: {
          texto:
            acumulado.tipo === "suma" || acumulado.tipo === "razon"
              ? formatearValorKpi(acumulado.valor, def.unidad)
              : acumulado.tipo === "ninguno"
                ? "No aplica"
                : "N/D",
        },
        variacion: {
          texto:
            variacion.tipo === "relativa"
              ? formatearVariacion(variacion.valor)
              : variacion.tipo === "puntos"
                ? formatearPuntosPorcentuales(variacion.valor)
                : variacion.tipo === "absoluta"
                  ? `${variacion.valor > 0 ? "+" : ""}${formatearValorKpi(variacion.valor, def.unidad)}`
                  : "N/D",
          valor: variacion.tipo === "nd" ? null : variacion.valor,
        },
        meta: { valor: meta, texto: meta === null ? "Sin meta definida" : formatearValorKpi(meta, def.unidad) },
        semaforo: { color: semaforo.color, motivo: semaforo.motivo },
      },
    ];
  });

  const porCodigo = new Map(indicadores.map((i) => [i.codigo, i]));
  const recaudo = porCodigo.get("recaudo_total");

  // Caja: liquidez mínima requerida aún no viene en el archivo → N/D explícito (nunca 0).
  const motivoLiquidez = "La liquidez mínima requerida todavía no está en el formato de carga; se define con el analista.";
  pendientes.push("Liquidez mínima requerida: pendiente de incluir en el formato mensual.");
  pendientes.push("Cartera por edades: pendiente de incluir en el formato mensual.");

  // Cartera: total y 5 mayores deudores con cambio vs mes anterior.
  const totalCartera = porCodigo.get("cartera_total");
  const anterior = new Map<string, number>();
  for (const c of e.cartera.anterior) {
    const k = c.concepto.trim().toUpperCase();
    anterior.set(k, (anterior.get(k) ?? 0) + c.valor);
  }
  const agregada = new Map<string, { concepto: string; valor: number }>();
  let sumaCartera = 0;
  for (const c of e.cartera.actual) {
    const k = c.concepto.trim().toUpperCase();
    const acc = agregada.get(k) ?? { concepto: c.concepto.trim(), valor: 0 };
    acc.valor += c.valor;
    agregada.set(k, acc);
    sumaCartera += c.valor;
  }
  const top5 = [...agregada.entries()]
    .sort((a, b) => b[1].valor - a[1].valor)
    .slice(0, 5)
    .map(([k, c]) => {
      const prev = anterior.get(k);
      return {
        concepto: c.concepto,
        valor: c.valor,
        texto: formatearCOPMillones(c.valor),
        participacion: sumaCartera !== 0 ? formatearPorcentaje(c.valor / sumaCartera) : "N/D",
        cambio: prev === undefined ? "N/D (sin mes anterior)" : prev === 0 ? "N/D (mes anterior en 0)" : formatearVariacion((c.valor - prev) / Math.abs(prev)),
      };
    });

  const conSemaforo = indicadores.map((i) => i.semaforo.color);

  return {
    version: 1,
    empresa: e.empresa,
    periodo: e.periodo,
    periodoTexto: formatearPeriodo(e.periodo),
    origen: e.carga,
    estadoGeneral: estadoGeneral(conSemaforo),
    indicadores,
    caja: {
      recaudo: { texto: recaudo?.mes.texto ?? "N/D", valor: recaudo?.mes.valor ?? null },
      liquidezMinima: { texto: "N/D", valor: null, motivo: motivoLiquidez },
      excedente: { texto: "N/D", valor: null, motivo: "No se puede calcular sin la liquidez mínima requerida." },
    },
    cartera: {
      edades: { disponible: false, motivo: "La cartera por edades todavía no está en el formato de carga; se define con el analista." },
      total: { texto: totalCartera?.mes.texto ?? "N/D", valor: totalCartera?.mes.valor ?? null },
      top5,
    },
    pendientes,
  };
}

/** Mes anterior al periodo (para el cambio de cartera). */
export { periodoAnteriorDe };

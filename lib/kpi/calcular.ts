import type { Seccion } from "@/lib/parser/tipos";
import type { Json } from "@/lib/supabase/tipos";

/**
 * Cálculo de KPI mensuales a partir de hechos_financieros (función pura).
 *
 * Principios (CLAUDE.md): ningún número sin fuente; un dato faltante nunca es 0 →
 * `estado = 'nd'` con `motivo_nd`. Cada resultado guarda sus `insumos` (valores y
 * carga usados) y la versión de la fórmula.
 */

export type HechoAgregable = {
  seccion: Seccion;
  concepto: string;
  /** `YYYY-MM-01` */
  periodo: string;
  valor: number;
};

export type DefinicionKpi = {
  codigo: string;
  unidad: "cop" | "pct" | "x" | "dias" | "personas";
  version: number;
  activo: boolean;
};

export type EstadoResultado = "real" | "calculado" | "nd";

export type ResultadoKpi = {
  kpi_codigo: string;
  periodo: string;
  valor: number | null;
  estado: EstadoResultado;
  motivo_nd: string | null;
  insumos: Json;
  formula_version: number;
};

/** Cómo se acumula el KPI en el año: suma de meses, razón de sumas, o no aplica (saldos y variaciones). */
export type TipoAcumulado = "suma" | "razon" | "ninguno";

export const TIPO_ACUMULADO: Record<string, TipoAcumulado> = {
  ingresos: "suma",
  costos_gastos: "suma",
  pct_costos_ingresos: "razon",
  excedente: "suma",
  recaudo_total: "suma",
  eficiencia_recaudo: "razon",
  pagos: "suma",
  flujo_neto: "suma",
  cartera_total: "ninguno",
  var_cartera: "ninguno",
  concentracion_top5: "ninguno",
  personal_ingresos: "suma",
  personal_retiros: "suma",
};

type Agregado = { valor: number; hechos: number };

type Contexto = {
  periodo: string;
  periodoAnterior: string;
  /** Suma de una sección en un periodo; null si no hay ningún hecho. */
  suma: (seccion: Seccion, periodo?: string) => Agregado | null;
  /** Suma de los 5 mayores valores de una sección en el periodo. */
  top5: (seccion: Seccion) => Agregado | null;
};

type Salida =
  | { estado: "real" | "calculado"; valor: number; insumos: Record<string, Json> }
  | { estado: "nd"; motivo: string; insumos: Record<string, Json> };

const NOMBRE_SECCION: Record<Seccion, string> = {
  ingresos: "INGRESOS",
  costos_gastos: "COSTOS Y GASTOS",
  recaudo_entidad: "RECAUDO por entidad",
  recaudo_medio_pago: "RECAUDO por medio de pago",
  pagos: "PAGOS",
  cartera: "cartera",
  personal_ingreso: "ingresos de personal",
  personal_retiro: "retiros de personal",
  planta: "planta",
};

function nd(motivo: string, insumos: Record<string, Json> = {}): Salida {
  return { estado: "nd", motivo, insumos };
}

function sinDatos(seccion: Seccion, periodo: string): string {
  return `No hay datos de ${NOMBRE_SECCION[seccion]} para ${periodo.slice(0, 7)} en la carga vigente.`;
}

function agregado(a: Agregado): Json {
  return { valor: a.valor, hechos: a.hechos };
}

/** Suma directa de una sección: estado `real` porque son valores del archivo. */
function sumaSeccion(seccion: Seccion): (c: Contexto) => Salida {
  return (c) => {
    const a = c.suma(seccion);
    if (!a) return nd(sinDatos(seccion, c.periodo));
    return { estado: "real", valor: a.valor, insumos: { [seccion]: agregado(a) } };
  };
}

/** Razón entre dos sumas: `calculado`; N/D si falta alguna o el denominador es 0. */
function razon(numerador: Seccion, denominador: Seccion): (c: Contexto) => Salida {
  return (c) => {
    const n = c.suma(numerador);
    const d = c.suma(denominador);
    if (!n) return nd(sinDatos(numerador, c.periodo));
    if (!d) return nd(sinDatos(denominador, c.periodo));
    const insumos = { numerador: { seccion: numerador, ...agregado(n) as object } as Json, denominador: { seccion: denominador, ...agregado(d) as object } as Json };
    if (d.valor === 0) return nd(`${NOMBRE_SECCION[denominador]} suma 0 en ${c.periodo.slice(0, 7)}; no se puede dividir.`, insumos);
    return { estado: "calculado", valor: n.valor / d.valor, insumos };
  };
}

const FORMULAS: Record<string, (c: Contexto) => Salida> = {
  ingresos: sumaSeccion("ingresos"),
  costos_gastos: sumaSeccion("costos_gastos"),
  pagos: sumaSeccion("pagos"),
  cartera_total: sumaSeccion("cartera"),
  personal_ingresos: sumaSeccion("personal_ingreso"),
  personal_retiros: sumaSeccion("personal_retiro"),

  pct_costos_ingresos: razon("costos_gastos", "ingresos"),
  eficiencia_recaudo: razon("recaudo_entidad", "ingresos"),

  excedente: (c) => {
    const i = c.suma("ingresos");
    const g = c.suma("costos_gastos");
    if (!i) return nd(sinDatos("ingresos", c.periodo));
    if (!g) return nd(sinDatos("costos_gastos", c.periodo));
    return { estado: "calculado", valor: i.valor - g.valor, insumos: { ingresos: agregado(i), costos_gastos: agregado(g) } };
  },

  recaudo_total: (c) => {
    const e = c.suma("recaudo_entidad");
    const m = c.suma("recaudo_medio_pago");
    if (!e) return nd(sinDatos("recaudo_entidad", c.periodo));
    if (!m) return nd(sinDatos("recaudo_medio_pago", c.periodo), { recaudo_entidad: agregado(e) });
    return { estado: "calculado", valor: e.valor + m.valor, insumos: { recaudo_entidad: agregado(e), recaudo_medio_pago: agregado(m) } };
  },

  flujo_neto: (c) => {
    const e = c.suma("recaudo_entidad");
    const m = c.suma("recaudo_medio_pago");
    const p = c.suma("pagos");
    if (!e) return nd(sinDatos("recaudo_entidad", c.periodo));
    if (!m) return nd(sinDatos("recaudo_medio_pago", c.periodo));
    if (!p) return nd(sinDatos("pagos", c.periodo));
    return {
      estado: "calculado",
      valor: e.valor + m.valor - p.valor,
      insumos: { recaudo_entidad: agregado(e), recaudo_medio_pago: agregado(m), pagos: agregado(p) },
    };
  },

  var_cartera: (c) => {
    const actual = c.suma("cartera");
    const anterior = c.suma("cartera", c.periodoAnterior);
    if (!actual) return nd(sinDatos("cartera", c.periodo));
    if (!anterior) return nd(`No hay cartera de ${c.periodoAnterior.slice(0, 7)} para comparar.`, { cartera: agregado(actual) });
    const insumos = { cartera: agregado(actual), cartera_anterior: { periodo: c.periodoAnterior, ...agregado(anterior) as object } as Json };
    if (anterior.valor === 0) return nd(`La cartera de ${c.periodoAnterior.slice(0, 7)} es 0; no se puede calcular la variación.`, insumos);
    return { estado: "calculado", valor: actual.valor / anterior.valor - 1, insumos };
  },

  concentracion_top5: (c) => {
    const total = c.suma("cartera");
    const top = c.top5("cartera");
    if (!total || !top) return nd(sinDatos("cartera", c.periodo));
    const insumos = { cartera_top5: agregado(top), cartera_total: agregado(total) };
    if (total.valor === 0) return nd(`La cartera total de ${c.periodo.slice(0, 7)} es 0; no se puede calcular la concentración.`, insumos);
    return { estado: "calculado", valor: top.valor / total.valor, insumos };
  },
};

export function periodoAnteriorDe(periodo: string): string {
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(5, 7));
  const d = new Date(Date.UTC(anio, mes - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Calcula todos los KPI activos para cada periodo presente en los hechos.
 * @param cargaId se guarda en los insumos para trazabilidad.
 */
export function calcularKpis(hechos: HechoAgregable[], definiciones: DefinicionKpi[], cargaId: string): ResultadoKpi[] {
  // Índice: periodo → sección → {suma, n, valores}
  const indice = new Map<string, Map<Seccion, { valor: number; hechos: number; valores: number[] }>>();
  for (const h of hechos) {
    let porSeccion = indice.get(h.periodo);
    if (!porSeccion) {
      porSeccion = new Map();
      indice.set(h.periodo, porSeccion);
    }
    const acc = porSeccion.get(h.seccion) ?? { valor: 0, hechos: 0, valores: [] };
    acc.valor += h.valor;
    acc.hechos += 1;
    acc.valores.push(h.valor);
    porSeccion.set(h.seccion, acc);
  }

  const periodos = [...indice.keys()].sort();
  const resultados: ResultadoKpi[] = [];

  for (const periodo of periodos) {
    const ctx: Contexto = {
      periodo,
      periodoAnterior: periodoAnteriorDe(periodo),
      suma: (seccion, p = periodo) => {
        const a = indice.get(p)?.get(seccion);
        return a ? { valor: a.valor, hechos: a.hechos } : null;
      },
      top5: (seccion) => {
        const a = indice.get(periodo)?.get(seccion);
        if (!a) return null;
        const top = [...a.valores].sort((x, y) => y - x).slice(0, 5);
        return { valor: top.reduce((s, v) => s + v, 0), hechos: top.length };
      },
    };

    for (const def of definiciones) {
      if (!def.activo) continue;
      const formula = FORMULAS[def.codigo];
      const base = { kpi_codigo: def.codigo, periodo, formula_version: def.version };
      if (!formula) {
        resultados.push({
          ...base,
          valor: null,
          estado: "nd",
          motivo_nd: `La fórmula "${def.codigo}" no está implementada en el sistema.`,
          insumos: { carga_id: cargaId },
        });
        continue;
      }
      const salida = formula(ctx);
      const insumos: Json = { carga_id: cargaId, ...salida.insumos };
      if (salida.estado === "nd") {
        resultados.push({ ...base, valor: null, estado: "nd", motivo_nd: salida.motivo, insumos });
      } else {
        resultados.push({ ...base, valor: salida.valor, estado: salida.estado, motivo_nd: null, insumos });
      }
    }
  }

  return resultados;
}

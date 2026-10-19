import { describe, expect, it } from "vitest";
import { calcularKpis, periodoAnteriorDe, type DefinicionKpi, type HechoAgregable } from "@/lib/kpi/calcular";
import { acumuladoAnual, serieAnual, variacionMensual, type ResultadoMes } from "@/lib/kpi/comparar";
import {
  formatearCOPMillones,
  formatearPorcentaje,
  formatearPuntosPorcentuales,
  formatearRatio,
  formatearVariacion,
  formatearValorKpi,
} from "@/lib/formato";

const DEFS: DefinicionKpi[] = [
  "ingresos", "costos_gastos", "pct_costos_ingresos", "excedente", "recaudo_total", "eficiencia_recaudo",
  "pagos", "flujo_neto", "cartera_total", "var_cartera", "concentracion_top5", "personal_ingresos", "personal_retiros",
].map((codigo) => ({
  codigo,
  unidad: codigo.startsWith("pct") || codigo === "eficiencia_recaudo" || codigo === "var_cartera" || codigo === "concentracion_top5" ? "pct" : codigo.startsWith("personal") ? "personas" : "cop",
  version: 1,
  activo: true,
}));

function h(seccion: HechoAgregable["seccion"], periodo: string, valores: Record<string, number>): HechoAgregable[] {
  return Object.entries(valores).map(([concepto, valor]) => ({ seccion, concepto, periodo, valor }));
}

const HECHOS: HechoAgregable[] = [
  ...h("ingresos", "2026-06-01", { A: 600, B: 400 }),
  ...h("costos_gastos", "2026-06-01", { nomina: 700 }),
  ...h("recaudo_entidad", "2026-06-01", { A: 500 }),
  ...h("recaudo_medio_pago", "2026-06-01", { BANCO: 100 }),
  ...h("pagos", "2026-06-01", { nomina: 450 }),
  ...h("cartera", "2026-06-01", { A: 50, B: 40, C: 30, D: 20, E: 10, F: 5, G: 5 }),
  ...h("cartera", "2026-05-01", { A: 100, B: 60 }),
  ...h("personal_ingreso", "2026-06-01", { AUX: 3, MED: 1 }),
  // Julio: hay ingresos y recaudo por entidad, pero NO medio de pago ni pagos ni cartera.
  ...h("ingresos", "2026-07-01", { A: 1000 }),
  ...h("costos_gastos", "2026-07-01", { nomina: 0 }),
  ...h("recaudo_entidad", "2026-07-01", { A: 900 }),
];

describe("calcularKpis", () => {
  const r = calcularKpis(HECHOS, DEFS, "carga-1");
  const get = (codigo: string, periodo: string) => r.find((x) => x.kpi_codigo === codigo && x.periodo === periodo)!;

  it("calcula un resultado por KPI activo y periodo con datos", () => {
    const periodos = new Set(r.map((x) => x.periodo));
    expect([...periodos].sort()).toEqual(["2026-05-01", "2026-06-01", "2026-07-01"]);
    expect(r.filter((x) => x.periodo === "2026-06-01")).toHaveLength(DEFS.length);
  });

  it("sumas directas son 'real' y guardan insumos con la carga", () => {
    const ing = get("ingresos", "2026-06-01");
    expect(ing).toMatchObject({ valor: 1000, estado: "real", motivo_nd: null, formula_version: 1 });
    expect(ing.insumos).toMatchObject({ carga_id: "carga-1", ingresos: { valor: 1000, hechos: 2 } });
  });

  it("razones y diferencias son 'calculado'", () => {
    expect(get("pct_costos_ingresos", "2026-06-01")).toMatchObject({ valor: 0.7, estado: "calculado" });
    expect(get("excedente", "2026-06-01")).toMatchObject({ valor: 300, estado: "calculado" });
    expect(get("recaudo_total", "2026-06-01")).toMatchObject({ valor: 600, estado: "calculado" });
    expect(get("eficiencia_recaudo", "2026-06-01")).toMatchObject({ valor: 0.5, estado: "calculado" });
    expect(get("flujo_neto", "2026-06-01")).toMatchObject({ valor: 150, estado: "calculado" });
    expect(get("cartera_total", "2026-06-01")).toMatchObject({ valor: 160, estado: "real" });
    expect(get("concentracion_top5", "2026-06-01").valor).toBeCloseTo(150 / 160, 6);
    expect(get("var_cartera", "2026-06-01")).toMatchObject({ valor: 0, estado: "calculado" });
    expect(get("personal_ingresos", "2026-06-01")).toMatchObject({ valor: 4, estado: "real" });
  });

  it("un dato faltante nunca es 0: queda en N/D con motivo", () => {
    const rt = get("recaudo_total", "2026-07-01");
    expect(rt.estado).toBe("nd");
    expect(rt.valor).toBeNull();
    expect(rt.motivo_nd).toContain("RECAUDO por medio de pago");
    expect(rt.motivo_nd).toContain("2026-07");
    expect(get("flujo_neto", "2026-07-01").estado).toBe("nd");
    expect(get("cartera_total", "2026-07-01").estado).toBe("nd");
    expect(get("personal_retiros", "2026-06-01").estado).toBe("nd");
    // Mayo solo tiene cartera: sin mes anterior → var_cartera N/D con motivo.
    expect(get("var_cartera", "2026-05-01").motivo_nd).toContain("2026-04");
  });

  it("no divide por cero", () => {
    expect(get("pct_costos_ingresos", "2026-07-01")).toMatchObject({ valor: 0, estado: "calculado" }); // 0 / 1000
    const sinIngresos = calcularKpis([...h("ingresos", "2026-01-01", { A: 0 }), ...h("costos_gastos", "2026-01-01", { x: 5 })], DEFS, "c");
    const pct = sinIngresos.find((x) => x.kpi_codigo === "pct_costos_ingresos")!;
    expect(pct.estado).toBe("nd");
    expect(pct.motivo_nd).toContain("suma 0");
  });

  it("marca como N/D las fórmulas no implementadas", () => {
    const r2 = calcularKpis(h("ingresos", "2026-01-01", { A: 1 }), [{ codigo: "roic", unidad: "pct", version: 2, activo: true }], "c");
    expect(r2[0]).toMatchObject({ estado: "nd", formula_version: 2 });
    expect(r2[0].motivo_nd).toContain("roic");
  });

  it("periodoAnteriorDe cruza el año", () => {
    expect(periodoAnteriorDe("2026-01-01")).toBe("2025-12-01");
    expect(periodoAnteriorDe("2026-07-01")).toBe("2026-06-01");
  });
});

describe("comparaciones", () => {
  const resultados: ResultadoMes[] = [
    { kpi_codigo: "ingresos", periodo: "2026-05-01", valor: 100, estado: "real", insumos: {} },
    { kpi_codigo: "ingresos", periodo: "2026-06-01", valor: 150, estado: "real", insumos: {} },
    { kpi_codigo: "ingresos", periodo: "2026-07-01", valor: 120, estado: "real", insumos: {} },
    { kpi_codigo: "pct_costos_ingresos", periodo: "2026-06-01", valor: 0.5, estado: "calculado", insumos: { numerador: { valor: 50 }, denominador: { valor: 100 } } },
    { kpi_codigo: "pct_costos_ingresos", periodo: "2026-07-01", valor: 0.25, estado: "calculado", insumos: { numerador: { valor: 50 }, denominador: { valor: 200 } } },
    { kpi_codigo: "cartera_total", periodo: "2026-07-01", valor: 9, estado: "real", insumos: {} },
    { kpi_codigo: "recaudo_total", periodo: "2026-06-01", valor: 10, estado: "calculado", insumos: {} },
    { kpi_codigo: "recaudo_total", periodo: "2026-07-01", valor: null, estado: "nd", insumos: {} },
  ];

  it("acumula sumas y promedia", () => {
    expect(acumuladoAnual("ingresos", "2026-07-01", resultados)).toEqual({ tipo: "suma", valor: 370, meses: 3, promedio: 370 / 3 });
  });

  it("acumula razones con los insumos", () => {
    expect(acumuladoAnual("pct_costos_ingresos", "2026-07-01", resultados)).toEqual({ tipo: "razon", valor: 100 / 300, meses: 2 });
  });

  it("no acumula saldos y propaga N/D", () => {
    expect(acumuladoAnual("cartera_total", "2026-07-01", resultados)).toEqual({ tipo: "ninguno" });
    expect(acumuladoAnual("recaudo_total", "2026-07-01", resultados).tipo).toBe("nd");
  });

  it("variación relativa, en puntos y N/D", () => {
    expect(variacionMensual("ingresos", "cop", "2026-07-01", resultados)).toEqual({ tipo: "relativa", valor: -0.2, anterior: 150 });
    expect(variacionMensual("pct_costos_ingresos", "pct", "2026-07-01", resultados)).toEqual({ tipo: "puntos", valor: -0.25, anterior: 0.5 });
    expect(variacionMensual("ingresos", "cop", "2026-05-01", resultados).tipo).toBe("nd");
    expect(variacionMensual("recaudo_total", "cop", "2026-07-01", resultados).tipo).toBe("nd");
  });

  it("serie anual de 12 posiciones con null donde no hay dato", () => {
    const s = serieAnual("ingresos", "2026", resultados);
    expect(s).toHaveLength(12);
    expect(s.slice(4, 7)).toEqual([100, 150, 120]);
    expect(s[0]).toBeNull();
  });
});

describe("formatos de cifras", () => {
  it("COP millones con separadores colombianos", () => {
    expect(formatearCOPMillones(5846000000)).toBe("$5.846,0 M");
    expect(formatearCOPMillones(-1056102266)).toBe("-$1.056,1 M");
    expect(formatearCOPMillones(0)).toBe("$0,0 M");
  });

  it("porcentajes, p.p., variaciones y ratios", () => {
    expect(formatearPorcentaje(0.4333)).toBe("43,3%");
    expect(formatearPuntosPorcentuales(0.021)).toBe("+2,1 p.p.");
    expect(formatearPuntosPorcentuales(-0.005)).toBe("-0,5 p.p.");
    expect(formatearVariacion(0.123)).toBe("+12,3%");
    expect(formatearRatio(0.1312)).toBe("0,13x");
    expect(formatearValorKpi(16, "personas")).toBe("16");
    expect(formatearValorKpi(148.4, "dias")).toBe("148 días");
  });
});

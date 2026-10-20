import { describe, expect, it } from "vitest";
import { armarDatosInforme, type EntradaInforme } from "@/lib/informes/armar";
import type { ResultadoMes } from "@/lib/kpi/comparar";

const definiciones: EntradaInforme["definiciones"] = [
  { codigo: "ingresos", nombre: "Ingresos", unidad: "cop", sentido: "mayor_mejor", definicion: "" },
  { codigo: "costos_gastos", nombre: "Costos y gastos", unidad: "cop", sentido: "menor_mejor", definicion: "" },
  { codigo: "flujo_neto", nombre: "Flujo neto de caja operativo", unidad: "cop", sentido: "mayor_mejor", definicion: "" },
  { codigo: "recaudo_total", nombre: "Total recaudo", unidad: "cop", sentido: "mayor_mejor", definicion: "" },
  { codigo: "cartera_total", nombre: "Cartera total", unidad: "cop", sentido: "menor_mejor", definicion: "" },
  { codigo: "personal_ingresos", nombre: "Ingresos de personal", unidad: "personas", sentido: "neutro", definicion: "" },
];

function r(kpi: string, periodo: string, valor: number | null): ResultadoMes {
  return { kpi_codigo: kpi, periodo, valor, estado: valor === null ? "nd" : "real", insumos: {} };
}

const entrada: EntradaInforme = {
  empresa: { id: "e1", nombre: "Empresa Demo", es_demo: true },
  periodo: "2026-07-01",
  definiciones,
  resultados: [
    r("ingresos", "2026-06-01", 4_920_000_000),
    r("ingresos", "2026-07-01", 7_675_000_000),
    r("costos_gastos", "2026-07-01", 5_140_000_000),
    r("flujo_neto", "2026-06-01", -373_000_000),
    r("flujo_neto", "2026-07-01", null),
    r("recaudo_total", "2026-07-01", null),
    r("cartera_total", "2026-07-01", null),
    r("personal_ingresos", "2026-07-01", 16),
  ],
  motivosNd: { flujo_neto: "No hay datos de PAGOS para 2026-07.", recaudo_total: "Falta medio de pago.", cartera_total: "No hay cartera 2026-07." },
  metas: { ingresos: 8_000_000_000, costos_gastos: 5_000_000_000 },
  carga: { id: "c1", version: 3, caracter: "definitivo", periodo: "2026-07-01", subido_en: "2026-10-19T21:10:00Z" },
  cartera: {
    actual: [
      { concepto: "SALUD TOTAL SA", valor: 500 },
      { concepto: "NUEVA EPS", valor: 300 },
      { concepto: "nueva eps", valor: 100 },
      { concepto: "CAPITAL", valor: 50 },
    ],
    anterior: [{ concepto: "SALUD TOTAL SA", valor: 400 }, { concepto: "CAPITAL", valor: 0 }],
  },
};

describe("armarDatosInforme", () => {
  const d = armarDatosInforme(entrada);

  it("arma el tablero con semáforo contra meta y textos formateados", () => {
    const ing = d.indicadores.find((i) => i.codigo === "ingresos")!;
    expect(ing.mes.texto).toBe("$7.675,0 M");
    expect(ing.semaforo.color).toBe("amarillo"); // 95,9% de la meta
    expect(ing.variacion.texto).toBe("+56,0%");
    expect(ing.acumulado.texto).toBe("$12.595,0 M");
    expect(ing.meta.texto).toBe("$8.000,0 M");

    const costos = d.indicadores.find((i) => i.codigo === "costos_gastos")!;
    expect(costos.semaforo.color).toBe("amarillo"); // 2,8% por encima
  });

  it("N/D nunca se vuelve 0 y conserva el motivo", () => {
    const flujo = d.indicadores.find((i) => i.codigo === "flujo_neto")!;
    expect(flujo.mes.texto).toBe("N/D");
    expect(flujo.mes.motivoNd).toContain("PAGOS");
    expect(flujo.semaforo.color).toBe("nd");
    expect(d.caja.recaudo.texto).toBe("N/D");
    expect(d.caja.liquidezMinima.valor).toBeNull();
    expect(d.pendientes.length).toBeGreaterThan(0);
  });

  it("neutro no lleva semáforo y el estado general toma el peor color", () => {
    expect(d.indicadores.find((i) => i.codigo === "personal_ingresos")!.semaforo.color).toBe("sin_semaforo");
    expect(d.estadoGeneral).toMatchObject({ color: "amarillo", amarillos: 2, rojos: 0 });
  });

  it("top 5 deudores agrupa variantes y calcula cambio vs mes anterior", () => {
    expect(d.cartera.top5.map((t) => t.concepto)).toEqual(["SALUD TOTAL SA", "NUEVA EPS", "CAPITAL"]);
    expect(d.cartera.top5[0]).toMatchObject({ texto: "$0,0 M", participacion: "52,6%", cambio: "+25,0%" });
    expect(d.cartera.top5[1].valor).toBe(400);
    expect(d.cartera.top5[1].cambio).toContain("sin mes anterior");
    expect(d.cartera.top5[2].cambio).toContain("mes anterior en 0");
  });

  it("conserva la carga de origen y la etiqueta demo", () => {
    expect(d.origen?.caracter).toBe("definitivo");
    expect(d.empresa.es_demo).toBe(true);
    expect(d.periodoTexto).toBe("Julio 2026");
  });
});

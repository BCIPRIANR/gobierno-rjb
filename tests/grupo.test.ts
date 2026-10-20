import { describe, expect, it } from "vitest";
import { armarResumenGrupo, type InformeEmpresa } from "@/lib/informes/grupo";
import type { DatosInforme } from "@/lib/informes/armar";

function datos(parcial: Partial<DatosInforme> & { ingresos?: number | null; excedente?: number | null; flujo?: number | null; colores?: DatosInforme["indicadores"][number]["semaforo"]["color"][] }): DatosInforme {
  const ind = (codigo: string, valor: number | null, color: DatosInforme["indicadores"][number]["semaforo"]["color"]) => ({
    codigo,
    nombre: codigo,
    grupo: "CAJA" as const,
    unidad: "cop" as const,
    sentido: "mayor_mejor" as const,
    mes: { valor, estado: valor === null ? "nd" : "real", texto: valor === null ? "N/D" : `$${valor} M`, motivoNd: null },
    acumulado: { texto: "" },
    variacion: { texto: "", valor: null },
    meta: { valor: null, texto: "" },
    semaforo: { color, motivo: "" },
  });
  const [c1 = "verde", c2 = "verde", c3 = "verde"] = parcial.colores ?? [];
  const indicadores = [ind("ingresos", parcial.ingresos ?? null, c1), ind("excedente", parcial.excedente ?? null, c2), ind("flujo_neto", parcial.flujo ?? null, c3)];
  const rojos = indicadores.filter((i) => i.semaforo.color === "rojo").length;
  const amarillos = indicadores.filter((i) => i.semaforo.color === "amarillo").length;
  const verdes = indicadores.filter((i) => i.semaforo.color === "verde").length;
  return {
    version: 1,
    empresa: { id: "x", nombre: "x", es_demo: false },
    periodo: "2026-06-01",
    periodoTexto: "Junio 2026",
    origen: null,
    estadoGeneral: { color: rojos ? "rojo" : amarillos ? "amarillo" : "verde", verdes, amarillos, rojos, sinMeta: 0 },
    indicadores,
    caja: { recaudo: { texto: "", valor: null }, liquidezMinima: { texto: "N/D", valor: null, motivo: "" }, excedente: { texto: "N/D", valor: null, motivo: "" } },
    cartera: { edades: { disponible: false, motivo: "" }, total: { texto: "N/D", valor: null }, top5: [] },
    pendientes: [],
  };
}

const informes: InformeEmpresa[] = [
  {
    empresa: { id: "1", nombre: "AMECOL", slug: "amecol", es_demo: false },
    informe: { estado: "borrador", datos: datos({ ingresos: 100, excedente: 10, flujo: -5, colores: ["verde", "amarillo", "rojo"] }), resumen_ia: "Ventas ok.\nRentabilidad.\nCaja.", decisiones_junta: "Aprobar cupo.", causas_acciones: "x", hechos_relevantes: null, compromisos: null },
  },
  { empresa: { id: "2", nombre: "Sikuani", slug: "sikuani", es_demo: false }, informe: null },
  {
    empresa: { id: "3", nombre: "Empresa Demo", slug: "empresa-demo", es_demo: true },
    informe: { estado: "aprobado", datos: datos({ ingresos: 50, excedente: null, flujo: 7, colores: ["rojo", "verde", "verde"] }), resumen_ia: null, decisiones_junta: "  ", causas_acciones: null, hechos_relevantes: null, compromisos: null },
  },
  {
    empresa: { id: "4", nombre: "Multisalud IPS", slug: "multisalud", es_demo: false },
    informe: { estado: "borrador", datos: datos({ ingresos: 200, excedente: 20, flujo: 3, colores: ["verde", "verde", "verde"] }), resumen_ia: "Crece.", decisiones_junta: null, causas_acciones: null, hechos_relevantes: null, compromisos: null },
  },
];

describe("armarResumenGrupo", () => {
  const r = armarResumenGrupo("2026-06-01", informes);

  it("ordena rojos primero, demo al final y sin informe como N/D", () => {
    expect(r.filas.map((f) => f.empresa.nombre)).toEqual(["AMECOL", "Multisalud IPS", "Sikuani", "Empresa Demo"]);
    expect(r.filas[2]).toMatchObject({ estadoInforme: "sin_informe", color: "nd", ingresos: { texto: "N/D" } });
  });

  it("suma solo las empresas con dato y cuenta cuántas son", () => {
    expect(r.totales.ingresos).toEqual({ valor: 350, texto: "$0,0 M", empresas: 3 });
    expect(r.totales.excedente.empresas).toBe(2);
    expect(r.totales.flujoNeto.valor).toBe(5);
  });

  it("estado del informe distingue aprobado, borrador y pendiente de comentario", () => {
    expect(r.filas.find((f) => f.empresa.nombre === "AMECOL")?.estadoInforme).toBe("borrador");
    expect(r.filas.find((f) => f.empresa.nombre === "Multisalud IPS")?.estadoInforme).toBe("pendiente_comentario");
    expect(r.filas.find((f) => f.empresa.nombre === "Empresa Demo")?.estadoInforme).toBe("aprobado");
  });

  it("mensaje del mes es la primera línea del resumen y las decisiones vacías son null", () => {
    expect(r.filas[0].mensaje).toBe("Ventas ok.");
    expect(r.filas[0].decisiones).toBe("Aprobar cupo.");
    expect(r.filas.find((f) => f.empresa.es_demo)?.decisiones).toBeNull();
    expect(r.conteo).toEqual({ conInforme: 3, aprobados: 1, sinInforme: 1, rojos: 2, amarillos: 0, verdes: 1 });
  });
});

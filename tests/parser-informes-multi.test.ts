import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parsearInformesMulti } from "@/lib/parser/informes-multi";
import { evaluarInformesMulti } from "@/lib/checks/informes-multi";
import { mesDesdeEncabezado, normalizarNit, normalizarTexto } from "@/lib/parser/texto";

const RUTA_MUESTRA = join(__dirname, "fixtures", "INFORMES MULTI.xlsx");
const hayMuestra = existsSync(RUTA_MUESTRA);

function leerMuestra() {
  return parsearInformesMulti(new Uint8Array(readFileSync(RUTA_MUESTRA)));
}

/** Construye un libro mínimo con el formato INFORMES MULTI para probar casos de error. */
function libroSintetico(opciones: {
  td?: (string | number | null)[][];
  cartera?: (string | number | null)[][] | null;
  personal?: (string | number | null)[][] | null;
}): Uint8Array {
  const td = opciones.td ?? [
    ["INGRESOS"],
    ["Nombre Nit", "ene", "feb", "Total general"],
    ["EPS A", 100, 200, 300],
    ["EPS B", 10, 20, 30],
    ["Total general", 110, 220, 330],
    [],
    ["COSTOS Y GASTOS"],
    ["concepto", "ene", "feb", "Total general"],
    ["nomina", 50, 60, 110],
    ["Total general", 50, 60, 110],
    [],
    ["RECAUDO"],
    ["ENTIDAD", "enero", "febrero", "Total general"],
    ["EPS A", 90, 180, 270],
    ["Total general", 90, 180, 270],
    [],
    ["concepto", 1, 2, "Total general"],
    ["BANCO", 5, 6, 11],
    ["Total general", 5, 6, 11],
    [],
    ["TOTAL RECAUDO", 95, 186, 281],
    [],
    ["PAGOS"],
    ["concepto", 1, 2, "Total general"],
    ["nomina", 40, 45, 85],
    ["Total general", 40, 45, 85],
  ];
  const cartera =
    opciones.cartera === undefined
      ? [
          ["NIT", "ENTIDAD", "ENERO", "FEBRERO"],
          ["800130907-1", "SALUD TOTAL SA", 1000, 1100],
          ["900156264", "NUEVA EPS", 500, 400],
          [null, null, 1500, 1500],
        ]
      : opciones.cartera;
  const personal =
    opciones.personal === undefined
      ? [
          ["Cuenta de SUELDO", "MES", "ESTADO"],
          [null, "enero", null, "Total enero", "febrero", null, "Total febrero", "Total general"],
          ["CARGO", "ingreso", "retiro", null, "ingreso", "retiro", null, null],
          ["AUXILIAR", 4, 1, 5, 2, null, 2, 7],
          ["Total general", 4, 1, 5, 2, 0, 2, 7],
        ]
      : opciones.personal;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(td), "TD");
  if (cartera) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cartera), "cartera");
  if (personal) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(personal), "TD ING RET");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

describe("texto", () => {
  it("reconoce meses en sus tres formas", () => {
    expect(mesDesdeEncabezado("ene")).toBe(1);
    expect(mesDesdeEncabezado("JULIO")).toBe(7);
    expect(mesDesdeEncabezado(6)).toBe(6);
    expect(mesDesdeEncabezado("12")).toBe(12);
    expect(mesDesdeEncabezado("Total general")).toBeNull();
    expect(mesDesdeEncabezado(13)).toBeNull();
  });

  it("normaliza NIT a solo dígitos sin DV", () => {
    expect(normalizarNit("800.130.907-1")).toBe("800130907");
    expect(normalizarNit(900156264)).toBe("900156264");
    expect(normalizarNit(" ")).toBeNull();
  });

  it("normaliza títulos sin tildes ni espacios dobles", () => {
    expect(normalizarTexto("  Compañía   de Seguros ")).toBe("COMPANIA DE SEGUROS");
  });
});

describe("parser con libro sintético", () => {
  it("lee las tres hojas y conserva el origen de cada valor", () => {
    const r = parsearInformesMulti(libroSintetico({}));
    expect(r.faltantes).toEqual([]);
    expect(r.tablas.map((t) => t.seccion).sort()).toEqual(
      ["cartera", "costos_gastos", "ingresos", "pagos", "personal_ingreso", "personal_retiro", "recaudo_entidad", "recaudo_medio_pago"].sort(),
    );
    const epsB = r.hechos.find((h) => h.seccion === "ingresos" && h.concepto === "EPS B" && h.mes === 2);
    expect(epsB).toMatchObject({ valor: 20, hoja_origen: "TD", fila_origen: 4, columna_origen: "C", unidad: "COP" });

    const cartera = r.hechos.find((h) => h.seccion === "cartera" && h.concepto === "SALUD TOTAL SA" && h.mes === 1);
    expect(cartera).toMatchObject({ nit: "800130907", valor: 1000, hoja_origen: "cartera", fila_origen: 2, columna_origen: "C" });

    const retiro = r.hechos.find((h) => h.seccion === "personal_retiro" && h.mes === 1);
    expect(retiro).toMatchObject({ concepto: "AUXILIAR", valor: 1, unidad: "personas", columna_origen: "C", fila_origen: 4 });
    expect(r.hechos.filter((h) => h.seccion === "personal_retiro" && h.mes === 2)).toHaveLength(0);

    expect(r.totalRecaudo).toMatchObject({ porMes: [{ mes: 1, valor: 95 }, { mes: 2, valor: 186 }], totalGeneral: 281 });
    // Las columnas "Total general" y "Total enero" no generan hechos.
    expect(r.hechos.some((h) => h.columna_origen === "D" && h.hoja_origen === "TD")).toBe(false);
  });

  it("detecta celdas no numéricas con su ubicación", () => {
    const td = libroSintetico({}).slice(); // no se usa; se construye un TD con texto
    void td;
    const r = parsearInformesMulti(
      libroSintetico({
        td: [
          ["INGRESOS"],
          ["Nombre Nit", "ene", "feb", "Total general"],
          ["EPS A", "1.234", 200, 300],
          ["Total general", 100, 200, 300],
        ],
      }),
    );
    expect(r.problemas).toEqual([{ hoja: "TD", fila: 3, columna: "B", valor: "1.234", seccion: "ingresos" }]);
  });

  it("reporta duplicados idénticos y variantes por separado", () => {
    const r = parsearInformesMulti(
      libroSintetico({
        td: [
          ["INGRESOS"],
          ["Nombre Nit", "ene", "feb", "Total general"],
          ["EPS A", 100, 200, 300],
          ["EPS A", 100, 200, 300],
          ["EPS B ", 1, 2, 3],
          ["EPS B", 5, 6, 11],
          ["Total general", 206, 408, 614],
        ],
      }),
    );
    expect(r.duplicados).toHaveLength(2);
    expect(r.duplicados.find((d) => d.concepto === "EPS A")).toMatchObject({ identicos: true, filas: [3, 4] });
    expect(r.duplicados.find((d) => d.concepto === "EPS B")).toMatchObject({ identicos: false, filas: [5, 6] });
  });

  it("marca como faltante lo que no encuentra", () => {
    const r = parsearInformesMulti(libroSintetico({ cartera: null, td: [["INGRESOS"], ["x", "ene", "feb"], ["a", 1, 2]] }));
    expect(r.faltantes.map((f) => f.seccion)).toEqual(
      expect.arrayContaining(["cartera", "costos_gastos", "recaudo_entidad", "pagos", "total_recaudo"]),
    );
    expect(r.tablas.find((t) => t.seccion === "ingresos")?.ultimoMes).toBe(2);
  });
});

describe("checks con libro sintético", () => {
  it("acepta un archivo coherente con el periodo", () => {
    const ev = evaluarInformesMulti(parsearInformesMulti(libroSintetico({})), "2026-02-01");
    expect(ev.estado).toBe("aceptada");
    expect(ev.motivoRechazo).toBeNull();
    expect(ev.checks.filter((c) => c.nivel === "error").every((c) => c.ok)).toBe(true);
  });

  it("rechaza cuando TOTAL RECAUDO no cuadra", () => {
    const base = libroSintetico({});
    void base;
    const r = parsearInformesMulti(
      libroSintetico({
        td: [
          ["INGRESOS"], ["Nombre Nit", "ene", "feb", "Total general"], ["EPS A", 1, 2, 3], ["Total general", 1, 2, 3],
          ["COSTOS Y GASTOS"], ["concepto", "ene", "feb", "Total general"], ["x", 1, 2, 3], ["Total general", 1, 2, 3],
          ["RECAUDO"], ["ENTIDAD", "enero", "febrero", "Total general"], ["EPS A", 90, 180, 270], ["Total general", 90, 180, 270],
          ["concepto", 1, 2, "Total general"], ["BANCO", 5, 6, 11], ["Total general", 5, 6, 11],
          ["TOTAL RECAUDO", 95, 999, 1094],
          ["PAGOS"], ["concepto", 1, 2, "Total general"], ["x", 1, 2, 3], ["Total general", 1, 2, 3],
        ],
      }),
    );
    const ev = evaluarInformesMulti(r, "2026-02-01");
    expect(ev.estado).toBe("rechazada");
    expect(ev.motivoRechazo).toContain("TOTAL RECAUDO");
    expect(ev.motivoRechazo).toContain("febrero");
  });

  it("rechaza si el periodo no coincide con el último mes con datos", () => {
    const r = parsearInformesMulti(libroSintetico({}));
    expect(evaluarInformesMulti(r, "2026-03-01").estado).toBe("rechazada");
    expect(evaluarInformesMulti(r, "2026-01-01").motivoRechazo).toContain("hasta febrero");
  });

  it("rechaza duplicados idénticos y valores no numéricos", () => {
    const r = parsearInformesMulti(
      libroSintetico({
        td: [
          ["INGRESOS"], ["Nombre Nit", "ene", "feb", "Total general"], ["EPS A", 1, 2, 3], ["EPS A", 1, 2, 3], ["EPS C", "x", 2, 3], ["Total general", 2, 4, 6],
          ["COSTOS Y GASTOS"], ["concepto", "ene", "feb", "Total general"], ["x", 1, 2, 3], ["Total general", 1, 2, 3],
          ["RECAUDO"], ["ENTIDAD", "enero", "febrero", "Total general"], ["EPS A", 90, 180, 270], ["Total general", 90, 180, 270],
          ["concepto", 1, 2, "Total general"], ["BANCO", 5, 6, 11], ["Total general", 5, 6, 11],
          ["TOTAL RECAUDO", 95, 186, 281],
          ["PAGOS"], ["concepto", 1, 2, "Total general"], ["x", 1, 2, 3], ["Total general", 1, 2, 3],
        ],
      }),
    );
    const ev = evaluarInformesMulti(r, "2026-02-01");
    expect(ev.estado).toBe("rechazada");
    const codigos = ev.checks.filter((c) => !c.ok).map((c) => c.codigo);
    expect(codigos).toEqual(expect.arrayContaining(["duplicados", "valores_numericos"]));
  });
});

describe.skipIf(!hayMuestra)("parser con el INFORMES MULTI real (tests/fixtures)", () => {
  const r = hayMuestra ? leerMuestra() : null!;

  it("encuentra todas las secciones y ninguna falta", () => {
    expect(r.hojas).toEqual(["TD", "cartera", "TD ING RET"]);
    expect(r.faltantes).toEqual([]);
    expect(r.tablas).toHaveLength(8);
  });

  it("detecta el último mes de cada sección", () => {
    const ultimo = Object.fromEntries(r.tablas.map((t) => [t.seccion, t.ultimoMes]));
    expect(ultimo).toMatchObject({
      ingresos: 7,
      costos_gastos: 7,
      recaudo_entidad: 7,
      recaudo_medio_pago: 6,
      pagos: 6,
      cartera: 5,
      personal_ingreso: 7,
      personal_retiro: 7,
    });
  });

  it("conserva hoja, fila y columna de origen en TD", () => {
    const h = r.hechos.find((x) => x.seccion === "ingresos" && x.concepto === "PROTEGER EPS" && x.mes === 7);
    expect(h).toMatchObject({ valor: 1594084087, hoja_origen: "TD", fila_origen: 8, columna_origen: "H" });
    const c = r.hechos.find((x) => x.seccion === "costos_gastos" && x.concepto === "nomina" && x.mes === 1);
    expect(c).toMatchObject({ fila_origen: 49, columna_origen: "B" });
    expect(c?.valor).toBeCloseTo(1045515682.35, 1);
    const p = r.hechos.find((x) => x.seccion === "pagos" && x.concepto === "cesantias" && x.mes === 2);
    expect(p).toMatchObject({ valor: 791052058, fila_origen: 129, columna_origen: "C" });
  });

  it("lee TOTAL RECAUDO con la tabla de medio de pago (6 meses)", () => {
    expect(r.totalRecaudo?.porMes).toHaveLength(6);
    expect(r.totalRecaudo?.porMes[0]).toMatchObject({ mes: 1, columna: "B" });
    expect(r.totalRecaudo?.porMes[0].valor).toBeCloseTo(5942801513, 0);
    expect(r.totalRecaudo?.totalGeneral).toBeCloseTo(33583773729, 0);
  });

  it("lee cartera con NIT y valores decimales", () => {
    const h = r.hechos.find((x) => x.seccion === "cartera" && x.nit === "800130907" && x.mes === 1);
    expect(h).toMatchObject({ concepto: "SALUD TOTAL SA", hoja_origen: "cartera", fila_origen: 4, columna_origen: "C" });
    expect(h?.valor).toBeCloseTo(4533267808.47, 1);
    const adress = r.hechos.find((x) => x.seccion === "cartera" && x.concepto === "ADRESS" && x.mes === 4);
    expect(adress?.valor).toBe(-1387707861);
  });

  it("lee ingresos y retiros de personal por cargo y mes", () => {
    const aux = r.hechos.filter((x) => x.concepto.startsWith("AUXILIAR ADMINISTRATIV") && x.mes === 1);
    expect(aux.find((x) => x.seccion === "personal_ingreso")).toMatchObject({ valor: 4, unidad: "personas", columna_origen: "B", fila_origen: 11 });
    expect(aux.find((x) => x.seccion === "personal_retiro")).toMatchObject({ valor: 4, columna_origen: "C" });
    expect(r.hechos.filter((x) => x.seccion === "personal_ingreso" && x.mes === 7).reduce((a, x) => a + x.valor, 0)).toBe(16);
  });

  it("no genera hechos desde columnas Total ni desde tablas de detalle sin título", () => {
    expect(r.hechos.some((h) => h.hoja_origen === "TD" && h.fila_origen > 150)).toBe(false);
    expect(r.hechos.filter((h) => h.seccion === "ingresos").every((h) => h.columna_origen <= "H")).toBe(true);
  });

  it("solo reporta variantes de nombre (espacios), no duplicados idénticos", () => {
    expect(r.duplicados.every((d) => !d.identicos)).toBe(true);
    expect(r.duplicados.map((d) => d.concepto)).toEqual(expect.arrayContaining(["AMBULANCIAS", "COLPATRIA"]));
  });

  it("los checks aceptan el archivo para julio y lo rechazan para otro periodo", () => {
    const julio = evaluarInformesMulti(r, "2026-07-01");
    expect(julio.estado).toBe("aceptada");
    expect(julio.checks.find((c) => c.codigo === "total_recaudo")?.ok).toBe(true);
    expect(julio.checks.find((c) => c.codigo === "secciones_atrasadas")?.mensaje).toContain("cartera hasta mayo");

    expect(evaluarInformesMulti(r, "2026-09-01").estado).toBe("rechazada");
    expect(evaluarInformesMulti(r, "2026-06-01").motivoRechazo).toContain("hasta julio");
  });
});

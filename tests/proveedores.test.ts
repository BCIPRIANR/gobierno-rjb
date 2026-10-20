import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parsearProveedores } from "@/lib/parser/proveedores";
import { evaluarProveedores } from "@/lib/checks/proveedores";
import { alertasProveedores, type PagoProveedor } from "@/lib/kpi/alertas-proveedores";

const RUTA = join(__dirname, "fixtures", "Feedback", "PROVEEDORES- archivo de RJB.xlsx");
const hayMuestra = existsSync(RUTA);

function libro(filas: (string | number | Date | null)[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["pivot", 1]]), "Hoja1"); // hoja de distracción
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas, { cellDates: true }), "AGOSTO PROVEE");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx", cellDates: true }) as ArrayBuffer);
}

const fechas = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01"].map((d) => new Date(`${d}T00:00:00Z`));

const sintetico = libro([
  ["CUENTAS PROVEEDORES"],
  [new Date("2026-09-12T00:00:00Z")],
  ["NIT", "PROVEDORES", "CARTERA", null, ...fechas, "TOTAL", "Promedio", "Empresa"],
  ["860002134", "ABBOTT", 60, "INSUMOS", 100, 100, 100, 100, 100, 100, 100, 150, 950, 118, "Multisalud"],
  ["86049330/21227313", "VIDEO\nSONIDO", 0, "AIRES", null, null, null, null, null, null, 50, 50, 100, 50, "Multisalud"],
  ["901169422", "SANAR IPS", 30, null, 10, 10, 10, 10, 10, 10, 10, 10, 80, 10, "Multisalud"],
  ["901169422", "GRUPO PREFERENCIAL", null, null, 5, 5, 5, 5, 5, 5, 5, 5, 40, 5, "Multisalud"],
  ["abc", "SIN NIT VALIDO", null, null, 1, 1, 1, 1, 1, 1, 1, "x", 7, 1, "Multisalud"],
  [null, "NOMINA", null, null, 900, 900, 900, 900, 900, 900, 900, 900, 7200, 900, "Multisalud"],
  [null, "TOTAL POR PAGAR", null, null, 1016, 1016, 1016, 1016, 1016, 1016, 1066, 1116, 8278, 1035, null],
  [null, "INGRESO", null, null, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 40000, 5000, null],
]);

describe("parsearProveedores (sintético)", () => {
  const r = parsearProveedores(sintetico);

  it("detecta la hoja por encabezado, los meses por fecha y la fecha de corte", () => {
    expect(r.hoja).toBe("AGOSTO PROVEE");
    expect(r.filaEncabezado).toBe(3);
    expect(r.meses.map((m) => m.periodo)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01"]);
    expect(r.meses[0].columna).toBe("E");
    expect(r.fechaCorte).toBe("2026-09-12");
    expect(r.empresaDeclarada).toBe("Multisalud");
  });

  it("lee proveedores y categorías, y se detiene en TOTAL", () => {
    expect(r.proveedores.map((p) => p.nombre)).toEqual(["ABBOTT", "VIDEO SONIDO", "SANAR IPS", "GRUPO PREFERENCIAL", "SIN NIT VALIDO", "NOMINA"]);
    expect(r.proveedores[0]).toMatchObject({ nit: "860002134", diasCartera: 60, concepto: "INSUMOS", fila: 4 });
    expect(r.proveedores[5].nit).toBeNull();
  });

  it("tolera NIT doble, marca NIT inválidos y NIT repetidos", () => {
    expect(r.proveedores[1].nit).toBe("86049330");
    expect(r.notas[0]).toContain("dos valores");
    expect(r.nitInvalidos).toEqual([{ fila: 8, nombre: "SIN NIT VALIDO", valor: "abc" }]);
    expect(r.nitRepetidos).toEqual([{ nit: "901169422", nombres: ["SANAR IPS", "GRUPO PREFERENCIAL"], filas: [6, 7] }]);
  });

  it("genera hechos con origen y detecta celdas no numéricas; las vacías no se guardan", () => {
    const abbottAgo = r.hechos.find((h) => h.concepto === "ABBOTT" && h.periodo === "2026-08-01");
    expect(abbottAgo).toMatchObject({ seccion: "pagos", valor: 150, nit: "860002134", hoja_origen: "AGOSTO PROVEE", fila_origen: 4, columna_origen: "L" });
    expect(r.hechos.filter((h) => h.concepto === "VIDEO SONIDO")).toHaveLength(2);
    expect(r.problemas).toEqual([{ hoja: "AGOSTO PROVEE", fila: 8, columna: "L", valor: "x", seccion: "pagos" }]);
    expect(r.hechos.some((h) => h.concepto === "INGRESO" || h.concepto.startsWith("TOTAL"))).toBe(false);
  });
});

describe("evaluarProveedores", () => {
  it("rechaza por celdas no numéricas y acepta con avisos cuando están corregidas", () => {
    const malo = evaluarProveedores(parsearProveedores(sintetico), "2026-08-01", "Multisalud IPS");
    expect(malo.estado).toBe("rechazada");
    expect(malo.motivoRechazo).toContain("L8");

    const bueno = libro([
      ["NIT", "PROVEDORES", "CARTERA", null, ...fechas, "TOTAL", "Promedio", "Empresa"],
      ["860002134", "ABBOTT", 60, "INSUMOS", 100, 100, 100, 100, 100, 100, 100, 150, 950, 118, "Sikuani"],
      ["901169422", "SANAR IPS", 30, null, 10, 10, 10, 10, 10, 10, 10, 10, 80, 10, "Sikuani"],
      ["901169422", "GRUPO PREFERENCIAL", null, null, 5, 5, 5, 5, 5, 5, 5, 5, 40, 5, "Sikuani"],
      [null, "TOTAL", null, null, 115, 115, 115, 115, 115, 115, 115, 165, 1070, 133, null],
    ]);
    const ev = evaluarProveedores(parsearProveedores(bueno), "2026-07-01", "Multisalud IPS");
    expect(ev.estado).toBe("aceptada");
    const codigos = ev.checks.map((c) => c.codigo);
    expect(codigos).toEqual(expect.arrayContaining(["nit_repetidos", "meses_posteriores", "empresa"]));
    expect(ev.checks.find((c) => c.codigo === "empresa")?.mensaje).toContain("Verifica");
    expect(evaluarProveedores(parsearProveedores(bueno), "2026-09-01", "Sikuani").motivoRechazo).toContain("no tiene valores en ese mes");
  });

  it("rechaza un libro sin encabezado reconocible", () => {
    const ev = evaluarProveedores(parsearProveedores(libro([["x", "y"], [1, 2]])), "2026-08-01", "AMECOL");
    expect(ev.estado).toBe("rechazada");
    expect(ev.motivoRechazo).toContain("encabezado");
  });
});

describe("alertasProveedores", () => {
  const pagos: PagoProveedor[] = [];
  const meses = ["2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01"];
  for (const m of meses) pagos.push({ nit: "1", concepto: "ESTABLE", periodo: m, valor: 100 });
  pagos.push({ nit: "1", concepto: "ESTABLE", periodo: "2026-08-01", valor: 110 });
  for (const m of meses) pagos.push({ nit: "2", concepto: "SUBE", periodo: m, valor: 100 });
  pagos.push({ nit: "2", concepto: "SUBE", periodo: "2026-08-01", valor: 150 });
  pagos.push({ nit: "3", concepto: "DEJO DE FACTURAR", periodo: "2026-06-01", valor: 600 });
  pagos.push({ nit: "4", concepto: "NUEVO", periodo: "2026-08-01", valor: 80 });
  pagos.push({ nit: "5", concepto: "VIEJO", periodo: "2025-01-01", valor: 80 });

  const r = alertasProveedores(pagos, "2026-08-01");

  it("usa la ventana de 6 meses previos y el umbral ±20%", () => {
    expect(r.ventana).toEqual({ desde: "2026-02-01", hasta: "2026-07-01" });
    const estable = r.filas.find((f) => f.proveedor === "ESTABLE")!;
    expect(estable).toMatchObject({ mesRevision: 110, promedio6: 100, desviacion: 0.1, alerta: false, tipo: null });
    const sube = r.filas.find((f) => f.proveedor === "SUBE")!;
    expect(sube).toMatchObject({ desviacion: 0.5, alerta: true, tipo: "Superior", mesAnterior: 100 });
  });

  it("mes sin factura dentro de la ventana cuenta como 0 (modelo del analista)", () => {
    const dejo = r.filas.find((f) => f.proveedor === "DEJO DE FACTURAR")!;
    expect(dejo.promedio6).toBe(100);
    expect(dejo).toMatchObject({ mesRevision: 0, desviacion: -1, tipo: "Inferior", mesesConDato: 1 });
    expect(dejo.textos.mesAnterior).toBe("N/D");
  });

  it("proveedor nuevo sin historia no tiene desviación; sin datos en la ventana ni el mes queda fuera", () => {
    const nuevo = r.filas.find((f) => f.proveedor === "NUEVO")!;
    expect(nuevo).toMatchObject({ promedio6: null, desviacion: null, alerta: false });
    expect(nuevo.textos.promedio6).toBe("N/D");
    expect(r.filas.some((f) => f.proveedor === "VIEJO")).toBe(false);
    expect(r.sinHistoria).toBe(1);
    expect(r).toMatchObject({ analizados: 4, enAlerta: 2 });
    expect(r.filas[0].alerta).toBe(true);
  });
});

describe.skipIf(!hayMuestra)("archivo PROVEEDORES real (tests/fixtures/Feedback)", () => {
  const r = hayMuestra ? parsearProveedores(new Uint8Array(readFileSync(RUTA))) : null!;

  it("lee 61 proveedores con NIT y 14 categorías, 48 meses, con la empresa declarada", () => {
    expect(r.hoja).toBe("AGOSTO PROVEE");
    expect(r.meses).toHaveLength(48);
    expect(r.meses[0].periodo).toBe("2022-10-01");
    expect(r.meses[47].periodo).toBe("2026-09-01");
    expect(r.proveedores.filter((p) => p.nit)).toHaveLength(61);
    expect(r.proveedores.filter((p) => !p.nit).map((p) => p.nombre)).toContain("NOMINA");
    expect(r.empresaDeclarada).toBe("Multisalud");
    expect(r.fechaCorte).toBe("2026-09-12");
    expect(r.problemas).toEqual([]);
  });

  it("pasa los checks para agosto 2026 con avisos y reproduce la alerta del analista (ABBOTT +64%)", () => {
    const ev = evaluarProveedores(r, "2026-08-01", "Multisalud IPS");
    expect(ev.estado).toBe("aceptada");
    expect(ev.checks.map((c) => c.codigo)).toEqual(expect.arrayContaining(["nit_repetidos", "meses_posteriores", "empresa"]));

    const pagos = r.hechos.map((h) => ({ nit: h.nit, concepto: h.concepto, periodo: h.periodo, valor: h.valor }));
    const alertas = alertasProveedores(pagos, "2026-08-01");
    const abbott = alertas.filas.find((f) => f.nit === "860002134")!;
    expect(abbott.mesRevision).toBeCloseTo(19942726, 0);
    expect(abbott.mesAnterior).toBeCloseTo(19955686, 0);
    expect(abbott.promedio6).toBeCloseTo(12144783.83, 1);
    expect(abbott.desviacion).toBeCloseTo(0.64, 2);
    expect(abbott.tipo).toBe("Superior");
    expect(alertas.enAlerta).toBeGreaterThan(20);
  });
});

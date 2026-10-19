import { describe, expect, it } from "vitest";
import {
  esquemaCarga,
  LIMITE_BYTES,
  mesAnterior,
  rutaStorage,
  validarArchivoXlsx,
} from "@/lib/cargas/validacion";
import { calcularSha256 } from "@/lib/cargas/hash";
import { formatearPeriodo, formatearPeriodoCorto, formatearTamano } from "@/lib/formato";

const base = {
  empresa_id: "0c964ac3-3ec3-4336-8f3d-cc7146c212ee",
  tipo_archivo: "INFORME_MENSUAL",
  periodo: "2026-07",
  caracter: "preliminar",
};

describe("esquemaCarga", () => {
  it("convierte el mes YYYY-MM al primer día del mes", () => {
    const r = esquemaCarga.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.periodo).toBe("2026-07-01");
  });

  it("rechaza un mes inválido con mensaje en español", () => {
    const r = esquemaCarga.safeParse({ ...base, periodo: "2026-13" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/periodo/i);
  });

  it("rechaza un carácter distinto de preliminar/definitivo", () => {
    expect(esquemaCarga.safeParse({ ...base, caracter: "final" }).success).toBe(false);
  });

  it("rechaza empresa que no es uuid", () => {
    expect(esquemaCarga.safeParse({ ...base, empresa_id: "multisalud" }).success).toBe(false);
  });
});

describe("validarArchivoXlsx", () => {
  it("acepta .xlsx dentro del límite", () => {
    expect(validarArchivoXlsx({ nombre: "INFORMES MULTI.XLSX", tamano: 1024 })).toEqual({ ok: true });
  });

  it("rechaza extensiones distintas", () => {
    const r = validarArchivoXlsx({ nombre: "informe.xls", tamano: 1024 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(".xlsx");
  });

  it("rechaza archivos de más de 20 MB", () => {
    const r = validarArchivoXlsx({ nombre: "a.xlsx", tamano: LIMITE_BYTES + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("20 MB");
  });

  it("rechaza archivo vacío", () => {
    expect(validarArchivoXlsx({ nombre: "a.xlsx", tamano: 0 }).ok).toBe(false);
  });
});

describe("rutaStorage y hash", () => {
  it("arma la ruta {empresa}/{periodo}/{uuid}.xlsx", () => {
    expect(rutaStorage("e1", "2026-07-01", "u1")).toBe("e1/2026-07-01/u1.xlsx");
  });

  it("calcula SHA-256 conocido", () => {
    expect(calcularSha256(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("mesAnterior", () => {
  it("retrocede un mes y cruza el año", () => {
    expect(mesAnterior(new Date(2026, 0, 15))).toBe("2025-12");
    expect(mesAnterior(new Date(2026, 7, 3))).toBe("2026-07");
  });
});

describe("formato", () => {
  it("formatea periodos en español", () => {
    expect(formatearPeriodo("2026-07-01")).toBe("Julio 2026");
    expect(formatearPeriodoCorto("2026-11-01")).toBe("Nov 2026");
    expect(formatearPeriodo("rara")).toBe("rara");
  });

  it("formatea tamaños con coma decimal", () => {
    expect(formatearTamano(1.5 * 1024 * 1024)).toBe("1,5 MB");
    expect(formatearTamano(2048)).toBe("2 KB");
  });
});

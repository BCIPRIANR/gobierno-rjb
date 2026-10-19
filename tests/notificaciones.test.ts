import { describe, expect, it } from "vitest";
import { plantillaCargaAceptada, plantillaCargaRechazada, plantillaRecordatorio } from "@/lib/notificaciones/plantillas";
import { diasDesde, periodoDeReporte, periodoDesdeMes, ultimosPeriodos } from "@/lib/periodos";

describe("periodos", () => {
  it("el periodo de reporte es el mes anterior y cruza el año", () => {
    expect(periodoDeReporte(new Date(2026, 9, 19))).toBe("2026-09-01");
    expect(periodoDeReporte(new Date(2026, 0, 5))).toBe("2025-12-01");
  });

  it("lista los últimos periodos del más reciente al más antiguo", () => {
    expect(ultimosPeriodos(3, new Date(2026, 1, 10))).toEqual(["2026-01-01", "2025-12-01", "2025-11-01"]);
  });

  it("valida el parámetro de mes", () => {
    expect(periodoDesdeMes("2026-07")).toBe("2026-07-01");
    expect(periodoDesdeMes("2026-13")).toBeNull();
    expect(periodoDesdeMes(7)).toBeNull();
  });

  it("cuenta días desde una fecha", () => {
    expect(diasDesde("2026-08-10", new Date(2026, 9, 19))).toBe(70);
    expect(diasDesde("2026-10-22", new Date(2026, 9, 19))).toBe(-3);
  });
});

describe("plantillas de avisos", () => {
  it("recordatorio antes de la fecha límite", () => {
    const m = plantillaRecordatorio({
      empresa: "Multisalud IPS", nombreArchivo: "Informe mensual de gestión", periodo: "2026-09-01",
      fechaLimite: "2026-10-10", diasAtraso: 0, url: "https://app/cargas",
    });
    expect(m.asunto).toBe("Recordatorio: Informe mensual de gestión de Septiembre 2026 · Multisalud IPS");
    expect(m.cuerpo).toContain("vence el 10 de octubre 2026");
    expect(m.cuerpo).toContain("https://app/cargas");
  });

  it("recordatorio con atraso", () => {
    const m = plantillaRecordatorio({
      empresa: "AMECOL", nombreArchivo: "Informe mensual de gestión", periodo: "2026-09-01",
      fechaLimite: "2026-10-10", diasAtraso: 9, url: "https://app/cargas",
    });
    expect(m.asunto).toMatch(/^Atrasado:/);
    expect(m.cuerpo).toContain("atrasado 9 días");
  });

  it("carga aceptada: cifras con fuente y N/D cuando falta", () => {
    const m = plantillaCargaAceptada({
      empresa: "Empresa Demo", esDemo: true, periodo: "2026-07-01", caracter: "definitivo", version: 3,
      ingresos: 7675862560, excedente: 2535198519.92, recaudoTotal: null, avisos: 2, url: "https://app/gestion",
    });
    expect(m.asunto).toContain("DATOS DE DEMOSTRACIÓN");
    expect(m.cuerpo).toContain("Ingresos $7.675,9 M");
    expect(m.cuerpo).toContain("Total recaudo N/D");
    expect(m.cuerpo).toContain("Excedente entre ingresos y costos/gastos");
    expect(m.cuerpo).not.toMatch(/EBITDA|utilidad operacional/i);
    expect(m.cuerpo).toContain("2 avisos");
  });

  it("carga rechazada incluye el motivo y cómo corregir", () => {
    const m = plantillaCargaRechazada({
      empresa: "Sikuani", esDemo: false, periodo: "2026-09-01", nombreArchivo: "INFORMES MULTI.xlsx",
      motivo: "Faltan secciones.", url: "https://app/cargas",
    });
    expect(m.asunto).toBe("Carga rechazada: Sikuani · Septiembre 2026");
    expect(m.cuerpo).toContain("Motivo: Faltan secciones.");
    expect(m.cuerpo).toContain("vuelve a subirlo");
  });
});

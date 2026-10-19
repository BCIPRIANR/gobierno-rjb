import { describe, expect, it } from "vitest";
import { sugerirPreguntas } from "@/lib/ia/sugerencias";

const base = {
  rol: "founder" as const,
  empresas: [
    { nombre: "Multisalud IPS", slug: "multisalud", es_demo: false },
    { nombre: "Empresa Demo", slug: "empresa-demo", es_demo: true },
  ],
  ultimoPeriodo: "2026-07-01",
  kpisNd: ["Total recaudo"],
  periodoReporte: "2026-09-01",
};

describe("sugerirPreguntas", () => {
  it("prefiere la empresa real y nombra el último mes con datos", () => {
    const s = sugerirPreguntas(base);
    expect(s[0]).toBe("¿Cómo cerró Multisalud IPS en Julio 2026?");
    expect(s).toContain("¿Por qué Total recaudo está en N/D en Julio 2026 para Multisalud IPS?");
    expect(s).toContain("¿Qué EPS o proveedores comparten varias empresas del grupo?");
    expect(s.length).toBeLessThanOrEqual(6);
  });

  it("sin datos, propone orientarse primero y no inventa meses", () => {
    const s = sugerirPreguntas({ ...base, ultimoPeriodo: null, kpisNd: [] });
    expect(s[0]).toBe("¿Qué empresas puedo consultar y cuáles tienen datos?");
    expect(s.join(" ")).not.toContain("Julio");
    expect(s).toContain("¿Qué empresas no han cargado el informe de Septiembre 2026?");
  });

  it("con una sola empresa no sugiere cruces entre empresas", () => {
    const s = sugerirPreguntas({ ...base, empresas: [base.empresas[0]] });
    expect(s.some((x) => x.includes("comparten"))).toBe(false);
  });
});

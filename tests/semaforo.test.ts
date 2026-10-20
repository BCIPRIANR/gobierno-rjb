import { describe, expect, it } from "vitest";
import { estadoGeneral, evaluarSemaforo } from "@/lib/kpi/semaforo";

describe("semáforo contra meta", () => {
  it("más es mejor: verde, amarillo (90–99,9%) y rojo (<90%)", () => {
    expect(evaluarSemaforo({ codigo: "ingresos", valor: 100, meta: 100, sentido: "mayor_mejor" }).color).toBe("verde");
    expect(evaluarSemaforo({ codigo: "ingresos", valor: 95, meta: 100, sentido: "mayor_mejor" }).color).toBe("amarillo");
    expect(evaluarSemaforo({ codigo: "ingresos", valor: 90, meta: 100, sentido: "mayor_mejor" }).color).toBe("amarillo");
    expect(evaluarSemaforo({ codigo: "ingresos", valor: 89.9, meta: 100, sentido: "mayor_mejor" }).color).toBe("rojo");
  });

  it("menos es mejor: la regla se invierte", () => {
    expect(evaluarSemaforo({ codigo: "costos_gastos", valor: 100, meta: 100, sentido: "menor_mejor" }).color).toBe("verde");
    expect(evaluarSemaforo({ codigo: "costos_gastos", valor: 108, meta: 100, sentido: "menor_mejor" }).color).toBe("amarillo");
    expect(evaluarSemaforo({ codigo: "costos_gastos", valor: 111, meta: 100, sentido: "menor_mejor" }).color).toBe("rojo");
  });

  it("sin meta → gris, N/D → nd, neutro → sin semáforo", () => {
    expect(evaluarSemaforo({ codigo: "ingresos", valor: 5, meta: null, sentido: "mayor_mejor" }).color).toBe("sin_meta");
    expect(evaluarSemaforo({ codigo: "ingresos", valor: null, meta: 5, sentido: "mayor_mejor" }).color).toBe("nd");
    expect(evaluarSemaforo({ codigo: "personal_ingresos", valor: 5, meta: 5, sentido: "neutro" }).color).toBe("sin_semaforo");
  });

  it("flujo neto negativo es rojo aunque no haya meta", () => {
    expect(evaluarSemaforo({ codigo: "flujo_neto", valor: -1, meta: null, sentido: "mayor_mejor" }).color).toBe("rojo");
    expect(evaluarSemaforo({ codigo: "flujo_neto", valor: 10, meta: null, sentido: "mayor_mejor" }).color).toBe("sin_meta");
  });

  it("días de proveedores se evalúa como rango ±10%", () => {
    expect(evaluarSemaforo({ codigo: "dias_proveedores", valor: 54, meta: 50, sentido: "menor_mejor" }).color).toBe("verde");
    expect(evaluarSemaforo({ codigo: "dias_proveedores", valor: 40, meta: 50, sentido: "menor_mejor" }).color).toBe("rojo");
  });

  it("estado general toma el peor color", () => {
    expect(estadoGeneral(["verde", "amarillo", "sin_meta"]).color).toBe("amarillo");
    expect(estadoGeneral(["verde", "rojo"]).color).toBe("rojo");
    expect(estadoGeneral(["sin_meta", "nd"]).color).toBe("sin_meta");
    expect(estadoGeneral(["verde", "verde", "amarillo"])).toMatchObject({ verdes: 2, amarillos: 1, rojos: 0 });
  });
});

/**
 * Prueba de integración: ejecuta las herramientas del chat contra la base real,
 * autenticada como el usuario de prueba "gerente demo" (solo ve Empresa Demo).
 * Se omite si faltan .env.local o tests/fixtures/usuario-demo.txt (ambos ignorados por git).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/tipos";
import { ejecutarHerramienta } from "@/lib/ia/herramientas";

const RAIZ = join(__dirname, "..", "..");
const RUTA_ENV = join(RAIZ, ".env.local");
const RUTA_USUARIOS = join(RAIZ, "tests", "fixtures", "usuario-demo.txt");

function leerPares(ruta: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(ruta, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

/** Credenciales del bloque "gerente demo" del archivo de usuarios de prueba. */
function credencialesGerente(): { email: string; password: string } | null {
  if (!existsSync(RUTA_USUARIOS)) return null;
  const bloque = readFileSync(RUTA_USUARIOS, "utf8").split("--- gerente demo ---")[1];
  if (!bloque) return null;
  const pares = Object.fromEntries(
    bloque
      .split(/\r?\n/)
      .filter((l) => l.includes("="))
      .map((l) => l.split("=") as [string, string]),
  );
  return pares.email && pares.password ? { email: pares.email, password: pares.password } : null;
}

const env = existsSync(RUTA_ENV) ? leerPares(RUTA_ENV) : {};
const gerente = credencialesGerente();
const activa = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY && gerente);

describe.skipIf(!activa)("herramientas del chat bajo RLS (gerente demo)", () => {
  // Un solo inicio de sesión para toda la suite (evita límites de tasa de Auth).
  let ctx: { supabase: ReturnType<typeof createClient<Database>>; usuarioId: string } | null = null;
  async function contexto() {
    if (ctx) return ctx;
    const supabase = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase.auth.signInWithPassword(gerente as { email: string; password: string });
    if (error || !data.user) throw new Error(`No se pudo iniciar sesión: ${error?.message}`);
    ctx = { supabase, usuarioId: data.user.id };
    return ctx;
  }

  it("listar_empresas solo devuelve Empresa Demo", async () => {
    const r = await ejecutarHerramienta(await contexto(), "listar_empresas", {});
    const empresas = r.empresas as { slug: string; es_demo: boolean }[];
    expect(empresas.map((e) => e.slug)).toEqual(["empresa-demo"]);
    expect(empresas[0].es_demo).toBe(true);
  });

  it("consultar_kpi de julio trae valores formateados, N/D con motivo y origen", async () => {
    const r = await ejecutarHerramienta(await contexto(), "consultar_kpi", { empresa: "Empresa Demo", mes: "2026-07" });
    expect(r.periodo).toBe("Julio 2026");
    expect(r.es_demo).toBe(true);
    const kpis = r.kpis as { codigo: string; valor: string; estado: string; motivo_nd: string | null; meta: string }[];
    const ingresos = kpis.find((k) => k.codigo === "ingresos");
    // Empresa Demo tiene metas de demostración cargadas para julio (ingresos $8.000,0 M).
    expect(ingresos).toMatchObject({ valor: "$7.675,9 M", estado: "real", meta: "$8.000,0 M" });
    const recaudo = kpis.find((k) => k.codigo === "recaudo_total");
    expect(recaudo?.valor).toBe("N/D");
    expect(recaudo?.motivo_nd).toContain("medio de pago");
    expect(r.origen).toMatchObject({ caracter: "definitivo" });
  });

  it("consultar_kpi rechaza empresas fuera del permiso", async () => {
    const r = await ejecutarHerramienta(await contexto(), "consultar_kpi", { empresa: "Multisalud IPS" });
    expect(String(r.error)).toContain("No encuentro una empresa");
  });

  it("serie_kpi devuelve los meses con resultado", async () => {
    const r = await ejecutarHerramienta(await contexto(), "serie_kpi", { empresa: "empresa-demo", kpi: "ingresos" });
    const meses = r.meses as { mes: string; valor: string }[];
    expect(meses).toHaveLength(7);
    expect(meses[0].mes).toBe("Enero 2026");
    expect(meses[6].valor).toBe("$7.675,9 M");
  });

  it("top_conceptos agrupa variantes y calcula participación", async () => {
    const r = await ejecutarHerramienta(await contexto(), "top_conceptos", { empresa: "empresa-demo", seccion: "costos_gastos", mes: "2026-07", cantidad: 3 });
    const conceptos = r.conceptos as { concepto: string; valor: string; participacion: string }[];
    expect(conceptos).toHaveLength(3);
    expect(conceptos[0].concepto).toBe("ops");
    expect(conceptos[0].participacion).toBe("37,8%");
  });

  it("top_conceptos de cartera en julio es N/D (la hoja llega a mayo)", async () => {
    const r = await ejecutarHerramienta(await contexto(), "top_conceptos", { empresa: "empresa-demo", seccion: "cartera", mes: "2026-07" });
    expect(r.resultado).toBe("N/D");
  });

  it("terceros_compartidos no inventa cruces con una sola empresa visible", async () => {
    const r = await ejecutarHerramienta(await contexto(), "terceros_compartidos", {});
    expect(r.resultado).toBe("N/D");
  });

  it("semaforo_cargas de julio muestra Empresa Demo cargada", async () => {
    const r = await ejecutarHerramienta(await contexto(), "semaforo_cargas", { mes: "2026-07" });
    const empresas = r.empresas as { empresa: string; estado: string }[];
    expect(empresas).toEqual([expect.objectContaining({ empresa: "Empresa Demo", estado: "cargado" })]);
  });
});

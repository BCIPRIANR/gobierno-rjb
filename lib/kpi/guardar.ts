import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/tipos";
import type { Seccion } from "@/lib/parser/tipos";
import { calcularKpis, type DefinicionKpi, type HechoAgregable } from "./calcular";

type Admin = SupabaseClient<Database>;

const PAGINA = 1000;
const LOTE = 200;

/**
 * Calcula los KPI de todos los periodos contenidos en una carga aceptada y los
 * guarda en `kpi_resultados` (upsert por empresa + periodo + KPI). Devuelve
 * cuántos resultados se escribieron o un mensaje de error.
 */
export async function calcularYGuardarKpis(
  admin: Admin,
  carga: { id: string; empresa_id: string },
): Promise<{ ok: true; resultados: number; nd: number } | { ok: false; mensaje: string }> {
  // 1. Hechos de la carga (paginado: PostgREST limita a 1000 filas por consulta).
  const hechos: HechoAgregable[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await admin
      .from("hechos_financieros")
      .select("seccion, concepto, periodo, valor")
      .eq("carga_id", carga.id)
      .order("id")
      .range(desde, desde + PAGINA - 1);
    if (error) {
      console.error("[kpi] fallo al leer hechos", error.code);
      return { ok: false, mensaje: "No se pudieron leer los datos de la carga para calcular los KPI." };
    }
    for (const h of data) {
      hechos.push({ seccion: h.seccion as Seccion, concepto: h.concepto, periodo: h.periodo, valor: Number(h.valor) });
    }
    if (data.length < PAGINA) break;
  }

  // 2. Definiciones activas (configuración del analista).
  const { data: defs, error: errorDefs } = await admin
    .from("kpi_definiciones")
    .select("codigo, unidad, version, activo")
    .eq("activo", true);
  if (errorDefs || !defs) {
    console.error("[kpi] fallo al leer definiciones", errorDefs?.code);
    return { ok: false, mensaje: "No se pudieron leer las definiciones de KPI." };
  }
  const definiciones: DefinicionKpi[] = defs.map((d) => ({
    codigo: d.codigo,
    unidad: d.unidad as DefinicionKpi["unidad"],
    version: d.version,
    activo: d.activo,
  }));

  // 3. Cálculo puro.
  const resultados = calcularKpis(hechos, definiciones, carga.id);

  // 4. Upsert en lotes.
  const filas = resultados.map((r) => ({
    empresa_id: carga.empresa_id,
    periodo: r.periodo,
    kpi_codigo: r.kpi_codigo,
    valor: r.valor,
    estado: r.estado,
    motivo_nd: r.motivo_nd,
    insumos: r.insumos,
    formula_version: r.formula_version,
    calculado_en: new Date().toISOString(),
  }));
  for (let i = 0; i < filas.length; i += LOTE) {
    const { error } = await admin
      .from("kpi_resultados")
      .upsert(filas.slice(i, i + LOTE), { onConflict: "empresa_id,periodo,kpi_codigo" });
    if (error) {
      console.error("[kpi] fallo al guardar resultados", error.code, error.message);
      return { ok: false, mensaje: "No se pudieron guardar los resultados de KPI." };
    }
  }

  return { ok: true, resultados: filas.length, nd: filas.filter((f) => f.estado === "nd").length };
}

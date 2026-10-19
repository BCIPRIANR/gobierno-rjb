import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/tipos";
import { parsearInformesMulti } from "@/lib/parser/informes-multi";
import { evaluarInformesMulti } from "@/lib/checks/informes-multi";
import type { ResultadoCheck } from "@/lib/checks/tipos";
import type { Hecho } from "@/lib/parser/tipos";
import { calcularYGuardarKpis } from "@/lib/kpi/guardar";

type Admin = SupabaseClient<Database>;

export type CargaAProcesar = {
  id: string;
  empresa_id: string;
  tipo_archivo: string;
  /** `YYYY-MM-01` */
  periodo: string;
};

export type ResultadoProceso =
  | { estado: "aceptada"; hechos: number; avisos: number; ultimoMes: number | null; kpis: number; kpisNd: number; avisoKpi: string | null }
  | { estado: "rechazada"; motivo: string }
  | { estado: "procesando"; mensaje: string }
  | { estado: "error"; mensaje: string };

const TAMANO_LOTE = 500;

/**
 * Corre el parser y los checks sobre el archivo ya guardado y deja la carga en
 * `aceptada` (con sus hechos_financieros) o `rechazada` (con motivo). Solo el
 * INFORME_MENSUAL tiene revisión automática por ahora.
 */
export async function procesarCarga(admin: Admin, carga: CargaAProcesar, contenido: Uint8Array): Promise<ResultadoProceso> {
  if (carga.tipo_archivo !== "INFORME_MENSUAL") {
    const checks: ResultadoCheck[] = [
      { codigo: "sin_revision", ok: true, nivel: "aviso", mensaje: "Este tipo de archivo todavía no tiene revisión automática." },
    ];
    await admin.from("cargas").update({ resultado_checks: checks }).eq("id", carga.id);
    return { estado: "procesando", mensaje: "Archivo recibido. Este tipo todavía no tiene revisión automática." };
  }

  // 1. Parser (puro). Si el archivo no se puede leer, es rechazo con motivo claro.
  let parser;
  try {
    parser = parsearInformesMulti(contenido);
  } catch (e) {
    const motivo = `No se pudo leer el archivo como libro de Excel (${e instanceof Error ? e.message : "error desconocido"}). Guárdalo de nuevo como .xlsx e intenta otra vez.`;
    await rechazar(admin, carga.id, motivo, [{ codigo: "archivo_legible", ok: false, nivel: "error", mensaje: motivo }]);
    return { estado: "rechazada", motivo };
  }

  // 2. Checks
  const evaluacion = evaluarInformesMulti(parser, carga.periodo);
  if (evaluacion.estado === "rechazada") {
    await rechazar(admin, carga.id, evaluacion.motivoRechazo ?? "Rechazada por los controles automáticos.", evaluacion.checks);
    return { estado: "rechazada", motivo: evaluacion.motivoRechazo ?? "" };
  }

  // 3. Terceros por NIT (cartera): crear los que falten y resolver ids.
  const terceros = await resolverTerceros(admin, parser.hechos);
  if (terceros === null) {
    return { estado: "error", mensaje: "No se pudieron registrar los terceros (NIT). Intenta de nuevo en un momento." };
  }

  // 4. Hechos financieros en lotes, con hoja/fila/columna de origen.
  const anio = carga.periodo.slice(0, 4);
  const filas = parser.hechos.map((h) => ({
    carga_id: carga.id,
    empresa_id: carga.empresa_id,
    periodo: `${anio}-${String(h.mes).padStart(2, "0")}-01`,
    seccion: h.seccion,
    concepto: h.concepto,
    tercero_id: h.nit ? (terceros.get(h.nit) ?? null) : null,
    valor: h.valor,
    unidad: h.unidad,
    hoja_origen: h.hoja_origen,
    fila_origen: h.fila_origen,
    columna_origen: h.columna_origen,
  }));

  for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
    const { error } = await admin.from("hechos_financieros").insert(filas.slice(i, i + TAMANO_LOTE));
    if (error) {
      console.error("[cargas] fallo al guardar hechos", error.code);
      // Deja la carga en procesando sin hechos parciales.
      await admin.from("hechos_financieros").delete().eq("carga_id", carga.id);
      return { estado: "error", mensaje: "No se pudieron guardar los datos del archivo. Intenta de nuevo en un momento." };
    }
  }

  // 5. Aceptada. Primero la versión anterior deja de ser vigente (nada se borra): el índice
  //    `cargas_una_vigente` solo admite una carga aceptada y vigente por empresa/tipo/periodo.
  await marcarAnterioresNoVigentes(admin, carga);
  const { error: errorEstado } = await admin
    .from("cargas")
    .update({ estado: "aceptada", resultado_checks: evaluacion.checks, motivo_rechazo: null })
    .eq("id", carga.id);
  if (errorEstado) {
    console.error("[cargas] fallo al marcar aceptada", errorEstado.code);
    await admin.from("hechos_financieros").delete().eq("carga_id", carga.id);
    return { estado: "error", mensaje: "No se pudo actualizar el estado de la carga. Intenta de nuevo." };
  }

  // 6. KPI de todos los meses de la carga. Un fallo aquí no revierte la aceptación: se avisa.
  const kpi = await calcularYGuardarKpis(admin, { id: carga.id, empresa_id: carga.empresa_id });

  return {
    estado: "aceptada",
    hechos: filas.length,
    avisos: evaluacion.checks.filter((c) => c.nivel === "aviso").length,
    ultimoMes: evaluacion.ultimoMesDatos,
    kpis: kpi.ok ? kpi.resultados : 0,
    kpisNd: kpi.ok ? kpi.nd : 0,
    avisoKpi: kpi.ok ? null : kpi.mensaje,
  };
}

async function rechazar(admin: Admin, cargaId: string, motivo: string, checks: ResultadoCheck[]) {
  const { error } = await admin
    .from("cargas")
    .update({ estado: "rechazada", motivo_rechazo: motivo, resultado_checks: checks, vigente: false })
    .eq("id", cargaId);
  if (error) console.error("[cargas] fallo al marcar rechazada", error.code);
}

/** NIT → tercero_id. Crea los terceros que no existan (tipo 'otro'; el analista lo afina después). */
async function resolverTerceros(admin: Admin, hechos: Hecho[]): Promise<Map<string, string> | null> {
  const porNit = new Map<string, string>();
  for (const h of hechos) {
    if (h.nit && !porNit.has(h.nit)) porNit.set(h.nit, h.concepto);
  }
  const mapa = new Map<string, string>();
  if (porNit.size === 0) return mapa;

  const nuevos = [...porNit].map(([nit, razon_social]) => ({ nit, razon_social, tipo: "otro" }));
  const { error: errorUpsert } = await admin.from("terceros").upsert(nuevos, { onConflict: "nit", ignoreDuplicates: true });
  if (errorUpsert) {
    console.error("[cargas] fallo al crear terceros", errorUpsert.code);
    return null;
  }
  const { data, error } = await admin.from("terceros").select("id, nit").in("nit", [...porNit.keys()]);
  if (error || !data) {
    console.error("[cargas] fallo al leer terceros", error?.code);
    return null;
  }
  for (const t of data) mapa.set(t.nit, t.id);
  return mapa;
}

async function marcarAnterioresNoVigentes(admin: Admin, c: CargaAProcesar) {
  const { error } = await admin
    .from("cargas")
    .update({ vigente: false })
    .eq("empresa_id", c.empresa_id)
    .eq("tipo_archivo", c.tipo_archivo)
    .eq("periodo", c.periodo)
    .neq("id", c.id)
    .eq("vigente", true);
  if (error) console.error("[cargas] no se pudo marcar versiones anteriores", error.code);
}

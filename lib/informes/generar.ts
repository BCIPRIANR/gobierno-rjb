import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/tipos";
import type { ResultadoMes } from "@/lib/kpi/comparar";
import { periodoAnteriorDe } from "@/lib/kpi/calcular";
import { redactarInforme } from "@/lib/ia/informe";
import { notificar, type Destinatario } from "@/lib/notificaciones/enviar";
import { armarDatosInforme, type DatosInforme, type DefinicionInforme } from "./armar";
import type { UnidadKpi } from "@/lib/formato";
import type { Sentido } from "@/lib/kpi/semaforo";

type Admin = SupabaseClient<Database>;

export type ResultadoGeneracion =
  | { ok: true; informeId: string; conIa: boolean; avisoIa: string | null }
  | { ok: false; mensaje: string };

function urlApp(ruta: string): string {
  return `${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}${ruta}`;
}

function leerCargaId(insumos: Json): string | null {
  if (insumos && typeof insumos === "object" && !Array.isArray(insumos)) {
    const v = (insumos as Record<string, Json | undefined>).carga_id;
    return typeof v === "string" ? v : null;
  }
  return null;
}

/**
 * Genera (o regenera) el borrador del informe de Junta de una empresa y periodo.
 * Conserva los bloques del gerente si ya existían. El permiso sobre la empresa lo
 * verifica quien llama (Server Action o flujo de carga).
 */
export async function generarInformeJunta(
  admin: Admin,
  p: { empresaId: string; periodo: string; generadoPor: string | null; avisar: boolean },
): Promise<ResultadoGeneracion> {
  const anio = p.periodo.slice(0, 4);
  const [empresaRes, defsRes, resRes, metasRes] = await Promise.all([
    admin.from("empresas").select("id, nombre, es_demo").eq("id", p.empresaId).maybeSingle(),
    admin.from("kpi_definiciones").select("codigo, nombre, unidad, sentido, definicion").eq("activo", true),
    admin
      .from("kpi_resultados")
      .select("kpi_codigo, periodo, valor, estado, motivo_nd, insumos")
      .eq("empresa_id", p.empresaId)
      .gte("periodo", `${anio}-01-01`)
      .lte("periodo", `${anio}-12-01`),
    admin.from("metas").select("kpi_codigo, valor").eq("empresa_id", p.empresaId).eq("periodo", p.periodo),
  ]);
  if (!empresaRes.data) return { ok: false, mensaje: "La empresa no existe." };
  const resultados: ResultadoMes[] = (resRes.data ?? []).map((r) => ({
    kpi_codigo: r.kpi_codigo,
    periodo: r.periodo,
    valor: r.valor === null ? null : Number(r.valor),
    estado: r.estado,
    insumos: r.insumos,
  }));
  if (!resultados.some((r) => r.periodo === p.periodo)) {
    return { ok: false, mensaje: "No hay KPI calculados para ese mes: primero debe aceptarse una carga que lo cubra." };
  }

  const delPeriodo = (resRes.data ?? []).filter((r) => r.periodo === p.periodo);
  const cargaId = delPeriodo.map((r) => leerCargaId(r.insumos)).find((x) => x !== null) ?? null;
  const { data: carga } = cargaId
    ? await admin.from("cargas").select("id, version, caracter, periodo, subido_en").eq("id", cargaId).maybeSingle()
    : { data: null };

  const periodoAnterior = periodoAnteriorDe(p.periodo);
  const { data: hechosCartera } = cargaId
    ? await admin
        .from("hechos_financieros")
        .select("concepto, valor, periodo")
        .eq("carga_id", cargaId)
        .eq("seccion", "cartera")
        .in("periodo", [p.periodo, periodoAnterior])
        .limit(2000)
    : { data: [] };

  const datos = armarDatosInforme({
    empresa: empresaRes.data,
    periodo: p.periodo,
    definiciones: (defsRes.data ?? []).map(
      (d): DefinicionInforme => ({ codigo: d.codigo, nombre: d.nombre, unidad: d.unidad as UnidadKpi, sentido: d.sentido as Sentido, definicion: d.definicion }),
    ),
    resultados,
    motivosNd: Object.fromEntries(delPeriodo.map((r) => [r.kpi_codigo, r.motivo_nd])),
    metas: Object.fromEntries((metasRes.data ?? []).map((m) => [m.kpi_codigo, Number(m.valor)])),
    carga: carga ? { id: carga.id, version: carga.version, caracter: carga.caracter, periodo: carga.periodo, subido_en: carga.subido_en } : null,
    cartera: {
      actual: (hechosCartera ?? []).filter((h) => h.periodo === p.periodo).map((h) => ({ concepto: h.concepto, valor: Number(h.valor) })),
      anterior: (hechosCartera ?? []).filter((h) => h.periodo === periodoAnterior).map((h) => ({ concepto: h.concepto, valor: Number(h.valor) })),
    },
  });

  const { data: existente } = await admin
    .from("informes_junta")
    .select("id, estado")
    .eq("empresa_id", p.empresaId)
    .eq("periodo", p.periodo)
    .maybeSingle();

  if (existente?.estado === "aprobado") {
    return { ok: false, mensaje: "El informe de ese mes ya está aprobado; no se regenera. Si hay que corregirlo, un administrador debe reabrirlo." };
  }

  // Redacción por IA (solo narra lo armado). Si falla, el informe queda sin resumen y lo dice.
  const redaccion = await redactarInforme(datos);
  const resumenIa = redaccion.ok
    ? [redaccion.redaccion.resumen.ventas, redaccion.redaccion.resumen.rentabilidad, redaccion.redaccion.resumen.caja_cartera].join("\n")
    : null;
  const alertasIa: Json = redaccion.ok ? redaccion.redaccion.alertas : [];

  const fila = {
    empresa_id: p.empresaId,
    periodo: p.periodo,
    estado: "borrador" as const,
    datos: datos as unknown as Json,
    resumen_ia: resumenIa,
    alertas_ia: alertasIa,
    modelo_ia: redaccion.ok ? redaccion.modelo : null,
    generado_en: new Date().toISOString(),
    generado_por: p.generadoPor,
    actualizado_en: new Date().toISOString(),
  };
  const { data: guardado, error } = existente
    ? await admin.from("informes_junta").update(fila).eq("id", existente.id).select("id").single()
    : await admin.from("informes_junta").insert(fila).select("id").single();
  if (error || !guardado) {
    console.error("[informes] no se pudo guardar", error?.code);
    return { ok: false, mensaje: "No se pudo guardar el borrador del informe." };
  }

  if (p.avisar) await avisarBorrador(admin, datos, guardado.id, resumenIa);

  return { ok: true, informeId: guardado.id, conIa: redaccion.ok, avisoIa: redaccion.ok ? null : redaccion.error };
}

/** Aviso a los gerentes de la empresa y al Founder: el borrador está listo (WhatsApp + correo). */
async function avisarBorrador(admin: Admin, datos: DatosInforme, informeId: string, resumen: string | null) {
  const demo = datos.empresa.es_demo ? " [DATOS DE DEMOSTRACIÓN]" : "";
  const estado = datos.estadoGeneral;
  const mensaje = {
    asunto: `Borrador del informe de Junta: ${datos.empresa.nombre} · ${datos.periodoTexto}${demo}`,
    cuerpo:
      `${datos.empresa.nombre}${demo} · ${datos.periodoTexto}. Estado general: ${estado.color} (${estado.verdes} verdes, ${estado.amarillos} amarillos, ${estado.rojos} rojos, ${estado.sinMeta} sin meta).` +
      (resumen ? `\n${resumen}` : "\nEl resumen no se pudo redactar; revisa el tablero en el informe.") +
      `\nCompleta los bloques del gerente aquí: ${urlApp(`/informes?empresa=${datos.empresa.id}&mes=${datos.periodo.slice(0, 7)}`)}`,
  };

  const { data: gerentes } = await admin
    .from("usuario_empresa")
    .select("perfiles!inner(id, nombre, email, telefono_whatsapp, rol, activo)")
    .eq("empresa_id", datos.empresa.id)
    .eq("perfiles.rol", "gerente")
    .eq("perfiles.activo", true);
  const { data: founders } = await admin.from("perfiles").select("id, nombre, email, telefono_whatsapp").eq("rol", "founder").eq("activo", true);

  const destinatarios: Destinatario[] = [
    ...(gerentes ?? []).flatMap((g) => (g.perfiles ? [{ id: g.perfiles.id, nombre: g.perfiles.nombre, email: g.perfiles.email, telefono_whatsapp: g.perfiles.telefono_whatsapp }] : [])),
    ...(founders ?? []),
  ];
  const vistos = new Set<string>();
  for (const d of destinatarios) {
    if (vistos.has(d.id)) continue;
    vistos.add(d.id);
    await notificar(admin, { destinatario: d, empresaId: datos.empresa.id, tipo: "resumen", mensaje, canales: ["whatsapp", "email"] });
  }
  void informeId;
}

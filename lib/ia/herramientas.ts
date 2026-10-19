import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/tipos";
import { formatearCOPMillones, formatearPeriodo, formatearValorKpi, type UnidadKpi } from "@/lib/formato";
import { periodoDeReporte, periodoDesdeMes } from "@/lib/periodos";

/**
 * Herramientas del chat. Todas leen con el cliente DEL USUARIO (RLS decide qué ve),
 * solo desde kpi_resultados, metas, semaforo_cargas, v_terceros_compartidos y los
 * agregados por concepto. Nunca archivos crudos. Si no hay dato, devuelven N/D.
 */

type ClienteUsuario = SupabaseClient<Database>;

export type ContextoHerramientas = {
  supabase: ClienteUsuario;
  usuarioId: string;
};

const esquemaEmpresa = z.string().min(1).max(80);
const esquemaMes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional();

const SECCIONES_TOP = ["ingresos", "recaudo_entidad", "cartera", "costos_gastos", "pagos"] as const;

export const HERRAMIENTAS: Anthropic.Tool[] = [
  {
    name: "listar_empresas",
    description:
      "Lista las empresas que el usuario puede ver, con su slug (úsalo en las demás herramientas) y si son de demostración. Llama esta herramienta primero si no sabes a qué empresa se refiere el usuario.",
    input_schema: { type: "object", properties: {}, additionalProperties: false, required: [] },
    strict: true,
  },
  {
    name: "consultar_kpi",
    description:
      "KPI calculados de una empresa en un mes: valor formateado, estado (real, calculado, meta o N/D con motivo), meta si existe y carga de origen (versión, carácter preliminar/definitivo). Si no indicas mes, usa el último con resultados.",
    input_schema: {
      type: "object",
      properties: {
        empresa: { type: "string", description: "Slug o nombre de la empresa" },
        mes: { type: "string", description: "Mes en formato YYYY-MM. Opcional." },
      },
      required: ["empresa"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "serie_kpi",
    description:
      "Serie mensual de un KPI de una empresa en un año (enero a diciembre) para hablar de tendencia, acumulado o comparar meses. Devuelve N/D en los meses sin dato.",
    input_schema: {
      type: "object",
      properties: {
        empresa: { type: "string", description: "Slug o nombre de la empresa" },
        kpi: {
          type: "string",
          description:
            "Código del KPI: ingresos, costos_gastos, excedente, pct_costos_ingresos, recaudo_total, eficiencia_recaudo, pagos, flujo_neto, cartera_total, var_cartera, concentracion_top5, personal_ingresos, personal_retiros",
        },
        anio: { type: "string", description: "Año YYYY. Opcional; por defecto el del último mes con resultados." },
      },
      required: ["empresa", "kpi"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "top_conceptos",
    description:
      "Los mayores conceptos de una sección en un mes: entidades por ingresos, entidades por recaudo, deudores por cartera, categorías de costos y gastos, o categorías de pagos. Incluye participación sobre el total.",
    input_schema: {
      type: "object",
      properties: {
        empresa: { type: "string", description: "Slug o nombre de la empresa" },
        seccion: { type: "string", enum: [...SECCIONES_TOP] },
        mes: { type: "string", description: "Mes YYYY-MM. Opcional: último con resultados." },
        cantidad: { type: "integer", description: "Cuántos conceptos devolver (1 a 10). Por defecto 5." },
      },
      required: ["empresa", "seccion"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "terceros_compartidos",
    description:
      "EPS, pagadores o proveedores que aparecen en más de una empresa del grupo (cruce por NIT) en un mes y sección. Solo cuenta las empresas que el usuario puede ver.",
    input_schema: {
      type: "object",
      properties: {
        mes: { type: "string", description: "Mes YYYY-MM. Opcional: último con datos." },
        seccion: { type: "string", enum: ["cartera", "ingresos", "recaudo_entidad", "pagos", "costos_gastos"], description: "Opcional; por defecto cartera." },
      },
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "semaforo_cargas",
    description:
      "Estado de las cargas del informe mensual por empresa para un mes reportado: cargado, pendiente o atrasado, con fecha límite y días de atraso.",
    input_schema: {
      type: "object",
      properties: { mes: { type: "string", description: "Mes reportado YYYY-MM. Opcional: el mes anterior al actual." } },
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
];

type Resultado = Record<string, unknown>;

export async function ejecutarHerramienta(ctx: ContextoHerramientas, nombre: string, entrada: unknown): Promise<Resultado> {
  switch (nombre) {
    case "listar_empresas":
      return listarEmpresas(ctx);
    case "consultar_kpi": {
      const p = z.object({ empresa: esquemaEmpresa, mes: esquemaMes }).parse(entrada);
      return consultarKpi(ctx, p.empresa, p.mes);
    }
    case "serie_kpi": {
      const p = z.object({ empresa: esquemaEmpresa, kpi: z.string().min(1).max(40), anio: z.string().regex(/^\d{4}$/).optional() }).parse(entrada);
      return serieKpi(ctx, p.empresa, p.kpi, p.anio);
    }
    case "top_conceptos": {
      const p = z
        .object({ empresa: esquemaEmpresa, seccion: z.enum(SECCIONES_TOP), mes: esquemaMes, cantidad: z.number().int().min(1).max(10).optional() })
        .parse(entrada);
      return topConceptos(ctx, p.empresa, p.seccion, p.mes, p.cantidad ?? 5);
    }
    case "terceros_compartidos": {
      const p = z.object({ mes: esquemaMes, seccion: z.enum(["cartera", "ingresos", "recaudo_entidad", "pagos", "costos_gastos"]).optional() }).parse(entrada);
      return tercerosCompartidos(ctx, p.mes, p.seccion ?? "cartera");
    }
    case "semaforo_cargas": {
      const p = z.object({ mes: esquemaMes }).parse(entrada);
      return semaforo(ctx, p.mes);
    }
    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

// ---------------------------------------------------------------------------

async function listarEmpresas(ctx: ContextoHerramientas): Promise<Resultado> {
  const { data } = await ctx.supabase.from("empresas").select("id, nombre, slug, es_demo").eq("activa", true).order("es_demo").order("nombre");
  return {
    empresas: (data ?? []).map((e) => ({ slug: e.slug, nombre: e.nombre, es_demo: e.es_demo })),
    nota: "Las empresas con es_demo = true son de demostración: dilo siempre que cites sus datos.",
  };
}

async function resolverEmpresa(ctx: ContextoHerramientas, texto: string) {
  const { data } = await ctx.supabase.from("empresas").select("id, nombre, slug, es_demo").eq("activa", true);
  const lista = data ?? [];
  const t = texto.trim().toLowerCase();
  return (
    lista.find((e) => e.slug === t) ??
    lista.find((e) => e.nombre.toLowerCase() === t) ??
    lista.find((e) => e.nombre.toLowerCase().includes(t) || t.includes(e.slug)) ??
    null
  );
}

async function ultimoPeriodoConResultados(ctx: ContextoHerramientas, empresaId: string): Promise<string | null> {
  const { data } = await ctx.supabase
    .from("kpi_resultados")
    .select("periodo")
    .eq("empresa_id", empresaId)
    .order("periodo", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.periodo ?? null;
}

function sinEmpresa(texto: string): Resultado {
  return { error: `No encuentro una empresa llamada "${texto}" entre las que puedes ver. Usa listar_empresas.` };
}

async function consultarKpi(ctx: ContextoHerramientas, empresaTexto: string, mes?: string): Promise<Resultado> {
  const empresa = await resolverEmpresa(ctx, empresaTexto);
  if (!empresa) return sinEmpresa(empresaTexto);
  const periodo = periodoDesdeMes(mes) ?? (await ultimoPeriodoConResultados(ctx, empresa.id));
  if (!periodo) return { empresa: empresa.nombre, es_demo: empresa.es_demo, resultado: "N/D", motivo: "La empresa no tiene cargas aceptadas todavía." };

  const [resRes, defsRes, metasRes] = await Promise.all([
    ctx.supabase.from("kpi_resultados").select("kpi_codigo, valor, estado, motivo_nd, insumos").eq("empresa_id", empresa.id).eq("periodo", periodo),
    ctx.supabase.from("kpi_definiciones").select("codigo, nombre, unidad, formula_texto, sentido").eq("activo", true),
    ctx.supabase.from("metas").select("kpi_codigo, valor").eq("empresa_id", empresa.id).eq("periodo", periodo),
  ]);
  const defs = new Map((defsRes.data ?? []).map((d) => [d.codigo, d]));
  const metas = new Map((metasRes.data ?? []).map((m) => [m.kpi_codigo, Number(m.valor)]));
  const resultados = resRes.data ?? [];
  if (resultados.length === 0) {
    return { empresa: empresa.nombre, es_demo: empresa.es_demo, periodo: formatearPeriodo(periodo), resultado: "N/D", motivo: "No hay KPI calculados para ese mes." };
  }

  // Carga de origen (trazabilidad) desde los insumos.
  const cargaId = resultados.map((r) => leerCargaId(r.insumos)).find((x) => x !== null) ?? null;
  const { data: carga } = cargaId
    ? await ctx.supabase.from("cargas").select("version, caracter, periodo, subido_en").eq("id", cargaId).maybeSingle()
    : { data: null };

  return {
    empresa: empresa.nombre,
    es_demo: empresa.es_demo,
    periodo: formatearPeriodo(periodo),
    origen: carga
      ? { caracter: carga.caracter, version: carga.version, periodo_carga: formatearPeriodo(carga.periodo), subido_en: carga.subido_en }
      : null,
    kpis: resultados.map((r) => {
      const d = defs.get(r.kpi_codigo);
      const unidad = (d?.unidad ?? "cop") as UnidadKpi;
      const meta = metas.get(r.kpi_codigo);
      return {
        codigo: r.kpi_codigo,
        nombre: d?.nombre ?? r.kpi_codigo,
        formula: d?.formula_texto ?? null,
        estado: r.estado,
        valor: r.estado === "nd" || r.valor === null ? "N/D" : formatearValorKpi(Number(r.valor), unidad),
        valor_crudo: r.estado === "nd" || r.valor === null ? null : Number(r.valor),
        unidad,
        sentido: d?.sentido ?? null,
        motivo_nd: r.motivo_nd,
        meta: meta === undefined ? "Sin meta definida" : formatearValorKpi(meta, unidad),
      };
    }),
  };
}

async function serieKpi(ctx: ContextoHerramientas, empresaTexto: string, kpi: string, anio?: string): Promise<Resultado> {
  const empresa = await resolverEmpresa(ctx, empresaTexto);
  if (!empresa) return sinEmpresa(empresaTexto);
  const { data: def } = await ctx.supabase.from("kpi_definiciones").select("codigo, nombre, unidad").eq("codigo", kpi).maybeSingle();
  if (!def) return { error: `No existe el KPI "${kpi}". Usa uno de los códigos de la descripción de la herramienta.` };
  const anioFinal = anio ?? (await ultimoPeriodoConResultados(ctx, empresa.id))?.slice(0, 4);
  if (!anioFinal) return { empresa: empresa.nombre, es_demo: empresa.es_demo, resultado: "N/D", motivo: "La empresa no tiene cargas aceptadas todavía." };

  const { data } = await ctx.supabase
    .from("kpi_resultados")
    .select("periodo, valor, estado, motivo_nd")
    .eq("empresa_id", empresa.id)
    .eq("kpi_codigo", kpi)
    .gte("periodo", `${anioFinal}-01-01`)
    .lte("periodo", `${anioFinal}-12-01`)
    .order("periodo");
  const unidad = def.unidad as UnidadKpi;
  return {
    empresa: empresa.nombre,
    es_demo: empresa.es_demo,
    kpi: def.nombre,
    anio: anioFinal,
    meses: (data ?? []).map((r) => ({
      mes: formatearPeriodo(r.periodo),
      estado: r.estado,
      valor: r.estado === "nd" || r.valor === null ? "N/D" : formatearValorKpi(Number(r.valor), unidad),
      valor_crudo: r.estado === "nd" || r.valor === null ? null : Number(r.valor),
      motivo_nd: r.motivo_nd,
    })),
    nota: "Los meses que no aparecen no tienen resultado. No estimes ni rellenes.",
  };
}

async function topConceptos(ctx: ContextoHerramientas, empresaTexto: string, seccion: (typeof SECCIONES_TOP)[number], mes: string | undefined, cantidad: number): Promise<Resultado> {
  const empresa = await resolverEmpresa(ctx, empresaTexto);
  if (!empresa) return sinEmpresa(empresaTexto);
  const periodo = periodoDesdeMes(mes) ?? (await ultimoPeriodoConResultados(ctx, empresa.id));
  if (!periodo) return { empresa: empresa.nombre, es_demo: empresa.es_demo, resultado: "N/D", motivo: "La empresa no tiene cargas aceptadas todavía." };

  // Solo la carga vigente y aceptada del informe mensual que cubre ese mes (la de periodo >= mes más reciente).
  const { data: cargas } = await ctx.supabase
    .from("cargas")
    .select("id, periodo, caracter, version")
    .eq("empresa_id", empresa.id)
    .eq("tipo_archivo", "INFORME_MENSUAL")
    .eq("estado", "aceptada")
    .eq("vigente", true)
    .gte("periodo", periodo)
    .order("periodo", { ascending: false })
    .limit(1);
  const carga = cargas?.[0];
  if (!carga) return { empresa: empresa.nombre, es_demo: empresa.es_demo, periodo: formatearPeriodo(periodo), resultado: "N/D", motivo: "No hay una carga aceptada que cubra ese mes." };

  const { data: hechos } = await ctx.supabase
    .from("hechos_financieros")
    .select("concepto, valor")
    .eq("carga_id", carga.id)
    .eq("periodo", periodo)
    .eq("seccion", seccion)
    .limit(1000);
  const porConcepto = new Map<string, { concepto: string; valor: number }>();
  let total = 0;
  for (const h of hechos ?? []) {
    const clave = h.concepto.trim().toUpperCase();
    const acc = porConcepto.get(clave) ?? { concepto: h.concepto.trim(), valor: 0 };
    acc.valor += Number(h.valor);
    porConcepto.set(clave, acc);
    total += Number(h.valor);
  }
  if (porConcepto.size === 0) {
    return { empresa: empresa.nombre, es_demo: empresa.es_demo, periodo: formatearPeriodo(periodo), seccion, resultado: "N/D", motivo: "La carga no trae datos de esa sección para ese mes." };
  }
  const top = [...porConcepto.values()].sort((a, b) => b.valor - a.valor).slice(0, cantidad);
  return {
    empresa: empresa.nombre,
    es_demo: empresa.es_demo,
    periodo: formatearPeriodo(periodo),
    seccion,
    origen: { caracter: carga.caracter, version: carga.version, periodo_carga: formatearPeriodo(carga.periodo) },
    total: formatearCOPMillones(total),
    conceptos: top.map((c) => ({
      concepto: c.concepto,
      valor: formatearCOPMillones(c.valor),
      participacion: total !== 0 ? `${((c.valor / total) * 100).toFixed(1).replace(".", ",")}%` : "N/D",
    })),
  };
}

async function tercerosCompartidos(ctx: ContextoHerramientas, mes: string | undefined, seccion: string): Promise<Resultado> {
  let consulta = ctx.supabase
    .from("v_terceros_compartidos")
    .select("nit, razon_social, tipo, seccion, periodo, num_empresas, empresas, incluye_demo, valor_total")
    .eq("seccion", seccion)
    .order("periodo", { ascending: false })
    .order("num_empresas", { ascending: false })
    .limit(25);
  const periodo = periodoDesdeMes(mes);
  if (periodo) consulta = consulta.eq("periodo", periodo);
  const { data } = await consulta;
  const filas = data ?? [];
  if (filas.length === 0) {
    return {
      resultado: "N/D",
      motivo: `No hay terceros compartidos en ${seccion}${periodo ? ` para ${formatearPeriodo(periodo)}` : ""} entre las empresas que puedes ver. Se necesitan cargas aceptadas de al menos dos empresas con NIT en esa sección.`,
    };
  }
  const periodoUsado = periodo ?? filas[0].periodo;
  return {
    periodo: periodoUsado ? formatearPeriodo(periodoUsado) : null,
    seccion,
    terceros: filas
      .filter((f) => f.periodo === periodoUsado)
      .map((f) => ({
        nit: f.nit,
        razon_social: f.razon_social,
        tipo: f.tipo,
        empresas: f.empresas,
        num_empresas: f.num_empresas,
        incluye_demo: f.incluye_demo,
        valor_total: f.valor_total === null ? "N/D" : formatearCOPMillones(Number(f.valor_total)),
      })),
  };
}

async function semaforo(ctx: ContextoHerramientas, mes?: string): Promise<Resultado> {
  const periodo = periodoDesdeMes(mes) ?? periodoDeReporte();
  const { data, error } = await ctx.supabase.rpc("semaforo_cargas", { p_periodo: periodo });
  if (error) return { error: "No se pudo leer el semáforo." };
  return {
    periodo: formatearPeriodo(periodo),
    empresas: (data ?? []).map((f) => ({
      empresa: f.empresa,
      es_demo: f.es_demo,
      estado: f.estado,
      fecha_limite: f.fecha_limite,
      dias_atraso: f.dias_atraso,
      caracter: f.caracter,
      ultima_carga: f.ultima_carga,
    })),
  };
}

function leerCargaId(insumos: unknown): string | null {
  if (insumos && typeof insumos === "object" && !Array.isArray(insumos)) {
    const v = (insumos as Record<string, unknown>).carga_id;
    return typeof v === "string" ? v : null;
  }
  return null;
}

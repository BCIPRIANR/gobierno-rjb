import type { Metadata } from "next";
import { empresasDelUsuario, requerirRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/tipos";
import { acumuladoAnual, serieAnual, variacionMensual, type ResultadoMes } from "@/lib/kpi/comparar";
import { formatearFechaHora, formatearPeriodo, type UnidadKpi } from "@/lib/formato";
import { NOMBRE_MES } from "@/lib/parser/texto";
import { FiltrosGestion } from "@/components/gestion/filtros";
import { TarjetaKpi, type DatosTarjeta, type Sentido } from "@/components/gestion/tarjeta-kpi";
import { GraficoBarrasPareadas, GraficoBarrasSigno, GraficoLinea, type PuntoMes } from "@/components/gestion/graficos";
import { Top5, top } from "@/components/gestion/top5";

export const metadata: Metadata = { title: "Gestión" };

/** Orden de las tarjetas en el tablero. */
const ORDEN_KPI = [
  "ingresos", "costos_gastos", "excedente", "pct_costos_ingresos",
  "recaudo_total", "eficiencia_recaudo", "pagos", "flujo_neto",
  "cartera_total", "var_cartera", "concentracion_top5",
  "personal_ingresos", "personal_retiros",
];

const MES_CORTO = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function leerCargaId(insumos: Json): string | null {
  if (insumos && typeof insumos === "object" && !Array.isArray(insumos)) {
    const v = (insumos as Record<string, Json | undefined>).carga_id;
    return typeof v === "string" ? v : null;
  }
  return null;
}

export default async function PaginaGestion({ searchParams }: PageProps<"/gestion">) {
  const [usuario, empresas, params] = await Promise.all([requerirRol("founder", "admin", "gerente"), empresasDelUsuario(), searchParams]);
  void usuario;

  if (empresas.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold text-navy">Dashboard de Gestión</h2>
        <p className="rounded-lg border border-gris-borde bg-white p-5 text-sm text-gris-texto">No tienes empresas asignadas.</p>
      </div>
    );
  }

  const slugParam = typeof params.empresa === "string" ? params.empresa : null;
  const empresa = empresas.find((e) => e.slug === slugParam) ?? empresas[0];

  const supabase = await crearClienteServidor();

  // Meses con resultados para la empresa (más reciente primero).
  const { data: periodosData } = await supabase
    .from("kpi_resultados")
    .select("periodo")
    .eq("empresa_id", empresa.id)
    .order("periodo", { ascending: false });
  const periodos = [...new Set((periodosData ?? []).map((p) => p.periodo))];

  const mesParam = typeof params.mes === "string" && /^\d{4}-\d{2}$/.test(params.mes) ? `${params.mes}-01` : null;
  const periodo = (mesParam && periodos.includes(mesParam) ? mesParam : periodos[0]) ?? null;

  const encabezado = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-navy">Dashboard de Gestión</h2>
          <p className="mt-1 text-sm text-gris-texto">
            {empresa.nombre}
            {periodo ? ` · ${formatearPeriodo(periodo)}` : ""}
          </p>
        </div>
        <FiltrosGestion empresas={empresas} empresaSlug={empresa.slug} periodos={periodos} periodo={periodo} />
      </div>
      {empresa.es_demo ? (
        <p className="rounded-md border border-turquesa/40 bg-turquesa/5 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-turquesa">
          Datos de demostración
        </p>
      ) : null}
    </div>
  );

  if (!periodo) {
    return (
      <div className="flex flex-col gap-6">
        {encabezado}
        <p className="rounded-lg border border-dashed border-gris-borde bg-white p-5 text-sm text-gris-texto">
          Todavía no hay cargas aceptadas de {empresa.nombre}. Cuando el contador suba el informe mensual y pase los controles, aquí aparecerán los KPI.
        </p>
      </div>
    );
  }

  const anio = periodo.slice(0, 4);
  const mesActual = Number(periodo.slice(5, 7));

  const [defsRes, resultadosRes, metasRes] = await Promise.all([
    supabase.from("kpi_definiciones").select("codigo, nombre, definicion, fuente, unidad, sentido").eq("activo", true),
    supabase
      .from("kpi_resultados")
      .select("kpi_codigo, periodo, valor, estado, motivo_nd, insumos")
      .eq("empresa_id", empresa.id)
      .gte("periodo", `${anio}-01-01`)
      .lte("periodo", `${anio}-12-01`),
    supabase.from("metas").select("kpi_codigo, valor").eq("empresa_id", empresa.id).eq("periodo", periodo),
  ]);

  const definiciones = defsRes.data ?? [];
  const resultados: ResultadoMes[] = (resultadosRes.data ?? []).map((r) => ({
    kpi_codigo: r.kpi_codigo,
    periodo: r.periodo,
    valor: r.valor === null ? null : Number(r.valor),
    estado: r.estado,
    insumos: r.insumos,
  }));
  const motivos = new Map((resultadosRes.data ?? []).filter((r) => r.periodo === periodo).map((r) => [r.kpi_codigo, r.motivo_nd]));
  const metas = new Map((metasRes.data ?? []).map((m) => [m.kpi_codigo, Number(m.valor)]));

  // Carga de origen del mes (trazabilidad: tablero → kpi_resultados → carga).
  const resultadoIngresos = resultados.find((r) => r.kpi_codigo === "ingresos" && r.periodo === periodo);
  const cargaId = resultadoIngresos ? leerCargaId(resultadoIngresos.insumos) : null;
  const { data: carga } = cargaId
    ? await supabase.from("cargas").select("id, caracter, subido_en, periodo, nombre_archivo, version").eq("id", cargaId).maybeSingle()
    : { data: null };

  // Hechos del mes para los top 5 (solo de la carga de origen).
  const { data: hechos } = cargaId
    ? await supabase
        .from("hechos_financieros")
        .select("seccion, concepto, valor")
        .eq("carga_id", cargaId)
        .eq("periodo", periodo)
        .in("seccion", ["ingresos", "recaudo_entidad", "cartera", "costos_gastos"])
        .limit(1000)
    : { data: [] };
  const porSeccion = (s: string) => (hechos ?? []).filter((h) => h.seccion === s).map((h) => ({ concepto: h.concepto, valor: Number(h.valor) }));

  const tarjetas: DatosTarjeta[] = ORDEN_KPI.flatMap((codigo) => {
    const def = definiciones.find((d) => d.codigo === codigo);
    if (!def) return [];
    const r = resultados.find((x) => x.kpi_codigo === codigo && x.periodo === periodo);
    const unidad = def.unidad as UnidadKpi;
    return [
      {
        codigo,
        nombre: def.nombre,
        definicion: def.definicion,
        fuente: def.fuente,
        unidad,
        sentido: def.sentido as Sentido,
        valor: r?.valor ?? null,
        estado: r?.estado ?? "nd",
        motivoNd: r ? (motivos.get(codigo) ?? null) : `Sin resultado para ${formatearPeriodo(periodo)}.`,
        variacion: variacionMensual(codigo, unidad, periodo, resultados),
        acumulado: acumuladoAnual(codigo, periodo, resultados),
        meta: metas.get(codigo) ?? null,
        serie: serieAnual(codigo, anio, resultados),
        mesActual,
      },
    ];
  });

  // Series para gráficos: enero → mes seleccionado.
  const serie = (codigo: string) => serieAnual(codigo, anio, resultados);
  const puntos = (a: string, b?: string): PuntoMes[] => {
    const sa = serie(a);
    const sb = b ? serie(b) : null;
    return Array.from({ length: mesActual }, (_, i) => ({ mes: MES_CORTO[i + 1], a: sa[i], b: sb ? sb[i] : null }));
  };

  return (
    <div className="flex flex-col gap-6">
      {encabezado}

      {carga ? (
        <p className="text-xs text-gris-texto">
          Fuente: {carga.nombre_archivo} (v{carga.version}, periodo {formatearPeriodo(carga.periodo)}), subido el {formatearFechaHora(carga.subido_en)} ·{" "}
          <span className={`rounded px-1.5 py-0.5 font-semibold uppercase tracking-wide ${carga.caracter === "definitivo" ? "bg-navy/10 text-navy" : "bg-azul/10 text-azul"}`}>
            {carga.caracter}
          </span>
        </p>
      ) : null}

      <section aria-label="Indicadores" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tarjetas.map((t) => (
          <TarjetaKpi key={t.codigo} d={t} />
        ))}
      </section>

      <section aria-label="Gráficos" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Grafico titulo="Ingresos vs costos y gastos">
          <GraficoBarrasPareadas datos={puntos("ingresos", "costos_gastos")} etiquetaA="Ingresos" etiquetaB="Costos y gastos" />
        </Grafico>
        <Grafico titulo="Ingresos vs recaudo">
          <GraficoBarrasPareadas datos={puntos("ingresos", "recaudo_total")} etiquetaA="Ingresos" etiquetaB="Total recaudo" colorB="#179E8F" />
        </Grafico>
        <Grafico titulo="Recaudo vs pagos">
          <GraficoBarrasPareadas datos={puntos("recaudo_total", "pagos")} etiquetaA="Total recaudo" etiquetaB="Pagos" colorA="#179E8F" />
        </Grafico>
        <Grafico titulo="Flujo neto de caja operativo">
          <GraficoBarrasSigno datos={puntos("flujo_neto")} etiqueta="Flujo neto" />
        </Grafico>
        <Grafico titulo="Cartera total (saldo al cierre)">
          <GraficoLinea datos={puntos("cartera_total")} etiqueta="Cartera" />
        </Grafico>
      </section>

      <section aria-label="Top 5" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Top5 titulo={`Top 5 entidades por ingresos · ${NOMBRE_MES[mesActual]}`} {...top(porSeccion("ingresos"))} vacio="Sin ingresos registrados este mes." />
        <Top5 titulo={`Top 5 entidades por recaudo · ${NOMBRE_MES[mesActual]}`} {...top(porSeccion("recaudo_entidad"))} vacio="Sin recaudo registrado este mes." />
        <Top5 titulo={`Top 5 entidades por cartera · ${NOMBRE_MES[mesActual]}`} {...top(porSeccion("cartera"))} vacio="Sin cartera registrada este mes." />
        <Top5 titulo={`Top categorías de gasto · ${NOMBRE_MES[mesActual]}`} {...top(porSeccion("costos_gastos"))} vacio="Sin costos y gastos registrados este mes." />
      </section>

      <p className="text-xs text-gris-texto">
        Estado del dato: <b>Real</b> viene del archivo · <b>Calculado</b> se deriva de valores reales · <b>Meta</b> la define el analista · <b>N/D</b> falta un dato y no se estima.
      </p>
    </div>
  );
}

function Grafico({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gris-borde bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-navy">{titulo}</h3>
      {children}
    </section>
  );
}

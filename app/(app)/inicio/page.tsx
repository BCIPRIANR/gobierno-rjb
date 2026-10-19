import type { Metadata } from "next";
import Link from "next/link";
import { NOMBRE_ROL, obtenerUsuarioActual } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearFechaHora, formatearPeriodo } from "@/lib/formato";
import { periodoDeReporte, periodoDesdeMes, ultimosPeriodos } from "@/lib/periodos";
import { SelectorMes } from "@/components/inicio/selector-mes";

export const metadata: Metadata = { title: "Inicio" };

const AVISOS_URL: Record<string, string> = {
  "sin-permiso": "No tienes permiso para ver esa sección.",
};

type EstadoSemaforo = "cargado" | "pendiente" | "atrasado";

const SEMAFORO: Record<EstadoSemaforo, { texto: string; punto: string; chip: string }> = {
  cargado: { texto: "Cargado", punto: "bg-turquesa", chip: "bg-turquesa/10 text-turquesa" },
  pendiente: { texto: "Pendiente", punto: "bg-azul", chip: "bg-azul/10 text-azul" },
  atrasado: { texto: "Atrasado", punto: "bg-rojo", chip: "bg-rojo/10 text-rojo" },
};

const ESTADO_AVISO: Record<string, string> = {
  enviada: "bg-turquesa/10 text-turquesa",
  fallida: "bg-rojo/10 text-rojo",
  pendiente: "bg-azul/10 text-azul",
};

const TIPO_AVISO: Record<string, string> = {
  recordatorio_carga: "Recordatorio",
  carga_aceptada: "Carga aceptada",
  carga_rechazada: "Carga rechazada",
  resumen: "Resumen",
  alerta: "Alerta",
};

function fechaCorta(fecha: string): string {
  const [a, m, d] = fecha.split("-");
  return `${d}/${m}/${a}`;
}

export default async function PaginaInicio({ searchParams }: PageProps<"/inicio">) {
  const [usuario, params] = await Promise.all([obtenerUsuarioActual(), searchParams]);
  const avisoUrl = typeof params.motivo === "string" ? AVISOS_URL[params.motivo] : undefined;

  const periodos = ultimosPeriodos(8);
  const periodo = periodoDesdeMes(params.mes) ?? periodoDeReporte();
  if (!periodos.includes(periodo)) periodos.push(periodo);

  const supabase = await crearClienteServidor();
  const [semaforoRes, avisosRes] = await Promise.all([
    supabase.rpc("semaforo_cargas", { p_periodo: periodo }),
    supabase
      .from("notificaciones")
      .select("id, tipo, canal, estado, asunto, error, creado_en, empresas(nombre, es_demo)")
      .order("creado_en", { ascending: false })
      .limit(8),
  ]);
  const filas = semaforoRes.data ?? [];
  const avisos = avisosRes.data ?? [];

  const conteo = { cargado: 0, pendiente: 0, atrasado: 0 } as Record<EstadoSemaforo, number>;
  for (const f of filas) conteo[f.estado as EstadoSemaforo] = (conteo[f.estado as EstadoSemaforo] ?? 0) + 1;

  const puedeCargar = usuario.rol === "contador" || usuario.rol === "admin";

  return (
    <div className="flex flex-col gap-6">
      {avisoUrl ? (
        <p role="status" className="rounded-md border border-azul/30 bg-azul/5 px-3 py-2 text-sm text-navy">
          {avisoUrl}
        </p>
      ) : null}

      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-navy">Hola, {usuario.nombre}</h2>
          <p className="mt-1 text-sm text-gris-texto">Entraste como {NOMBRE_ROL[usuario.rol]}.</p>
        </div>
        <SelectorMes periodos={periodos} periodo={periodo} />
      </section>

      <section className="rounded-lg border border-gris-borde bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-navy">Semáforo de cargas · {formatearPeriodo(periodo)}</h3>
          {filas.length > 0 ? (
            <p className="text-xs text-gris-texto">
              <span className="font-semibold text-turquesa">{conteo.cargado}</span> cargadas ·{" "}
              <span className="font-semibold text-azul">{conteo.pendiente}</span> pendientes ·{" "}
              <span className={`font-semibold ${conteo.atrasado > 0 ? "text-rojo" : "text-gris-texto"}`}>{conteo.atrasado}</span> atrasadas
            </p>
          ) : null}
        </div>

        {filas.length === 0 ? (
          <p className="mt-2 text-sm text-gris-texto">No tienes empresas asignadas. Pide al administrador que te asigne una.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gris-borde/70">
            {filas.map((f) => {
              const s = SEMAFORO[f.estado as EstadoSemaforo] ?? SEMAFORO.pendiente;
              return (
                <li key={`${f.empresa_id}-${f.tipo_archivo}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.punto}`} aria-hidden />
                  <span className="min-w-[180px] flex-1 font-medium text-navy">
                    {f.empresa}
                    {f.es_demo ? (
                      <span className="ml-2 rounded bg-turquesa/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-turquesa">
                        Datos de demostración
                      </span>
                    ) : null}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${s.chip}`}>{s.texto}</span>
                  <span className="text-xs text-gris-texto">
                    {f.estado === "cargado" && f.ultima_carga
                      ? `${f.caracter ?? ""} · ${formatearFechaHora(f.ultima_carga)}`
                      : f.estado === "atrasado"
                        ? `${f.dias_atraso} ${f.dias_atraso === 1 ? "día" : "días"} de atraso · límite ${fechaCorta(f.fecha_limite)}`
                        : `vence el ${fechaCorta(f.fecha_limite)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {puedeCargar ? (
          <p className="mt-4 text-sm">
            <Link href="/cargas" className="font-medium text-azul hover:underline">
              Ir al portal de carga →
            </Link>
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-gris-borde bg-white p-5">
        <h3 className="text-base font-semibold text-navy">Avisos recientes</h3>
        {avisos.length === 0 ? (
          <p className="mt-2 text-sm text-gris-texto">Aún no se ha enviado ningún aviso.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gris-borde/70">
            {avisos.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2 text-sm">
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_AVISO[a.estado] ?? ESTADO_AVISO.pendiente}`}>
                  {a.estado === "enviada" ? "Enviado" : a.estado === "fallida" ? "Falló" : "Pendiente"}
                </span>
                <span className="text-xs uppercase tracking-wide text-gris-texto">{a.canal}</span>
                <span className="min-w-0 flex-1 text-navy">
                  <span className="text-xs text-gris-texto">{TIPO_AVISO[a.tipo] ?? a.tipo} · </span>
                  {a.asunto}
                  {a.estado === "fallida" && a.error ? <span className="block text-xs text-rojo">{a.error}</span> : null}
                </span>
                <span className="text-xs text-gris-texto">{formatearFechaHora(a.creado_en)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

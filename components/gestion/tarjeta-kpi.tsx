import type { Acumulado, Variacion } from "@/lib/kpi/comparar";
import {
  formatearEntero,
  formatearPorcentaje,
  formatearPuntosPorcentuales,
  formatearValorKpi,
  formatearVariacion,
  type UnidadKpi,
} from "@/lib/formato";
import { MiniTendencia } from "./graficos";
import { evaluarSemaforo } from "@/lib/kpi/semaforo";
import { ESTADO_TEXTO, PuntoSemaforo } from "@/components/informes/semaforo";

export type Sentido = "mayor_mejor" | "menor_mejor" | "neutro";
export type EstadoDato = "real" | "calculado" | "meta" | "nd";

export type DatosTarjeta = {
  codigo: string;
  nombre: string;
  definicion: string;
  fuente: string;
  unidad: UnidadKpi;
  sentido: Sentido;
  valor: number | null;
  estado: EstadoDato;
  motivoNd: string | null;
  variacion: Variacion;
  acumulado: Acumulado;
  meta: number | null;
  serie: (number | null)[];
  mesActual: number;
};

const ETIQUETA_ESTADO: Record<EstadoDato, { texto: string; clase: string }> = {
  real: { texto: "Real", clase: "bg-azul/10 text-azul" },
  calculado: { texto: "Calculado", clase: "bg-turquesa/10 text-turquesa" },
  meta: { texto: "Meta", clase: "bg-navy/10 text-navy" },
  nd: { texto: "N/D", clase: "bg-gris-fondo text-gris-texto" },
};

/** Mejora / deterioro según el sentido del KPI. El rojo solo marca deterioro. */
function claseVariacion(valor: number, sentido: Sentido): string {
  if (valor === 0 || sentido === "neutro") return "text-gris-texto";
  const mejora = sentido === "mayor_mejor" ? valor > 0 : valor < 0;
  return mejora ? "text-turquesa" : "text-rojo";
}

function textoVariacion(v: Variacion, unidad: UnidadKpi): string {
  switch (v.tipo) {
    case "relativa":
      return formatearVariacion(v.valor);
    case "puntos":
      return formatearPuntosPorcentuales(v.valor);
    case "absoluta":
      return `${v.valor > 0 ? "+" : ""}${unidad === "personas" ? formatearEntero(v.valor) : formatearValorKpi(v.valor, unidad)}`;
    case "nd":
      return "N/D";
  }
}

export function TarjetaKpi({ d }: { d: DatosTarjeta }) {
  const estado = ETIQUETA_ESTADO[d.estado];
  const esNd = d.estado === "nd" || d.valor === null;

  return (
    <article className="flex flex-col gap-2 rounded-lg border border-gris-borde bg-white p-4" title={`${d.definicion} · Fuente: ${d.fuente}`}>
      <header className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-gris-texto">{d.nombre}</h3>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${estado.clase}`}>{estado.texto}</span>
      </header>

      <p className="text-2xl font-semibold tabular-nums text-navy">{esNd ? "N/D" : formatearValorKpi(d.valor as number, d.unidad)}</p>

      {esNd ? (
        <p className="text-xs text-gris-texto">{d.motivoNd ?? "Sin dato."}</p>
      ) : (
        <p className="text-xs text-gris-texto">
          <span className={`font-semibold tabular-nums ${d.variacion.tipo === "nd" ? "text-gris-texto" : claseVariacion(d.variacion.valor, d.sentido)}`}>
            {textoVariacion(d.variacion, d.unidad)}
          </span>{" "}
          vs mes anterior
        </p>
      )}

      <MiniTendencia serie={d.serie} mesActual={d.mesActual} />

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-gris-borde pt-2 text-xs">
        <dt className="text-gris-texto">Acumulado año</dt>
        <dd className="text-right tabular-nums text-navy">{textoAcumulado(d.acumulado, d.unidad)}</dd>
        {d.acumulado.tipo === "suma" ? (
          <>
            <dt className="text-gris-texto">Promedio mensual</dt>
            <dd className="text-right tabular-nums text-navy">{formatearValorKpi(d.acumulado.promedio, d.unidad)}</dd>
          </>
        ) : null}
        <dt className="text-gris-texto">Meta</dt>
        <dd className="text-right tabular-nums text-navy">{textoMeta(d)}</dd>
        {semaforoDe(d)}
      </dl>
    </article>
  );
}

function textoAcumulado(a: Acumulado, unidad: UnidadKpi): string {
  switch (a.tipo) {
    case "suma":
    case "razon":
      return formatearValorKpi(a.valor, unidad);
    case "ninguno":
      return "No aplica";
    case "nd":
      return "N/D";
  }
}

/** Semáforo contra meta (regla del analista). Solo se muestra cuando hay meta o el KPI es rojo por signo. */
function semaforoDe(d: DatosTarjeta) {
  const s = evaluarSemaforo({ codigo: d.codigo, valor: d.estado === "nd" ? null : d.valor, meta: d.meta, sentido: d.sentido });
  if (s.color === "sin_meta" || s.color === "nd" || s.color === "sin_semaforo") return null;
  return (
    <>
      <dt className="text-gris-texto">Semáforo</dt>
      <dd className="flex items-center justify-end gap-1.5 text-navy" title={s.motivo}>
        <PuntoSemaforo color={s.color} />
        {ESTADO_TEXTO[s.color]}
      </dd>
    </>
  );
}

function textoMeta(d: DatosTarjeta): string {
  if (d.meta === null) return "Sin meta definida";
  const meta = formatearValorKpi(d.meta, d.unidad);
  if (d.valor === null || d.estado === "nd") return meta;
  if (d.unidad === "pct") return `${meta} (${formatearPuntosPorcentuales(d.valor - d.meta)})`;
  if (d.meta === 0) return meta;
  return `${meta} (${formatearPorcentaje(d.valor / d.meta)} de la meta)`;
}

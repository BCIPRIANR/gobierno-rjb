import { formatearPeriodo } from "@/lib/formato";

/** Datos mínimos para proponer preguntas (función pura). */
export type ContextoSugerencias = {
  rol: "founder" | "admin" | "gerente" | "contador";
  empresas: { nombre: string; slug: string; es_demo: boolean }[];
  /** Último mes con KPI calculados (`YYYY-MM-01`), si existe. */
  ultimoPeriodo: string | null;
  /** Nombres de KPI en N/D en ese mes. */
  kpisNd: string[];
  /** Mes que se reporta ahora (`YYYY-MM-01`). */
  periodoReporte: string;
};

/** Hasta 6 preguntas que el usuario puede hacer con un clic. Solo sobre datos que existen. */
export function sugerirPreguntas(c: ContextoSugerencias): string[] {
  const sugerencias: string[] = [];
  const principal = c.empresas.find((e) => !e.es_demo) ?? c.empresas[0];

  if (principal && c.ultimoPeriodo) {
    const mes = formatearPeriodo(c.ultimoPeriodo);
    sugerencias.push(`¿Cómo cerró ${principal.nombre} en ${mes}?`);
    sugerencias.push(`Compara ingresos y costos de ${principal.nombre} en ${mes} con el mes anterior`);
    sugerencias.push(`¿Quiénes son los 5 mayores deudores de ${principal.nombre} en ${mes}?`);
    if (c.kpisNd.length > 0) {
      sugerencias.push(`¿Por qué ${c.kpisNd[0]} está en N/D en ${mes} para ${principal.nombre}?`);
    }
    sugerencias.push(`¿Cómo va el flujo neto de caja de ${principal.nombre} en el año?`);
  }

  if (c.empresas.length > 1) {
    sugerencias.push("¿Qué EPS o proveedores comparten varias empresas del grupo?");
  }

  sugerencias.push(`¿Qué empresas no han cargado el informe de ${formatearPeriodo(c.periodoReporte)}?`);

  if (!principal || !c.ultimoPeriodo) {
    sugerencias.unshift("¿Qué empresas puedo consultar y cuáles tienen datos?");
  }

  return [...new Set(sugerencias)].slice(0, 6);
}

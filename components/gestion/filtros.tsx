"use client";

import { useRouter } from "next/navigation";
import { formatearPeriodo } from "@/lib/formato";

type Empresa = { slug: string; nombre: string; es_demo: boolean };

const claseSelect =
  "h-10 rounded-md border border-gris-borde bg-white px-3 text-sm text-navy outline-none focus:border-azul focus:ring-2 focus:ring-azul/20";

export function FiltrosGestion({
  empresas,
  empresaSlug,
  periodos,
  periodo,
}: {
  empresas: Empresa[];
  empresaSlug: string;
  /** `YYYY-MM-01`, de más reciente a más antiguo. */
  periodos: string[];
  periodo: string | null;
}) {
  const router = useRouter();

  function navegar(slug: string, mes: string | null) {
    const params = new URLSearchParams({ empresa: slug });
    if (mes) params.set("mes", mes.slice(0, 7));
    router.push(`/gestion?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-gris-texto">Empresa</span>
        <select className={claseSelect} value={empresaSlug} onChange={(e) => navegar(e.target.value, null)}>
          {empresas.map((e) => (
            <option key={e.slug} value={e.slug}>
              {e.nombre}
              {e.es_demo ? " — DATOS DE DEMOSTRACIÓN" : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-gris-texto">Mes</span>
        <select
          className={claseSelect}
          value={periodo ?? ""}
          disabled={periodos.length === 0}
          onChange={(e) => navegar(empresaSlug, e.target.value)}
        >
          {periodos.length === 0 ? <option value="">Sin datos</option> : null}
          {periodos.map((p) => (
            <option key={p} value={p}>
              {formatearPeriodo(p)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

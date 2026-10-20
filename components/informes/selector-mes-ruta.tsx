"use client";

import { useRouter } from "next/navigation";
import { formatearPeriodo } from "@/lib/formato";

/** Selector de mes que navega a `ruta?mes=YYYY-MM`. */
export function SelectorMesRuta({ periodos, periodo, ruta }: { periodos: string[]; periodo: string; ruta: string }) {
  const router = useRouter();
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-gris-texto">Mes</span>
      <select
        className="h-10 rounded-md border border-gris-borde bg-white px-3 text-sm text-navy outline-none focus:border-azul focus:ring-2 focus:ring-azul/20"
        value={periodo}
        onChange={(e) => router.push(`${ruta}?mes=${e.target.value.slice(0, 7)}`)}
      >
        {periodos.map((p) => (
          <option key={p} value={p}>
            {formatearPeriodo(p)}
          </option>
        ))}
      </select>
    </label>
  );
}

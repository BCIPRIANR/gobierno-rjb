"use client";

import { useRouter } from "next/navigation";
import { formatearPeriodo } from "@/lib/formato";

export function SelectorMes({ periodos, periodo }: { periodos: string[]; periodo: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm text-gris-texto">
      Mes reportado
      <select
        className="h-9 rounded-md border border-gris-borde bg-white px-2 text-sm text-navy outline-none focus:border-azul focus:ring-2 focus:ring-azul/20"
        value={periodo}
        onChange={(e) => router.push(`/inicio?mes=${e.target.value.slice(0, 7)}`)}
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

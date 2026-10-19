import { formatearCOPMillones, formatearPorcentaje } from "@/lib/formato";

export type FilaTop = { concepto: string; valor: number };

/** Lista de los mayores conceptos de una sección con su participación en el total. */
export function Top5({ titulo, filas, total, vacio }: { titulo: string; filas: FilaTop[]; total: number; vacio: string }) {
  return (
    <section className="rounded-lg border border-gris-borde bg-white p-4">
      <h3 className="text-sm font-semibold text-navy">{titulo}</h3>
      {filas.length === 0 ? (
        <p className="mt-2 text-xs text-gris-texto">{vacio}</p>
      ) : (
        <ol className="mt-2 divide-y divide-gris-borde/70">
          {filas.map((f, i) => {
            const parte = total !== 0 ? f.valor / total : null;
            return (
              <li key={`${f.concepto}-${i}`} className="flex items-center gap-3 py-1.5 text-sm">
                <span className="w-4 shrink-0 text-xs text-gris-texto">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-navy" title={f.concepto}>
                  {f.concepto}
                </span>
                <span className="shrink-0 tabular-nums text-navy">{formatearCOPMillones(f.valor)}</span>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-gris-texto">{parte === null ? "—" : formatearPorcentaje(parte)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** Los `n` mayores por valor, agrupando conceptos repetidos (variantes por espacios). */
export function top(filas: { concepto: string; valor: number }[], n = 5): { filas: FilaTop[]; total: number } {
  const porConcepto = new Map<string, FilaTop>();
  let total = 0;
  for (const f of filas) {
    const clave = f.concepto.trim().toUpperCase();
    const acc = porConcepto.get(clave) ?? { concepto: f.concepto.trim(), valor: 0 };
    acc.valor += f.valor;
    porConcepto.set(clave, acc);
    total += f.valor;
  }
  return { filas: [...porConcepto.values()].sort((a, b) => b.valor - a.valor).slice(0, n), total };
}

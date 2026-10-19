export function EnConstruccion({ titulo, bloque, descripcion }: { titulo: string; bloque: number; descripcion: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold text-navy">{titulo}</h2>
      <div className="rounded-lg border border-dashed border-gris-borde bg-white p-5">
        <p className="text-sm font-medium text-navy">En construcción · Bloque {bloque}</p>
        <p className="mt-1 text-sm text-gris-texto">{descripcion}</p>
      </div>
    </div>
  );
}

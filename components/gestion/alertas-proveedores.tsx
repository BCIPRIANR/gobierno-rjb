import { crearClienteServidor } from "@/lib/supabase/server";
import { alertasProveedores } from "@/lib/kpi/alertas-proveedores";
import { formatearFechaHora, formatearPeriodo } from "@/lib/formato";

function restarMeses(periodo: string, n: number): string {
  const d = new Date(Date.UTC(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)) - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Alerta de facturación de proveedores para el mes del tablero: usa la carga
 * PAGOS_PROVEEDOR vigente y aceptada más reciente que cubra ese mes. Lee bajo RLS.
 */
export async function AlertasProveedores({ empresaId, periodo }: { empresaId: string; periodo: string }) {
  const supabase = await crearClienteServidor();
  const { data: cargas } = await supabase
    .from("cargas")
    .select("id, periodo, caracter, version, subido_en, nombre_archivo")
    .eq("empresa_id", empresaId)
    .eq("tipo_archivo", "PAGOS_PROVEEDOR")
    .eq("estado", "aceptada")
    .eq("vigente", true)
    .gte("periodo", periodo)
    .order("periodo", { ascending: true })
    .limit(1);
  const carga = cargas?.[0];

  return (
    <section className="rounded-lg border border-gris-borde bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-navy">Alerta de facturación de proveedores · {formatearPeriodo(periodo)}</h3>
        <span className="text-[11px] text-gris-texto">Mes en revisión vs promedio de los 6 meses previos · umbral ±20%</span>
      </div>

      {!carga ? (
        <p className="mt-2 text-sm text-gris-texto">
          N/D: no hay un archivo de proveedores (tipo &quot;Pagos por proveedor con NIT&quot;) aceptado que cubra {formatearPeriodo(periodo)}. El contador lo sube en el portal de carga.
        </p>
      ) : (
        <Contenido cargaId={carga.id} periodo={periodo} origen={`${carga.nombre_archivo} (v${carga.version}, ${carga.caracter}, subido ${formatearFechaHora(carga.subido_en)})`} />
      )}
    </section>
  );
}

async function Contenido({ cargaId, periodo, origen }: { cargaId: string; periodo: string; origen: string }) {
  const supabase = await crearClienteServidor();
  const { data: hechos } = await supabase
    .from("hechos_financieros")
    .select("concepto, valor, periodo, terceros(nit)")
    .eq("carga_id", cargaId)
    .eq("seccion", "pagos")
    .gte("periodo", restarMeses(periodo, 6))
    .lte("periodo", periodo)
    .limit(5000);

  const pagos = (hechos ?? []).map((h) => ({ nit: h.terceros?.nit ?? null, concepto: h.concepto, periodo: h.periodo, valor: Number(h.valor) }));
  const r = alertasProveedores(pagos, periodo);
  const enAlerta = r.filas.filter((f) => f.alerta).slice(0, 10);

  return (
    <>
      <p className="mt-1 text-xs text-gris-texto">
        {r.analizados} proveedores analizados · <b className={r.enAlerta > 0 ? "text-rojo" : "text-navy"}>{r.enAlerta} en alerta</b>
        {r.sinHistoria > 0 ? ` · ${r.sinHistoria} sin datos en la ventana` : ""} · Fuente: {origen}
      </p>
      {enAlerta.length === 0 ? (
        <p className="mt-2 text-sm text-gris-texto">Ningún proveedor se desvía más del 20% de su promedio.</p>
      ) : (
        <div className="-mx-4 mt-2 overflow-x-auto px-4">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gris-borde text-left text-[11px] uppercase tracking-wide text-gris-texto">
                <th className="py-1.5 pr-2 font-medium">Proveedor</th>
                <th className="py-1.5 pr-2 text-right font-medium">Mes en revisión</th>
                <th className="py-1.5 pr-2 text-right font-medium">Mes anterior</th>
                <th className="py-1.5 pr-2 text-right font-medium">Promedio 6 meses</th>
                <th className="py-1.5 pr-2 text-right font-medium">Desviación</th>
                <th className="py-1.5 font-medium">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {enAlerta.map((f) => (
                <tr key={f.clave} className="border-b border-gris-borde/70">
                  <td className="py-1.5 pr-2 text-navy">
                    {f.proveedor}
                    {f.nit ? <span className="ml-1 text-[11px] text-gris-texto">NIT {f.nit}</span> : null}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-navy">{f.textos.mesRevision}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-navy">{f.textos.mesAnterior}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-navy">{f.textos.promedio6}</td>
                  <td className={`py-1.5 pr-2 text-right tabular-nums ${f.tipo === "Superior" ? "text-rojo" : "text-navy"}`}>{f.textos.desviacion}</td>
                  <td className="py-1.5">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${f.tipo === "Superior" ? "bg-rojo/10 text-rojo" : "bg-azul/10 text-azul"}`}>{f.tipo}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.enAlerta > 10 ? <p className="mt-1 text-[11px] text-gris-texto">Se muestran las 10 de mayor impacto de {r.enAlerta}.</p> : null}
        </div>
      )}
    </>
  );
}

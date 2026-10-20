import type { Metadata } from "next";
import Link from "next/link";
import { empresasDelUsuario, requerirRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/tipos";
import type { DatosInforme } from "@/lib/informes/armar";
import { armarResumenGrupo, type FilaGrupo, type InformeEmpresa } from "@/lib/informes/grupo";
import { formatearFechaHora, formatearPeriodo } from "@/lib/formato";
import { periodoDeReporte, periodoDesdeMes, ultimosPeriodos } from "@/lib/periodos";
import { ESTADO_TEXTO, PuntoSemaforo } from "@/components/informes/semaforo";
import { BotonImprimir } from "@/components/informes/formularios";
import { SelectorMesRuta } from "@/components/informes/selector-mes-ruta";

export const metadata: Metadata = { title: "Resumen del Grupo" };

const ESTADO_INFORME: Record<FilaGrupo["estadoInforme"], string> = {
  sin_informe: "Sin informe",
  borrador: "Borrador",
  pendiente_comentario: "Pendiente de comentario",
  aprobado: "Aprobado",
};

function leerDatos(json: Json): DatosInforme | null {
  if (json && typeof json === "object" && !Array.isArray(json) && (json as { version?: unknown }).version === 1) return json as unknown as DatosInforme;
  return null;
}

export default async function PaginaResumenGrupo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [usuario, empresas, params] = await Promise.all([requerirRol("founder", "admin", "gerente"), empresasDelUsuario(), searchParams]);
  const periodos = ultimosPeriodos(8);
  const periodo = periodoDesdeMes(params.mes) ?? periodoDeReporte();
  if (!periodos.includes(periodo)) periodos.push(periodo);

  const supabase = await crearClienteServidor();
  const { data: informes } = await supabase
    .from("informes_junta")
    .select("empresa_id, estado, datos, resumen_ia, decisiones_junta, causas_acciones, hechos_relevantes, compromisos, generado_en")
    .eq("periodo", periodo);

  const porEmpresa = new Map((informes ?? []).map((i) => [i.empresa_id, i]));
  const entrada: InformeEmpresa[] = empresas.map((e) => {
    const i = porEmpresa.get(e.id);
    const datos = i ? leerDatos(i.datos) : null;
    return {
      empresa: e,
      informe:
        i && datos
          ? { estado: i.estado, datos, resumen_ia: i.resumen_ia, decisiones_junta: i.decisiones_junta, causas_acciones: i.causas_acciones, hechos_relevantes: i.hechos_relevantes, compromisos: i.compromisos }
          : null,
    };
  });
  const resumen = armarResumenGrupo(periodo, entrada);
  const incluyeDemo = resumen.filas.some((f) => f.empresa.es_demo && f.estadoInforme !== "sin_informe");
  const ultimaGeneracion = (informes ?? []).map((i) => i.generado_en).sort().at(-1) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-semibold text-navy">Resumen del Grupo</h2>
          <p className="mt-1 text-sm text-gris-texto">
            Una página: las empresas en una tabla con semáforo, el mensaje del mes y las decisiones pendientes.{" "}
            <Link href="/informes" className="font-medium text-azul hover:underline">
              Ver informes por empresa →
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <SelectorMesRuta periodos={periodos} periodo={periodo} ruta="/informes/grupo" />
          <BotonImprimir />
        </div>
      </div>

      <article className="informe">
        <section className="pagina rounded-lg border border-gris-borde bg-white p-6 print:rounded-none print:border-0 print:p-0">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-gris-borde pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gris-texto">Grupo RJB · Informe mensual para la Junta Directiva</p>
              <h2 className="mt-1 text-2xl font-semibold text-navy">Resumen del Grupo · {formatearPeriodo(periodo)}</h2>
              {incluyeDemo ? (
                <p className="mt-1 inline-block rounded bg-turquesa/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-turquesa">Incluye datos de demostración</p>
              ) : null}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gris-texto">
              <dt>Empresas con informe</dt>
              <dd className="text-navy">
                {resumen.conteo.conInforme} de {resumen.filas.length} · {resumen.conteo.aprobados} aprobados
              </dd>
              <dt>Estado general</dt>
              <dd className="text-navy">
                {resumen.conteo.rojos} en rojo · {resumen.conteo.amarillos} en amarillo · {resumen.conteo.verdes} en verde
              </dd>
              <dt>Última generación</dt>
              <dd className="text-navy">{ultimaGeneracion ? formatearFechaHora(ultimaGeneracion) : "N/D"}</dd>
              <dt>Consultado por</dt>
              <dd className="text-navy">{usuario.nombre}</dd>
            </dl>
          </header>

          <section className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-navy">Las empresas del Grupo</h3>
            <div className="-mx-2 overflow-x-auto px-2">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-gris-borde text-left text-[11px] uppercase tracking-wide text-gris-texto">
                    <th className="py-1.5 pr-2 font-medium">Empresa</th>
                    <th className="py-1.5 pr-2 font-medium">Estado</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Ingresos</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Excedente ingresos − costos/gastos</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Flujo neto de caja</th>
                    <th className="py-1.5 pr-2 text-center font-medium">Verde / Amarillo / Rojo</th>
                    <th className="py-1.5 font-medium">Informe</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.filas.map((f) => (
                    <tr key={f.empresa.id} className="border-b border-gris-borde/70">
                      <td className="py-2 pr-2 font-medium text-navy">
                        <Link href={`/informes?empresa=${f.empresa.slug}&mes=${periodo.slice(0, 7)}`} className="hover:underline print:no-underline">
                          {f.empresa.nombre}
                        </Link>
                        {f.empresa.es_demo ? <span className="ml-2 rounded bg-turquesa/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-turquesa">Demo</span> : null}
                      </td>
                      <td className="py-2 pr-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-navy">
                          <PuntoSemaforo color={f.color} />
                          {f.estadoInforme === "sin_informe" ? "Sin datos" : ESTADO_TEXTO[f.color]}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums text-navy">{f.ingresos.texto}</td>
                      <td className={`py-2 pr-2 text-right tabular-nums ${f.excedente.valor !== null && f.excedente.valor < 0 ? "text-rojo" : "text-navy"}`}>{f.excedente.texto}</td>
                      <td className={`py-2 pr-2 text-right tabular-nums ${f.flujoNeto.valor !== null && f.flujoNeto.valor < 0 ? "text-rojo" : "text-navy"}`}>{f.flujoNeto.texto}</td>
                      <td className="py-2 pr-2 text-center tabular-nums text-gris-texto">
                        {f.estadoInforme === "sin_informe" ? "—" : `${f.conteo.verdes} / ${f.conteo.amarillos} / ${f.conteo.rojos}`}
                      </td>
                      <td className="py-2 text-xs text-gris-texto">{ESTADO_INFORME[f.estadoInforme]}</td>
                    </tr>
                  ))}
                  <tr className="bg-gris-fondo/70 font-semibold">
                    <td className="py-2 pr-2 text-navy">Grupo</td>
                    <td className="py-2 pr-2 text-xs font-normal text-gris-texto">suma de las empresas con dato</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-navy">
                      {resumen.totales.ingresos.texto}
                      <span className="block text-[10px] font-normal text-gris-texto">{resumen.totales.ingresos.empresas} empresas</span>
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums text-navy">
                      {resumen.totales.excedente.texto}
                      <span className="block text-[10px] font-normal text-gris-texto">{resumen.totales.excedente.empresas} empresas</span>
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums text-navy">
                      {resumen.totales.flujoNeto.texto}
                      <span className="block text-[10px] font-normal text-gris-texto">{resumen.totales.flujoNeto.empresas} empresas</span>
                    </td>
                    <td className="py-2 pr-2 text-center text-gris-texto">—</td>
                    <td className="py-2" />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-5 break-inside-avoid">
            <h3 className="mb-2 text-sm font-semibold text-navy">El mensaje del mes por empresa</h3>
            <ul className="space-y-1.5 text-sm">
              {resumen.filas.map((f) => (
                <li key={f.empresa.id} className="flex items-start gap-2">
                  <PuntoSemaforo color={f.color} />
                  <span className="text-navy">
                    <b>{f.empresa.nombre}:</b>{" "}
                    {f.mensaje ?? <span className="text-gris-texto">{f.estadoInforme === "sin_informe" ? "sin informe generado para este mes." : "resumen no disponible."}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-5 break-inside-avoid">
            <h3 className="mb-2 text-sm font-semibold text-navy">Decisiones que se piden a la Junta</h3>
            {resumen.filas.some((f) => f.decisiones) ? (
              <ul className="space-y-1.5 text-sm">
                {resumen.filas
                  .filter((f) => f.decisiones)
                  .map((f) => (
                    <li key={f.empresa.id} className="text-navy">
                      <b>{f.empresa.nombre}:</b> <span className="whitespace-pre-wrap">{f.decisiones}</span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-gris-texto">Ningún gerente ha registrado decisiones pendientes para este mes.</p>
            )}
          </section>

          <footer className="mt-5 border-t border-gris-borde pt-2 text-[11px] text-gris-texto">
            Cifras del mes tomadas del informe de cada empresa (KPI calculados). Los totales del Grupo suman solo las empresas con dato; N/D nunca se cuenta como 0. Semáforo contra meta: verde cumple, amarillo hasta 10% por debajo, rojo más de 10%; sin meta en gris.
          </footer>
        </section>
      </article>
    </div>
  );
}

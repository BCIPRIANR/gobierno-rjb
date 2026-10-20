import type { Metadata } from "next";
import Link from "next/link";
import { empresasDelUsuario, requerirRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/tipos";
import type { DatosInforme } from "@/lib/informes/armar";
import { formatearFechaHora, formatearPeriodo } from "@/lib/formato";
import { iaConfigurada } from "@/lib/ia/chat";
import { FiltrosGestion } from "@/components/gestion/filtros";
import { BloquesGerente, BotonAprobar, BotonGenerar, BotonImprimir } from "@/components/informes/formularios";
import { PuntoSemaforo, ESTADO_TEXTO } from "@/components/informes/semaforo";

export const metadata: Metadata = { title: "Informe de Junta" };

type Alerta = { indicador: string; estado: "amarillo" | "rojo"; texto: string };

function leerDatos(json: Json): DatosInforme | null {
  if (json && typeof json === "object" && !Array.isArray(json) && (json as { version?: unknown }).version === 1) {
    return json as unknown as DatosInforme;
  }
  return null;
}

function leerAlertas(json: Json): Alerta[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((a) => {
    if (!a || typeof a !== "object" || Array.isArray(a)) return [];
    const o = a as Record<string, Json | undefined>;
    if (typeof o.indicador !== "string" || typeof o.texto !== "string") return [];
    return [{ indicador: o.indicador, estado: o.estado === "rojo" ? "rojo" : "amarillo", texto: o.texto }];
  });
}

export default async function PaginaInformes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [usuario, empresas, params] = await Promise.all([requerirRol("founder", "admin", "gerente"), empresasDelUsuario(), searchParams]);

  if (empresas.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold text-navy">Informe mensual para la Junta</h2>
        <p className="rounded-lg border border-gris-borde bg-white p-5 text-sm text-gris-texto">No tienes empresas asignadas.</p>
      </div>
    );
  }

  const ref = typeof params.empresa === "string" ? params.empresa : null;
  const empresa = empresas.find((e) => e.slug === ref || e.id === ref) ?? empresas[0];
  const supabase = await crearClienteServidor();

  const { data: periodosData } = await supabase.from("kpi_resultados").select("periodo").eq("empresa_id", empresa.id).order("periodo", { ascending: false });
  const periodos = [...new Set((periodosData ?? []).map((p) => p.periodo))];
  const mesParam = typeof params.mes === "string" && /^\d{4}-\d{2}$/.test(params.mes) ? `${params.mes}-01` : null;
  const periodo = (mesParam && periodos.includes(mesParam) ? mesParam : periodos[0]) ?? null;

  const { data: informe } = periodo
    ? await supabase.from("informes_junta").select("*").eq("empresa_id", empresa.id).eq("periodo", periodo).maybeSingle()
    : { data: null };
  const datos = informe ? leerDatos(informe.datos) : null;
  const alertas = informe ? leerAlertas(informe.alertas_ia) : [];
  const aprobado = informe?.estado === "aprobado";
  const bloquesVacios = informe ? ![informe.causas_acciones, informe.hechos_relevantes, informe.decisiones_junta, informe.compromisos].some((b) => b && b.trim()) : true;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-semibold text-navy">Informe mensual para la Junta</h2>
          <p className="mt-1 text-sm text-gris-texto">
            Dos páginas por empresa. Las secciones 1 a 5 las arma el sistema; las 6 a 9 las escribe el gerente.{" "}
            <Link href={`/informes/grupo${periodo ? `?mes=${periodo.slice(0, 7)}` : ""}`} className="font-medium text-azul hover:underline">
              Ver resumen del Grupo →
            </Link>
          </p>
        </div>
        <FiltrosGestion empresas={empresas} empresaSlug={empresa.slug} periodos={periodos} periodo={periodo} ruta="/informes" />
      </div>

      {!periodo ? (
        <p className="rounded-lg border border-dashed border-gris-borde bg-white p-5 text-sm text-gris-texto">
          Todavía no hay KPI calculados de {empresa.nombre}. El informe se puede generar cuando se acepte una carga del informe mensual.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <BotonGenerar empresaId={empresa.id} periodo={periodo} existe={Boolean(informe)} />
            {informe ? <BotonImprimir /> : null}
            {informe && !aprobado ? <BotonAprobar informeId={informe.id} /> : null}
            {!iaConfigurada() ? <span className="text-xs text-gris-texto">La IA no está configurada: el borrador saldrá sin resumen ni alertas redactadas.</span> : null}
          </div>

          {!informe || !datos ? (
            <p className="rounded-lg border border-dashed border-gris-borde bg-white p-5 text-sm text-gris-texto">
              Aún no hay borrador de {empresa.nombre} para {formatearPeriodo(periodo)}. Genera el borrador: el sistema arma el tablero con los KPI calculados y la IA redacta el resumen y las alertas.
            </p>
          ) : (
            <article className="informe flex flex-col gap-6">
              {/* ---------------- Página 1 ---------------- */}
              <section className="pagina rounded-lg border border-gris-borde bg-white p-6 print:rounded-none print:border-0 print:p-0">
                <header className="flex flex-wrap items-start justify-between gap-4 border-b border-gris-borde pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gris-texto">Grupo RJB · Informe mensual para la Junta Directiva</p>
                    <h2 className="mt-1 text-2xl font-semibold text-navy">
                      {datos.empresa.nombre} · {datos.periodoTexto}
                    </h2>
                    {datos.empresa.es_demo ? (
                      <p className="mt-1 inline-block rounded bg-turquesa/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-turquesa">Datos de demostración</p>
                    ) : null}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gris-texto">
                    <dt>Estado del informe</dt>
                    <dd className="font-semibold text-navy">{aprobado ? "Aprobado" : bloquesVacios ? "Borrador · pendiente de comentario" : "Borrador"}</dd>
                    <dt>Fecha de corte</dt>
                    <dd className="text-navy">{datos.origen ? formatearFechaHora(datos.origen.subido_en) : "N/D"}</dd>
                    <dt>Fuente</dt>
                    <dd className="text-navy">
                      {datos.origen ? `Carga v${datos.origen.version} · ${datos.origen.caracter} · periodo ${formatearPeriodo(datos.origen.periodo)}` : "N/D"}
                    </dd>
                    <dt>Generado</dt>
                    <dd className="text-navy">
                      {formatearFechaHora(informe.generado_en)}
                      {informe.modelo_ia ? ` · IA: ${informe.modelo_ia}` : " · sin IA"}
                    </dd>
                  </dl>
                </header>

                <Seccion numero={1} titulo="Resumen del mes" etiqueta="Automático · redacta la IA">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-gris-texto">Estado general:</span>
                    <PuntoSemaforo color={datos.estadoGeneral.color} />
                    <span className="font-semibold text-navy">{ESTADO_TEXTO[datos.estadoGeneral.color]}</span>
                    <span className="text-gris-texto">
                      · {datos.estadoGeneral.verdes} en verde, {datos.estadoGeneral.amarillos} en amarillo, {datos.estadoGeneral.rojos} en rojo, {datos.estadoGeneral.sinMeta} sin meta
                    </span>
                  </div>
                  {informe.resumen_ia ? (
                    <div className="space-y-1 text-sm text-navy">
                      {informe.resumen_ia.split("\n").map((linea, i) => (
                        <p key={i}>
                          <b className="text-gris-texto">{["Ventas: ", "Rentabilidad: ", "Caja y cartera: "][i] ?? ""}</b>
                          {linea}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gris-texto">Resumen no disponible: la IA no estaba configurada o falló al redactar. Las cifras del tablero siguen siendo válidas.</p>
                  )}
                </Seccion>

                <Seccion numero={2} titulo="Tablero de indicadores" etiqueta="Automático">
                  <div className="-mx-2 overflow-x-auto px-2">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-gris-borde text-left text-[11px] uppercase tracking-wide text-gris-texto">
                          <th className="py-1.5 pr-2 font-medium">Indicador</th>
                          <th className="py-1.5 pr-2 text-right font-medium">Mes</th>
                          <th className="py-1.5 pr-2 text-right font-medium">Acumulado año</th>
                          <th className="py-1.5 pr-2 text-right font-medium">vs mes anterior</th>
                          <th className="py-1.5 pr-2 text-right font-medium">Meta</th>
                          <th className="py-1.5 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(["VENTAS Y RENTABILIDAD", "CAJA", "CARTERA", "PERSONAL"] as const).map((grupo) => {
                          const filas = datos.indicadores.filter((i) => i.grupo === grupo);
                          if (filas.length === 0) return null;
                          return [
                            <tr key={grupo} className="bg-gris-fondo/70">
                              <td colSpan={6} className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-navy">
                                {grupo}
                              </td>
                            </tr>,
                            ...filas.map((i) => (
                              <tr key={i.codigo} className="border-b border-gris-borde/70">
                                <td className="py-1.5 pr-2 text-navy">
                                  {i.nombre}
                                  {i.mes.valor !== null && i.mes.estado === "calculado" ? <span className="ml-1 text-[10px] uppercase text-gris-texto">calc.</span> : null}
                                </td>
                                <td className="py-1.5 pr-2 text-right tabular-nums text-navy">
                                  {i.mes.texto}
                                  {i.mes.valor === null && i.mes.motivoNd ? <span className="block max-w-[220px] text-[11px] font-normal text-gris-texto">{i.mes.motivoNd}</span> : null}
                                </td>
                                <td className="py-1.5 pr-2 text-right tabular-nums text-navy">{i.acumulado.texto}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums text-navy">{i.variacion.texto}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums text-gris-texto">{i.meta.texto}</td>
                                <td className="py-1.5">
                                  <span className="inline-flex items-center gap-1.5 text-xs text-navy" title={i.semaforo.motivo}>
                                    <PuntoSemaforo color={i.semaforo.color} />
                                    {ESTADO_TEXTO[i.semaforo.color]}
                                  </span>
                                </td>
                              </tr>
                            )),
                          ];
                        })}
                      </tbody>
                    </table>
                  </div>
                </Seccion>
              </section>

              {/* ---------------- Página 2 ---------------- */}
              <section className="pagina rounded-lg border border-gris-borde bg-white p-6 print:rounded-none print:border-0 print:p-0">
                <Seccion numero={3} titulo="¿El recaudo alcanzó para operar?" etiqueta="Automático">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Celda titulo="Recaudo del mes" valor={datos.caja.recaudo.texto} />
                    <Celda titulo="Liquidez mínima requerida" valor={datos.caja.liquidezMinima.texto} nota={datos.caja.liquidezMinima.motivo} />
                    <Celda titulo="Excedente o déficit" valor={datos.caja.excedente.texto} nota={datos.caja.excedente.motivo} rojoSiNegativo={datos.caja.excedente.valor} />
                  </div>
                </Seccion>

                <Seccion numero={4} titulo="Cartera" etiqueta="Automático">
                  <p className="mb-2 text-xs text-gris-texto">
                    Edades (0–90 · 91–180 · 181–360 · &gt;360 días): <b>N/D</b>. {datos.cartera.edades.motivo}
                  </p>
                  <p className="mb-2 text-sm text-navy">
                    Cartera total al cierre: <b className="tabular-nums">{datos.cartera.total.texto}</b>
                  </p>
                  {datos.cartera.top5.length === 0 ? (
                    <p className="text-sm text-gris-texto">Sin cartera registrada para este mes en la carga de origen.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gris-borde text-left text-[11px] uppercase tracking-wide text-gris-texto">
                          <th className="py-1.5 pr-2 font-medium">#</th>
                          <th className="py-1.5 pr-2 font-medium">Cinco clientes con mayor cartera</th>
                          <th className="py-1.5 pr-2 text-right font-medium">Saldo</th>
                          <th className="py-1.5 pr-2 text-right font-medium">% del total</th>
                          <th className="py-1.5 text-right font-medium">Cambio vs mes anterior</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datos.cartera.top5.map((t, i) => (
                          <tr key={t.concepto} className="border-b border-gris-borde/70">
                            <td className="py-1.5 pr-2 text-gris-texto">{i + 1}</td>
                            <td className="py-1.5 pr-2 text-navy">{t.concepto}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums text-navy">{t.texto}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums text-navy">{t.participacion}</td>
                            <td className="py-1.5 text-right tabular-nums text-navy">{t.cambio}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Seccion>

                <Seccion numero={5} titulo="Alertas del mes" etiqueta="Automático · redacta la IA">
                  {alertas.length === 0 ? (
                    <p className="text-sm text-gris-texto">
                      {informe.modelo_ia
                        ? "Sin indicadores en amarillo o rojo este mes. Los indicadores sin meta no generan alerta: pide al analista cargar las metas."
                        : "Alertas no disponibles: la IA no estaba configurada al generar el borrador."}
                    </p>
                  ) : (
                    <ul className="space-y-1.5 text-sm text-navy">
                      {alertas.map((a, i) => (
                        <li key={`${a.indicador}-${i}`} className="flex items-start gap-2">
                          <PuntoSemaforo color={a.estado} />
                          <span>
                            <b>{a.indicador}:</b> {a.texto}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {datos.pendientes.length > 0 ? (
                    <p className="mt-2 text-[11px] text-gris-texto">Pendiente de formato: {datos.pendientes.join(" · ")}</p>
                  ) : null}
                </Seccion>

                <div className="mt-2 border-t border-gris-borde pt-4">
                  <BloquesGerente
                    informeId={informe.id}
                    aprobado={aprobado}
                    valores={{
                      causas_acciones: informe.causas_acciones ?? "",
                      hechos_relevantes: informe.hechos_relevantes ?? "",
                      decisiones_junta: informe.decisiones_junta ?? "",
                      compromisos: informe.compromisos ?? "",
                    }}
                  />
                </div>

                <footer className="mt-4 border-t border-gris-borde pt-2 text-[11px] text-gris-texto">
                  Estado del dato: Real viene del archivo · Calculado se deriva de valores reales · N/D falta un dato y no se estima. Semáforo contra meta: verde cumple, amarillo hasta 10% por debajo, rojo más de 10%; sin meta en gris. Generado {informe.generado_por ? "a solicitud de un usuario" : "automáticamente al aceptar la carga"}. Consultado por {usuario.nombre}.
                </footer>
              </section>
            </article>
          )}
        </>
      )}
    </div>
  );
}

function Seccion({ numero, titulo, etiqueta, children }: { numero: number; titulo: string; etiqueta: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 break-inside-avoid">
      <h3 className="mb-2 flex flex-wrap items-baseline gap-2 text-sm font-semibold text-navy">
        <span className="rounded bg-navy px-1.5 py-0.5 text-[10px] text-white">{numero}</span>
        {titulo}
        <span className="rounded bg-azul/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-azul">{etiqueta}</span>
      </h3>
      {children}
    </section>
  );
}

function Celda({ titulo, valor, nota, rojoSiNegativo }: { titulo: string; valor: string; nota?: string; rojoSiNegativo?: number | null }) {
  const rojo = typeof rojoSiNegativo === "number" && rojoSiNegativo < 0;
  return (
    <div className="rounded-md border border-gris-borde p-3">
      <p className="text-xs text-gris-texto">{titulo}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${rojo ? "text-rojo" : "text-navy"}`}>{valor}</p>
      {nota ? <p className="mt-1 text-[11px] text-gris-texto">{nota}</p> : null}
    </div>
  );
}

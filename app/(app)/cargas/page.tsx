import type { Metadata } from "next";
import { empresasDelUsuario, requerirRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { mesAnterior } from "@/lib/cargas/validacion";
import { formatearFechaHora, formatearPeriodoCorto } from "@/lib/formato";
import type { Json } from "@/lib/supabase/tipos";
import { FormularioCarga, type TipoOpcion } from "./formulario-carga";

export const metadata: Metadata = { title: "Cargas" };

type EstadoCarga = "procesando" | "aceptada" | "rechazada";

type CheckGuardado = { codigo: string; ok: boolean; nivel: "error" | "aviso"; mensaje: string };

/** `resultado_checks` es jsonb; se lee a la defensiva. */
function leerChecks(json: Json): CheckGuardado[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((c) => {
    if (!c || typeof c !== "object" || Array.isArray(c)) return [];
    const o = c as Record<string, Json | undefined>;
    if (typeof o.codigo !== "string" || typeof o.mensaje !== "string") return [];
    return [{ codigo: o.codigo, ok: o.ok === true, nivel: o.nivel === "error" ? "error" : "aviso", mensaje: o.mensaje }];
  });
}

const ESTADO: Record<EstadoCarga, { texto: string; clase: string }> = {
  procesando: { texto: "En revisión", clase: "bg-azul/10 text-azul" },
  aceptada: { texto: "Aceptada", clase: "bg-turquesa/10 text-turquesa" },
  rechazada: { texto: "Rechazada", clase: "bg-rojo/10 text-rojo" },
};

export default async function PaginaCargas() {
  await requerirRol("contador", "admin");
  const supabase = await crearClienteServidor();

  const [empresas, tiposRes, cargasRes] = await Promise.all([
    empresasDelUsuario(),
    supabase
      .from("tipos_archivo")
      .select("codigo, nombre, periodicidad, obligatorio")
      // Mensuales primero (orden del enum), luego obligatorios y por nombre.
      .order("periodicidad")
      .order("obligatorio", { ascending: false })
      .order("nombre"),
    supabase
      .from("cargas")
      .select(
        "id, periodo, version, vigente, estado, caracter, nombre_archivo, motivo_rechazo, resultado_checks, subido_en, empresas(nombre, es_demo), tipos_archivo(nombre)",
      )
      .order("subido_en", { ascending: false })
      .limit(50),
  ]);

  const tipos: TipoOpcion[] = tiposRes.data ?? [];
  const cargas = cargasRes.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-2xl font-semibold text-navy">Portal de carga</h2>
        <p className="mt-1 text-sm text-gris-texto">
          Sube el archivo del mes. El sistema lo revisa automáticamente y te dice si quedó aceptado o qué corregir.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <section className="rounded-lg border border-gris-borde bg-white p-5">
          <h3 className="text-base font-semibold text-navy">Nuevo archivo</h3>
          <div className="mt-4">
            <FormularioCarga empresas={empresas} tipos={tipos} mesPorDefecto={mesAnterior()} />
          </div>
        </section>

        <section className="rounded-lg border border-gris-borde bg-white p-5">
          <h3 className="text-base font-semibold text-navy">Historial</h3>
          {cargas.length === 0 ? (
            <p className="mt-2 text-sm text-gris-texto">Aún no hay cargas. La primera aparecerá aquí con su estado.</p>
          ) : (
            <div className="-mx-5 mt-3 overflow-x-auto px-5">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-gris-borde text-left text-xs uppercase tracking-wide text-gris-texto">
                    <th className="py-2 pr-3 font-medium">Empresa</th>
                    <th className="py-2 pr-3 font-medium">Archivo</th>
                    <th className="py-2 pr-3 font-medium">Periodo</th>
                    <th className="py-2 pr-3 font-medium">Versión</th>
                    <th className="py-2 pr-3 font-medium">Carácter</th>
                    <th className="py-2 pr-3 font-medium">Estado</th>
                    <th className="py-2 font-medium">Subido</th>
                  </tr>
                </thead>
                <tbody>
                  {cargas.map((c) => {
                    const estado = ESTADO[c.estado];
                    const avisos = leerChecks(c.resultado_checks).filter((x) => x.nivel === "aviso");
                    return (
                      <tr key={c.id} className={"border-b border-gris-borde/70 align-top" + (c.vigente ? "" : " text-gris-texto")}>
                        <td className="py-2.5 pr-3">
                          <span className="font-medium text-navy">{c.empresas?.nombre ?? "—"}</span>
                          {c.empresas?.es_demo ? (
                            <span className="ml-2 rounded bg-turquesa/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-turquesa">
                              Datos de demostración
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="text-navy">{c.tipos_archivo?.nombre ?? "—"}</div>
                          <div className="max-w-[220px] truncate text-xs text-gris-texto" title={c.nombre_archivo}>
                            {c.nombre_archivo}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">{formatearPeriodoCorto(c.periodo)}</td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          v{c.version}
                          {!c.vigente && c.estado !== "rechazada" ? <span className="ml-1 text-xs">(reemplazada)</span> : null}
                        </td>
                        <td className="py-2.5 pr-3 capitalize">{c.caracter}</td>
                        <td className="py-2.5 pr-3">
                          <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${estado.clase}`}>{estado.texto}</span>
                          {c.estado === "rechazada" && c.motivo_rechazo ? (
                            <p className="mt-1 max-w-[320px] text-xs text-rojo">{c.motivo_rechazo}</p>
                          ) : null}
                          {avisos.length > 0 ? (
                            <details className="mt-1 max-w-[320px] text-xs text-gris-texto">
                              <summary className="cursor-pointer select-none">
                                {avisos.length} {avisos.length === 1 ? "aviso" : "avisos"}
                              </summary>
                              <ul className="mt-1 list-disc space-y-1 pl-4">
                                {avisos.map((a, i) => (
                                  <li key={`${a.codigo}-${i}`}>{a.mensaje}</li>
                                ))}
                              </ul>
                            </details>
                          ) : null}
                        </td>
                        <td className="py-2.5 whitespace-nowrap text-gris-texto">{formatearFechaHora(c.subido_en)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

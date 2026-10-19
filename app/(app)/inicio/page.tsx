import type { Metadata } from "next";
import { NOMBRE_ROL, empresasDelUsuario, obtenerUsuarioActual } from "@/lib/auth";

export const metadata: Metadata = { title: "Inicio" };

const AVISOS: Record<string, string> = {
  "sin-permiso": "No tienes permiso para ver esa sección.",
};

export default async function PaginaInicio({ searchParams }: PageProps<"/inicio">) {
  const [usuario, empresas, params] = await Promise.all([
    obtenerUsuarioActual(),
    empresasDelUsuario(),
    searchParams,
  ]);
  const aviso = typeof params.motivo === "string" ? AVISOS[params.motivo] : undefined;

  return (
    <div className="flex flex-col gap-6">
      {aviso ? (
        <p role="status" className="rounded-md border border-azul/30 bg-azul/5 px-3 py-2 text-sm text-navy">
          {aviso}
        </p>
      ) : null}

      <section>
        <h2 className="text-2xl font-semibold text-navy">Hola, {usuario.nombre}</h2>
        <p className="mt-1 text-sm text-gris-texto">
          Entraste como {NOMBRE_ROL[usuario.rol]}. Tienes acceso a {empresas.length}{" "}
          {empresas.length === 1 ? "empresa" : "empresas"}.
        </p>
      </section>

      <section className="rounded-lg border border-gris-borde bg-white p-5">
        <h3 className="text-base font-semibold text-navy">Tus empresas</h3>
        {empresas.length === 0 ? (
          <p className="mt-2 text-sm text-gris-texto">
            Aún no tienes empresas asignadas. Pide al administrador que te asigne una.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {empresas.map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded-md border border-gris-borde px-3 py-2 text-sm">
                <span className="font-medium text-navy">{e.nombre}</span>
                {e.es_demo ? (
                  <span className="rounded bg-turquesa/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-turquesa">
                    Datos de demostración
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-dashed border-gris-borde bg-white p-5">
        <h3 className="text-base font-semibold text-navy">Semáforo de cargas</h3>
        <p className="mt-2 text-sm text-gris-texto">Se activa en el Bloque 5. Aquí verás quién cargó, quién no y los días de atraso.</p>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = { title: "Iniciar sesión" };

const MENSAJES: Record<string, string> = {
  "sin-perfil":
    "Tu cuenta existe pero aún no tiene perfil ni rol asignado. Pide al administrador que te dé de alta.",
};

export default async function PaginaLogin({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const siguiente = typeof params.siguiente === "string" ? params.siguiente : undefined;
  const motivo = typeof params.motivo === "string" ? MENSAJES[params.motivo] : undefined;

  return (
    <main className="flex flex-1 flex-col">
      <header className="bg-navy px-4 py-5 text-white">
        <div className="mx-auto w-full max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Grupo RJB</p>
          <h1 className="mt-1 text-xl font-semibold">Gobierno Corporativo</h1>
        </div>
      </header>

      <section className="flex flex-1 items-start justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-lg border border-gris-borde bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-navy">Iniciar sesión</h2>
          <p className="mt-1 text-sm text-gris-texto">Usa el correo y la contraseña que te asignó el administrador.</p>

          {motivo ? (
            <p role="status" className="mt-4 rounded-md border border-azul/30 bg-azul/5 px-3 py-2 text-sm text-navy">
              {motivo}
            </p>
          ) : null}

          <div className="mt-6">
            <FormularioLogin siguiente={siguiente} />
          </div>
        </div>
      </section>
    </main>
  );
}

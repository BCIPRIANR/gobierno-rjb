import { NOMBRE_ROL, obtenerUsuarioActual } from "@/lib/auth";
import { menuParaRol } from "@/lib/navegacion";
import { NavegacionPrincipal } from "@/components/navegacion-principal";
import { cerrarSesion } from "@/app/(auth)/login/acciones";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const usuario = await obtenerUsuarioActual();
  const menu = menuParaRol(usuario.rol);

  return (
    <>
      <header className="bg-navy text-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 pb-2 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Grupo RJB</p>
              <h1 className="text-lg font-semibold leading-tight sm:text-xl">Gobierno Corporativo</h1>
            </div>
            <div className="flex items-center gap-3 text-right">
              <div className="hidden sm:block">
                <p className="text-sm font-medium leading-tight">{usuario.nombre}</p>
                <p className="text-xs text-white/70">{NOMBRE_ROL[usuario.rol]}</p>
              </div>
              <form action={cerrarSesion}>
                <button
                  type="submit"
                  className="rounded-md border border-white/30 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Salir
                </button>
              </form>
            </div>
          </div>
          <NavegacionPrincipal elementos={menu} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>

      <footer className="px-4 py-4 text-center text-xs text-gris-texto">
        Grupo RJB · Datos con estado visible: real · calculado · meta · N/D
      </footer>
    </>
  );
}

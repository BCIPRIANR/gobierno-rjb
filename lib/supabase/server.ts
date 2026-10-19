import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./tipos";

/**
 * Cliente para Server Components, Server Actions y Route Handlers.
 * Lee con la sesión del usuario (RLS). Crear uno nuevo por petición; nunca compartirlo.
 */
export async function crearClienteServidor() {
  const almacenCookies = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return almacenCookies.getAll();
        },
        setAll(cookiesPorEscribir) {
          try {
            cookiesPorEscribir.forEach(({ name, value, options }) =>
              almacenCookies.set(name, value, options),
            );
          } catch {
            // Desde un Server Component no se pueden escribir cookies.
            // El proxy (proxy.ts) se encarga de refrescar la sesión.
          }
        },
      },
    },
  );
}

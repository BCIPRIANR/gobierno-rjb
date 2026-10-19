"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./tipos";

/**
 * Cliente para componentes de cliente. Usa la sesión del usuario (cookies);
 * RLS decide qué filas puede ver. Nunca escribe: toda escritura va por el servidor.
 */
export function crearClienteNavegador() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

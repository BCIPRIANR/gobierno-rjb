import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./tipos";

/**
 * Cliente con `service_role`: salta RLS. SOLO en el servidor y SOLO para escribir,
 * después de verificar sesión, rol y permiso sobre la empresa (ver CLAUDE.md › Seguridad).
 */
export function crearClienteAdmin() {
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!llave) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  }

  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, llave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

import "server-only";

import type { Json } from "./supabase/tipos";
import { crearClienteAdmin } from "./supabase/admin";

export type AccionAuditoria =
  | "login"
  | "logout"
  | "subir_carga"
  | "ver_tablero"
  | "consulta_chat"
  | "cambio_configuracion";

type RegistroAuditoria = {
  usuarioId: string | null;
  accion: AccionAuditoria;
  entidad?: string;
  entidadId?: string;
  /** Solo metadatos. Nunca cifras financieras completas ni datos personales. */
  detalle?: Record<string, Json>;
};

/**
 * Inserta una fila en `auditoria` (tabla append-only). Nunca lanza: una falla
 * de auditoría no debe tumbar la acción del usuario, pero sí queda en consola.
 */
export async function registrarAuditoria(registro: RegistroAuditoria): Promise<void> {
  try {
    const admin = crearClienteAdmin();
    const { error } = await admin.from("auditoria").insert({
      usuario_id: registro.usuarioId,
      accion: registro.accion,
      entidad: registro.entidad ?? null,
      entidad_id: registro.entidadId ?? null,
      detalle: registro.detalle ?? {},
    });
    if (error) {
      console.error("[auditoria] no se pudo registrar", registro.accion, error.code);
    }
  } catch (e) {
    console.error("[auditoria] error inesperado", registro.accion, e instanceof Error ? e.message : e);
  }
}

import "server-only";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "./supabase/server";
import type { Database } from "./supabase/tipos";

export type Rol = Database["public"]["Enums"]["rol_usuario"];

/** Lo mínimo que la interfaz necesita saber del usuario. Nada sensible. */
export type UsuarioActual = {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
};

export const NOMBRE_ROL: Record<Rol, string> = {
  founder: "Founder",
  admin: "Administrador",
  gerente: "Gerente",
  contador: "Contador",
};

/**
 * Sesión + perfil del usuario que hace la petición. Si no hay sesión válida o el
 * perfil no existe / está inactivo, redirige a /login.
 */
export async function obtenerUsuarioActual(): Promise<UsuarioActual> {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("id, nombre, email, rol, activo")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || !perfil.activo) {
    // Hay cuenta en Auth pero no perfil: el admin aún no lo ha dado de alta.
    redirect("/login?motivo=sin-perfil");
  }

  return { id: perfil.id, nombre: perfil.nombre, email: perfil.email, rol: perfil.rol };
}

/** Exige uno de los roles indicados; si no, manda a /inicio. */
export async function requerirRol(...roles: Rol[]): Promise<UsuarioActual> {
  const usuario = await obtenerUsuarioActual();
  if (!roles.includes(usuario.rol)) {
    redirect("/inicio?motivo=sin-permiso");
  }
  return usuario;
}

/** Empresas que el usuario puede ver (RLS ya filtra; esto solo las lista). */
export async function empresasDelUsuario() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("empresas")
    .select("id, nombre, slug, es_demo")
    .eq("activa", true)
    .order("es_demo")
    .order("nombre");
  return data ?? [];
}

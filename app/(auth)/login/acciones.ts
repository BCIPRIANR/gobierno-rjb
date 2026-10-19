"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";

export type EstadoLogin = {
  error: string | null;
};

const esquemaLogin = z.object({
  email: z.string().trim().toLowerCase().email("Escribe un correo válido."),
  password: z.string().min(1, "Escribe tu contraseña."),
  siguiente: z.string().optional(),
});

/** Solo permitimos volver a rutas internas (sin esquema ni host). */
function rutaSegura(siguiente: string | undefined): string {
  if (siguiente && siguiente.startsWith("/") && !siguiente.startsWith("//")) {
    return siguiente;
  }
  return "/inicio";
}

export async function iniciarSesion(
  _estadoAnterior: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const entrada = esquemaLogin.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    siguiente: formData.get("siguiente") ?? undefined,
  });

  if (!entrada.success) {
    return { error: entrada.error.issues[0]?.message ?? "Revisa los datos." };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: entrada.data.email,
    password: entrada.data.password,
  });

  if (error || !data.user) {
    return {
      error: "Correo o contraseña incorrectos. Revisa los datos e intenta de nuevo.",
    };
  }

  await registrarAuditoria({
    usuarioId: data.user.id,
    accion: "login",
    detalle: { canal: "web", metodo: "password" },
  });

  redirect(rutaSegura(entrada.data.siguiente));
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.auth.signOut();

  if (user) {
    await registrarAuditoria({ usuarioId: user.id, accion: "logout", detalle: { canal: "web" } });
  }

  redirect("/login");
}

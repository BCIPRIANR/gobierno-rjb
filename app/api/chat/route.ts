import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { responderChat } from "@/lib/ia/chat";

const esquema = z.object({
  conversacion_id: z.string().uuid("Identificador de conversación inválido. Recarga la página."),
  pregunta: z.string().trim().min(2, "Escribe una pregunta.").max(1000, "La pregunta es muy larga (máximo 1000 caracteres)."),
});

const ROLES_CHAT = new Set(["founder", "admin", "gerente"]);

/** Pregunta al asistente. Sesión y rol se verifican aquí; las herramientas leen bajo RLS. */
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada. Vuelve a iniciar sesión." }, { status: 401 });

  const { data: perfil } = await supabase.from("perfiles").select("id, nombre, email, rol, activo").eq("id", user.id).maybeSingle();
  if (!perfil || !perfil.activo || !ROLES_CHAT.has(perfil.rol)) {
    return NextResponse.json({ error: "Tu rol no tiene acceso al chat." }, { status: 403 });
  }

  const cuerpo = esquema.safeParse(await request.json().catch(() => null));
  if (!cuerpo.success) {
    return NextResponse.json({ error: cuerpo.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  const resultado = await responderChat({
    usuario: { id: perfil.id, nombre: perfil.nombre, email: perfil.email, rol: perfil.rol },
    supabase,
    conversacionId: cuerpo.data.conversacion_id,
    pregunta: cuerpo.data.pregunta,
  });

  await registrarAuditoria({
    usuarioId: user.id,
    accion: "consulta_chat",
    entidad: "chat_mensajes",
    entidadId: cuerpo.data.conversacion_id,
    detalle: resultado.ok ? { herramientas: resultado.herramientas, modelo: resultado.modelo } : { error: resultado.codigo },
  });

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.codigo === "no_configurado" ? 503 : 502 });
  }
  return NextResponse.json({ respuesta: resultado.respuesta, herramientas: resultado.herramientas });
}

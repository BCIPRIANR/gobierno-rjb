import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Rutas que no exigen sesión. */
const RUTAS_PUBLICAS = ["/login"];

/** Rutas que se autentican por otro medio (token de Meta, CRON_SECRET). */
const RUTAS_SIN_SESION = ["/api/whatsapp/webhook", "/api/cron"];

function empiezaPor(pathname: string, prefijos: string[]) {
  return prefijos.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refresca la sesión de Supabase en cada petición y protege todo lo que
 * no sea público. Reemplaza al antiguo middleware.ts (Next 16).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (empiezaPor(pathname, RUTAS_SIN_SESION)) {
    return NextResponse.next({ request });
  }

  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesPorEscribir) {
          cookiesPorEscribir.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          respuesta = NextResponse.next({ request });
          cookiesPorEscribir.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() valida el token contra Supabase Auth; no confiar solo en la cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const esPublica = empiezaPor(pathname, RUTAS_PUBLICAS);

  if (!user && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?siguiente=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  if (user && esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/inicio";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return respuesta;
}

export const config = {
  matcher: [
    // Todo salvo archivos estáticos, imágenes optimizadas y el favicon.
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

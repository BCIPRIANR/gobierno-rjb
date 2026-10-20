import type { Rol } from "./auth";

export type ElementoMenu = {
  href: "/inicio" | "/cargas" | "/gestion" | "/informes" | "/chat" | "/admin";
  etiqueta: string;
};

/** Menú por rol (ver CLAUDE.md › Roles). El servidor vuelve a verificar en cada página. */
const MENU_POR_ROL: Record<Rol, ElementoMenu[]> = {
  founder: [
    { href: "/inicio", etiqueta: "Inicio" },
    { href: "/gestion", etiqueta: "Gestión" },
    { href: "/informes", etiqueta: "Informes" },
    { href: "/chat", etiqueta: "Chat" },
  ],
  admin: [
    { href: "/inicio", etiqueta: "Inicio" },
    { href: "/cargas", etiqueta: "Cargas" },
    { href: "/gestion", etiqueta: "Gestión" },
    { href: "/informes", etiqueta: "Informes" },
    { href: "/chat", etiqueta: "Chat" },
    { href: "/admin", etiqueta: "Administración" },
  ],
  gerente: [
    { href: "/inicio", etiqueta: "Inicio" },
    { href: "/gestion", etiqueta: "Gestión" },
    { href: "/informes", etiqueta: "Informes" },
    { href: "/chat", etiqueta: "Chat" },
  ],
  contador: [
    { href: "/inicio", etiqueta: "Inicio" },
    { href: "/cargas", etiqueta: "Cargas" },
  ],
};

export function menuParaRol(rol: Rol): ElementoMenu[] {
  return MENU_POR_ROL[rol];
}

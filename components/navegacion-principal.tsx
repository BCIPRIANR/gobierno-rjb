"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ElementoMenu } from "@/lib/navegacion";

export function NavegacionPrincipal({ elementos }: { elementos: ElementoMenu[] }) {
  const ruta = usePathname();

  return (
    <nav aria-label="Principal" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1">
        {elementos.map((el) => {
          const activo = ruta === el.href || ruta.startsWith(`${el.href}/`);
          return (
            <li key={el.href}>
              <Link
                href={el.href}
                aria-current={activo ? "page" : undefined}
                className={
                  "block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition " +
                  (activo ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white")
                }
              >
                {el.etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

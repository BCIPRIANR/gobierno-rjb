import type { Metadata } from "next";
import { requerirRol } from "@/lib/auth";
import { EnConstruccion } from "@/components/en-construccion";

export const metadata: Metadata = { title: "Gestión" };

export default async function PaginaGestion() {
  await requerirRol("founder", "admin", "gerente");
  return (
    <EnConstruccion
      titulo="Dashboard de Gestión"
      bloque={4}
      descripcion="Tarjetas KPI por empresa y mes, con variación, acumulado y tendencia."
    />
  );
}

import type { Metadata } from "next";
import { requerirRol } from "@/lib/auth";
import { EnConstruccion } from "@/components/en-construccion";

export const metadata: Metadata = { title: "Administración" };

export default async function PaginaAdmin() {
  await requerirRol("admin");
  return (
    <EnConstruccion
      titulo="Administración"
      bloque={7}
      descripcion="Usuarios, empresas y definiciones de KPI."
    />
  );
}

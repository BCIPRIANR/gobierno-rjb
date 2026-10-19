import type { Metadata } from "next";
import { requerirRol } from "@/lib/auth";
import { EnConstruccion } from "@/components/en-construccion";

export const metadata: Metadata = { title: "Cargas" };

export default async function PaginaCargas() {
  await requerirRol("contador", "admin");
  return (
    <EnConstruccion
      titulo="Portal de carga"
      bloque={2}
      descripcion="Aquí el contador sube los archivos mensuales y ve el estado de cada carga."
    />
  );
}

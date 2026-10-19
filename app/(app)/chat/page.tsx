import type { Metadata } from "next";
import { requerirRol } from "@/lib/auth";
import { EnConstruccion } from "@/components/en-construccion";

export const metadata: Metadata = { title: "Chat" };

export default async function PaginaChat() {
  await requerirRol("founder", "admin", "gerente");
  return (
    <EnConstruccion
      titulo="Chat con IA"
      bloque={6}
      descripcion="Preguntas sobre los KPI calculados, con sugerencias y cruces entre empresas."
    />
  );
}

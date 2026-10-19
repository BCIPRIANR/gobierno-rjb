import { redirect } from "next/navigation";

// La raíz siempre lleva al inicio; el proxy decide si antes hay que iniciar sesión.
export default function Raiz() {
  redirect("/inicio");
}

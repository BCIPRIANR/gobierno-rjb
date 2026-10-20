import type { ColorSemaforo } from "@/lib/kpi/semaforo";

export const ESTADO_TEXTO: Record<ColorSemaforo, string> = {
  verde: "Cumple",
  amarillo: "Seguimiento",
  rojo: "Requiere acción",
  sin_meta: "Sin meta",
  nd: "N/D",
  sin_semaforo: "Informativo",
};

const CLASE: Record<ColorSemaforo, string> = {
  verde: "bg-turquesa",
  amarillo: "bg-[#D9A400]",
  rojo: "bg-rojo",
  sin_meta: "bg-gris-borde",
  nd: "border border-gris-borde bg-white",
  sin_semaforo: "bg-gris-borde/60",
};

/** Punto de color del semáforo contra meta. El rojo solo marca deterioro. */
export function PuntoSemaforo({ color }: { color: ColorSemaforo }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${CLASE[color]}`} aria-label={ESTADO_TEXTO[color]} />;
}

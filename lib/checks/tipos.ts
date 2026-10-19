export type NivelCheck = "error" | "aviso";

/** Se guarda tal cual en `cargas.resultado_checks` (jsonb). */
export type ResultadoCheck = {
  codigo: string;
  ok: boolean;
  nivel: NivelCheck;
  mensaje: string;
};

export type Evaluacion = {
  estado: "aceptada" | "rechazada";
  checks: ResultadoCheck[];
  /** Mensajes de los checks de nivel error que fallaron, unidos. Null si fue aceptada. */
  motivoRechazo: string | null;
  /** Mes 1..12 hasta el que llegan los INGRESOS; null si no hay datos. */
  ultimoMesDatos: number | null;
};

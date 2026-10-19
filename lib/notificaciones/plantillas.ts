import { formatearCOPMillones, formatearPeriodo } from "@/lib/formato";

/**
 * Textos de los avisos (funciones puras). Mismo texto para WhatsApp y correo:
 * frases cortas, voz activa, sin cifras inventadas. Si un valor no está, se dice N/D.
 */

export type MensajeAviso = { asunto: string; cuerpo: string };

function fechaLarga(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return `${d} de ${formatearPeriodo(`${a}-${String(m).padStart(2, "0")}`).toLowerCase()}`;
}

export function plantillaRecordatorio(p: {
  empresa: string;
  nombreArchivo: string;
  periodo: string;
  fechaLimite: string;
  diasAtraso: number;
  url: string;
}): MensajeAviso {
  const mes = formatearPeriodo(p.periodo);
  if (p.diasAtraso > 0) {
    return {
      asunto: `Atrasado: ${p.nombreArchivo} de ${mes} · ${p.empresa}`,
      cuerpo:
        `Hola. El ${p.nombreArchivo} de ${mes} de ${p.empresa} está atrasado ${p.diasAtraso} ${p.diasAtraso === 1 ? "día" : "días"} ` +
        `(fecha límite: ${fechaLarga(p.fechaLimite)}). Súbelo hoy en ${p.url}.`,
    };
  }
  return {
    asunto: `Recordatorio: ${p.nombreArchivo} de ${mes} · ${p.empresa}`,
    cuerpo:
      `Hola. El ${p.nombreArchivo} de ${mes} de ${p.empresa} vence el ${fechaLarga(p.fechaLimite)}. ` +
      `Súbelo en ${p.url}.`,
  };
}

export function plantillaCargaAceptada(p: {
  empresa: string;
  esDemo: boolean;
  periodo: string;
  caracter: "preliminar" | "definitivo";
  version: number;
  ingresos: number | null;
  excedente: number | null;
  recaudoTotal: number | null;
  avisos: number;
  url: string;
}): MensajeAviso {
  const mes = formatearPeriodo(p.periodo);
  const cifra = (v: number | null) => (v === null ? "N/D" : formatearCOPMillones(v));
  const demo = p.esDemo ? " [DATOS DE DEMOSTRACIÓN]" : "";
  const avisos = p.avisos > 0 ? ` Hay ${p.avisos} ${p.avisos === 1 ? "aviso" : "avisos"} en el historial.` : "";
  return {
    asunto: `Carga aceptada: ${p.empresa} · ${mes} (${p.caracter})${demo}`,
    cuerpo:
      `${p.empresa}${demo} cargó el informe de ${mes} (${p.caracter}, versión ${p.version}) y pasó los controles. ` +
      `Ingresos ${cifra(p.ingresos)} · Excedente entre ingresos y costos/gastos ${cifra(p.excedente)} · Total recaudo ${cifra(p.recaudoTotal)}.` +
      `${avisos} Tablero: ${p.url}`,
  };
}

export function plantillaCargaRechazada(p: {
  empresa: string;
  esDemo: boolean;
  periodo: string;
  nombreArchivo: string;
  motivo: string;
  url: string;
}): MensajeAviso {
  const mes = formatearPeriodo(p.periodo);
  const demo = p.esDemo ? " [DATOS DE DEMOSTRACIÓN]" : "";
  return {
    asunto: `Carga rechazada: ${p.empresa} · ${mes}${demo}`,
    cuerpo:
      `El archivo "${p.nombreArchivo}" de ${mes} de ${p.empresa}${demo} no pasó los controles. ` +
      `Motivo: ${p.motivo} Corrige el archivo y vuelve a subirlo en ${p.url}.`,
  };
}

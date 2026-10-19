import { z } from "zod";

export const LIMITE_BYTES = 20 * 1024 * 1024; // 20 MB
export const EXTENSION_PERMITIDA = ".xlsx";
export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Campos del formulario de carga (el archivo se valida aparte). */
export const esquemaCarga = z.object({
  empresa_id: z.string().uuid("Elige una empresa."),
  tipo_archivo: z.string().regex(/^[A-Z0-9_]{3,40}$/, "Elige un tipo de archivo."),
  /** Mes en formato YYYY-MM (input type="month"). */
  periodo: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Elige el periodo (mes y año).")
    .transform((mes) => `${mes}-01`),
  caracter: z.enum(["preliminar", "definitivo"], {
    message: "Indica si el archivo es preliminar o definitivo.",
  }),
});

export type DatosCarga = z.infer<typeof esquemaCarga>;

export type ResultadoValidacion = { ok: true } | { ok: false; error: string };

/** Reglas del archivo: solo .xlsx y máximo 20 MB. */
export function validarArchivoXlsx(archivo: { nombre: string; tamano: number }): ResultadoValidacion {
  if (!archivo.nombre || archivo.tamano === 0) {
    return { ok: false, error: "Adjunta el archivo .xlsx que quieres cargar." };
  }
  if (!archivo.nombre.toLowerCase().endsWith(EXTENSION_PERMITIDA)) {
    return {
      ok: false,
      error: "Solo se aceptan archivos .xlsx. Guarda el libro en formato Excel (.xlsx) e intenta de nuevo.",
    };
  }
  if (archivo.tamano > LIMITE_BYTES) {
    const mb = (archivo.tamano / (1024 * 1024)).toFixed(1).replace(".", ",");
    return {
      ok: false,
      error: `El archivo pesa ${mb} MB y el máximo es 20 MB. Quita hojas u objetos innecesarios.`,
    };
  }
  return { ok: true };
}

/** Ruta en el bucket `cargas`: {empresa_id}/{periodo}/{uuid}.xlsx */
export function rutaStorage(empresaId: string, periodo: string, uuid: string): string {
  return `${empresaId}/${periodo}/${uuid}${EXTENSION_PERMITIDA}`;
}


/** Mes anterior al actual en formato YYYY-MM (valor por defecto del formulario). */
export function mesAnterior(hoy: Date = new Date()): string {
  const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

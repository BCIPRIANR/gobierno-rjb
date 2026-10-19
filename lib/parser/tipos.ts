/** Secciones del esquema `hechos_financieros.seccion`. */
export type Seccion =
  | "ingresos"
  | "costos_gastos"
  | "recaudo_entidad"
  | "recaudo_medio_pago"
  | "pagos"
  | "cartera"
  | "personal_ingreso"
  | "personal_retiro"
  | "planta";

export type Unidad = "COP" | "personas";

/** Un valor leído del archivo, con su origen exacto (hoja, fila y columna de Excel). */
export type Hecho = {
  seccion: Seccion;
  concepto: string;
  /** NIT normalizado (solo dígitos, sin DV) cuando la hoja lo trae. */
  nit: string | null;
  /** Mes 1..12. El año lo pone la carga. */
  mes: number;
  valor: number;
  unidad: Unidad;
  hoja_origen: string;
  fila_origen: number;
  columna_origen: string;
};

export type ColumnaMes = { mes: number; columna: number };

/** Tabla detectada dentro de una hoja. Filas y columnas en numeración de Excel (1-based / letras). */
export type TablaDetectada = {
  seccion: Seccion;
  hoja: string;
  filaEncabezado: number;
  filaInicio: number;
  filaFin: number;
  meses: ColumnaMes[];
  /** Último mes con al menos un valor en la tabla; null si no hay datos. */
  ultimoMes: number | null;
  filasDatos: number;
};

/** Celda que debía ser numérica y no lo es. */
export type ProblemaCelda = {
  hoja: string;
  fila: number;
  columna: string;
  valor: string;
  seccion: Seccion;
};

export type Duplicado = {
  seccion: Seccion;
  hoja: string;
  concepto: string;
  filas: number[];
  /** true si las filas repetidas tienen exactamente los mismos valores. */
  identicos: boolean;
};

/** Comparación entre la fila "Total general" de la tabla y la suma de sus filas. */
export type ComparacionTotal = {
  seccion: Seccion;
  hoja: string;
  mes: number;
  totalFila: number;
  sumaFilas: number;
};

export type TotalRecaudo = {
  hoja: string;
  fila: number;
  /** Valor por mes tal como viene en la fila TOTAL RECAUDO. */
  porMes: { mes: number; valor: number; columna: string }[];
  totalGeneral: number | null;
};

export type ResultadoParser = {
  hojas: string[];
  tablas: TablaDetectada[];
  hechos: Hecho[];
  problemas: ProblemaCelda[];
  duplicados: Duplicado[];
  comparacionesTotales: ComparacionTotal[];
  totalRecaudo: TotalRecaudo | null;
  /** Secciones requeridas que no se encontraron, con el motivo. */
  faltantes: { seccion: Seccion | "total_recaudo"; motivo: string }[];
  /** Observaciones no bloqueantes del parser. */
  notas: string[];
};

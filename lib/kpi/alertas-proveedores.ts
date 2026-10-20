import { formatearCOPMillones, formatearPeriodo, formatearVariacion } from "@/lib/formato";

/**
 * Alerta de facturación de proveedores (regla del analista): compara lo facturado
 * en el mes en revisión contra el promedio de los 6 meses previos; desviación
 * mayor al umbral (±20%) → alerta "Superior" o "Inferior".
 *
 * Convención del modelo del analista: dentro de la ventana, un mes sin factura
 * cuenta como 0 (no hubo compra). Un proveedor sin ningún valor en la ventana ni
 * en el mes queda fuera ("sin datos"), nunca se estima.
 */

export type PagoProveedor = { nit: string | null; concepto: string; periodo: string; valor: number };

export type FilaAlerta = {
  clave: string;
  nit: string | null;
  proveedor: string;
  mesRevision: number;
  mesAnterior: number | null;
  promedio6: number | null;
  mesesConDato: number;
  diferencia: number | null;
  desviacion: number | null;
  tipo: "Superior" | "Inferior" | null;
  alerta: boolean;
  textos: { mesRevision: string; mesAnterior: string; promedio6: string; diferencia: string; desviacion: string };
};

export type ResultadoAlertas = {
  periodo: string;
  periodoTexto: string;
  ventana: { desde: string; hasta: string };
  umbral: number;
  analizados: number;
  enAlerta: number;
  sinHistoria: number;
  filas: FilaAlerta[];
};

function restarMeses(periodo: string, n: number): string {
  const d = new Date(Date.UTC(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)) - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function alertasProveedores(pagos: PagoProveedor[], periodo: string, umbral = 0.2, ventana = 6): ResultadoAlertas {
  const meses = Array.from({ length: ventana }, (_, i) => restarMeses(periodo, i + 1)); // mes-1 … mes-6
  const mesAnterior = meses[0];

  // Agrupar por proveedor (NIT si existe; si no, nombre) y periodo.
  const grupos = new Map<string, { nit: string | null; proveedor: string; porMes: Map<string, number> }>();
  for (const p of pagos) {
    const clave = p.nit ?? `nombre:${p.concepto.trim().toUpperCase()}`;
    const g = grupos.get(clave) ?? { nit: p.nit, proveedor: p.concepto.trim(), porMes: new Map() };
    g.porMes.set(p.periodo, (g.porMes.get(p.periodo) ?? 0) + p.valor);
    grupos.set(clave, g);
  }

  const filas: FilaAlerta[] = [];
  let sinHistoria = 0;
  for (const [clave, g] of grupos) {
    const mesesConDato = meses.filter((m) => g.porMes.has(m)).length;
    const valorMes = g.porMes.get(periodo);
    if (mesesConDato === 0 && valorMes === undefined) {
      sinHistoria++;
      continue;
    }
    const mesRevision = valorMes ?? 0;
    const anterior = g.porMes.has(mesAnterior) ? (g.porMes.get(mesAnterior) as number) : null;
    const promedio6 = mesesConDato === 0 ? null : meses.reduce((s, m) => s + (g.porMes.get(m) ?? 0), 0) / ventana;
    const diferencia = promedio6 === null ? null : mesRevision - promedio6;
    const desviacion = promedio6 === null || promedio6 === 0 ? null : diferencia! / promedio6;
    const alerta = desviacion !== null && Math.abs(desviacion) > umbral;
    filas.push({
      clave,
      nit: g.nit,
      proveedor: g.proveedor,
      mesRevision,
      mesAnterior: anterior,
      promedio6,
      mesesConDato,
      diferencia,
      desviacion,
      tipo: alerta ? (desviacion! > 0 ? "Superior" : "Inferior") : null,
      alerta,
      textos: {
        mesRevision: formatearCOPMillones(mesRevision),
        mesAnterior: anterior === null ? "N/D" : formatearCOPMillones(anterior),
        promedio6: promedio6 === null ? "N/D" : formatearCOPMillones(promedio6),
        diferencia: diferencia === null ? "N/D" : formatearCOPMillones(diferencia),
        desviacion: desviacion === null ? (promedio6 === 0 ? "N/D (promedio 0)" : "N/D") : formatearVariacion(desviacion),
      },
    });
  }

  // Impacto: mayor diferencia absoluta primero; las alertas antes que el resto.
  filas.sort((a, b) => Number(b.alerta) - Number(a.alerta) || Math.abs(b.diferencia ?? 0) - Math.abs(a.diferencia ?? 0));

  return {
    periodo,
    periodoTexto: formatearPeriodo(periodo),
    ventana: { desde: meses[meses.length - 1], hasta: mesAnterior },
    umbral,
    analizados: filas.length,
    enAlerta: filas.filter((f) => f.alerta).length,
    sinHistoria,
    filas,
  };
}

import type { DatosInforme } from "./armar";
import { estadoGeneral, type ColorSemaforo } from "@/lib/kpi/semaforo";
import { formatearCOPMillones } from "@/lib/formato";

/**
 * Resumen del Grupo (función pura): una fila por empresa con su estado general,
 * las tres cifras clave, el mensaje del mes y las decisiones pendientes.
 * Las empresas sin informe aparecen como "sin informe"; nada se estima.
 */

export type InformeEmpresa = {
  empresa: { id: string; nombre: string; slug: string; es_demo: boolean };
  informe: {
    estado: "borrador" | "aprobado";
    datos: DatosInforme;
    resumen_ia: string | null;
    decisiones_junta: string | null;
    causas_acciones: string | null;
    hechos_relevantes: string | null;
    compromisos: string | null;
  } | null;
};

export type FilaGrupo = {
  empresa: InformeEmpresa["empresa"];
  estadoInforme: "sin_informe" | "borrador" | "pendiente_comentario" | "aprobado";
  color: ColorSemaforo;
  conteo: { verdes: number; amarillos: number; rojos: number; sinMeta: number };
  ingresos: { valor: number | null; texto: string };
  excedente: { valor: number | null; texto: string };
  flujoNeto: { valor: number | null; texto: string };
  mensaje: string | null;
  decisiones: string | null;
  alertasRojas: number;
};

export type ResumenGrupo = {
  periodo: string;
  filas: FilaGrupo[];
  totales: {
    ingresos: { valor: number | null; texto: string; empresas: number };
    excedente: { valor: number | null; texto: string; empresas: number };
    flujoNeto: { valor: number | null; texto: string; empresas: number };
  };
  conteo: { conInforme: number; aprobados: number; sinInforme: number; rojos: number; amarillos: number; verdes: number };
};

function indicador(datos: DatosInforme, codigo: string): { valor: number | null; texto: string } {
  const i = datos.indicadores.find((x) => x.codigo === codigo);
  return i ? { valor: i.mes.valor, texto: i.mes.texto } : { valor: null, texto: "N/D" };
}

function sumar(filas: FilaGrupo[], campo: "ingresos" | "excedente" | "flujoNeto") {
  const conDato = filas.filter((f) => f[campo].valor !== null);
  if (conDato.length === 0) return { valor: null, texto: "N/D", empresas: 0 };
  const valor = conDato.reduce((s, f) => s + (f[campo].valor as number), 0);
  return { valor, texto: formatearCOPMillones(valor), empresas: conDato.length };
}

export function armarResumenGrupo(periodo: string, informes: InformeEmpresa[]): ResumenGrupo {
  const filas: FilaGrupo[] = informes
    .map((e): FilaGrupo => {
      if (!e.informe) {
        return {
          empresa: e.empresa,
          estadoInforme: "sin_informe",
          color: "nd",
          conteo: { verdes: 0, amarillos: 0, rojos: 0, sinMeta: 0 },
          ingresos: { valor: null, texto: "N/D" },
          excedente: { valor: null, texto: "N/D" },
          flujoNeto: { valor: null, texto: "N/D" },
          mensaje: null,
          decisiones: null,
          alertasRojas: 0,
        };
      }
      const d = e.informe.datos;
      const g = d.estadoGeneral ?? estadoGeneral(d.indicadores.map((i) => i.semaforo.color));
      const bloques = [e.informe.causas_acciones, e.informe.hechos_relevantes, e.informe.decisiones_junta, e.informe.compromisos];
      const comentado = bloques.some((b) => b && b.trim());
      return {
        empresa: e.empresa,
        estadoInforme: e.informe.estado === "aprobado" ? "aprobado" : comentado ? "borrador" : "pendiente_comentario",
        color: g.color,
        conteo: { verdes: g.verdes, amarillos: g.amarillos, rojos: g.rojos, sinMeta: g.sinMeta },
        ingresos: indicador(d, "ingresos"),
        excedente: indicador(d, "excedente"),
        flujoNeto: indicador(d, "flujo_neto"),
        mensaje: e.informe.resumen_ia ? (e.informe.resumen_ia.split("\n")[0]?.trim() ?? null) : null,
        decisiones: e.informe.decisiones_junta?.trim() || null,
        alertasRojas: g.rojos,
      };
    })
    // Rojos primero, luego amarillos; las demo al final.
    .sort((a, b) => {
      if (a.empresa.es_demo !== b.empresa.es_demo) return a.empresa.es_demo ? 1 : -1;
      const peso = (c: ColorSemaforo) => ({ rojo: 0, amarillo: 1, verde: 2, sin_meta: 3, sin_semaforo: 4, nd: 5 })[c];
      return peso(a.color) - peso(b.color) || a.empresa.nombre.localeCompare(b.empresa.nombre);
    });

  return {
    periodo,
    filas,
    totales: { ingresos: sumar(filas, "ingresos"), excedente: sumar(filas, "excedente"), flujoNeto: sumar(filas, "flujoNeto") },
    conteo: {
      conInforme: filas.filter((f) => f.estadoInforme !== "sin_informe").length,
      aprobados: filas.filter((f) => f.estadoInforme === "aprobado").length,
      sinInforme: filas.filter((f) => f.estadoInforme === "sin_informe").length,
      rojos: filas.filter((f) => f.color === "rojo").length,
      amarillos: filas.filter((f) => f.color === "amarillo").length,
      verdes: filas.filter((f) => f.color === "verde").length,
    },
  };
}

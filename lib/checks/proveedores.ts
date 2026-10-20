import type { ResultadoProveedores } from "@/lib/parser/proveedores";
import { formatearPeriodo } from "@/lib/formato";
import type { Evaluacion, ResultadoCheck } from "./tipos";

/** Controles del archivo PROVEEDORES. `periodo` es el mes declarado por el contador (`YYYY-MM-01`). */
export function evaluarProveedores(parser: ResultadoProveedores, periodo: string, empresaNombre: string): Evaluacion {
  const checks: ResultadoCheck[] = [];

  // 1. Encabezado y filas
  if (parser.faltantes.length === 0) {
    checks.push({
      codigo: "encabezado",
      ok: true,
      nivel: "error",
      mensaje: `Hoja "${parser.hoja}": ${parser.proveedores.length} filas y ${parser.meses.length} columnas de mes (${formatearPeriodo(parser.meses[0].periodo)} a ${formatearPeriodo(parser.meses[parser.meses.length - 1].periodo)}).`,
    });
  } else {
    checks.push({ codigo: "encabezado", ok: false, nivel: "error", mensaje: `${parser.faltantes.join(" ")} Revisa que la hoja tenga las columnas NIT, PROVEEDORES y las fechas de cada mes.` });
  }

  // 2. Valores numéricos
  if (parser.problemas.length === 0) {
    checks.push({ codigo: "valores_numericos", ok: true, nivel: "error", mensaje: "Todas las celdas de valores son numéricas." });
  } else {
    const ejemplos = parser.problemas.slice(0, 3).map((p) => `${p.hoja}!${p.columna}${p.fila} ("${p.valor}")`).join(", ");
    checks.push({
      codigo: "valores_numericos",
      ok: false,
      nivel: "error",
      mensaje: `Hay ${parser.problemas.length} celdas con texto donde debería haber un número: ${ejemplos}${parser.problemas.length > 3 ? " y más" : ""}. Corrígelas y vuelve a subir.`,
    });
  }

  // 3. NIT
  if (parser.nitInvalidos.length > 0) {
    checks.push({
      codigo: "nit_validos",
      ok: true,
      nivel: "aviso",
      mensaje: `${parser.nitInvalidos.length} filas con NIT no válido (se guardan sin enlace a terceros): ${parser.nitInvalidos.slice(0, 3).map((n) => `fila ${n.fila} "${n.nombre}"`).join(", ")}.`,
    });
  }
  if (parser.nitRepetidos.length > 0) {
    const detalle = parser.nitRepetidos.slice(0, 3).map((d) => `${d.nit} (${d.nombres.join(" / ")}, filas ${d.filas.join(", ")})`).join("; ");
    checks.push({ codigo: "nit_repetidos", ok: true, nivel: "aviso", mensaje: `Un mismo NIT aparece en más de una fila: ${detalle}. Se suman al mismo tercero; conviene unificar.` });
  }

  // 4. Último mes con datos vs periodo declarado
  const conDatos = [...new Set(parser.hechos.map((h) => h.periodo))].sort();
  const ultimo = conDatos.at(-1) ?? null;
  if (parser.faltantes.length === 0) {
    if (!ultimo) {
      checks.push({ codigo: "ultimo_mes", ok: false, nivel: "error", mensaje: "El archivo no tiene ningún valor en las columnas de mes." });
    } else if (!conDatos.includes(periodo)) {
      checks.push({
        codigo: "ultimo_mes",
        ok: false,
        nivel: "error",
        mensaje: `El periodo elegido es ${formatearPeriodo(periodo)} pero el archivo no tiene valores en ese mes (último con datos: ${formatearPeriodo(ultimo)}). Elige el mes correcto.`,
      });
    } else {
      checks.push({ codigo: "ultimo_mes", ok: true, nivel: "error", mensaje: `Hay valores para ${formatearPeriodo(periodo)}; último mes con datos: ${formatearPeriodo(ultimo)}.` });
      if (ultimo > periodo) {
        checks.push({ codigo: "meses_posteriores", ok: true, nivel: "aviso", mensaje: `El archivo trae valores después de ${formatearPeriodo(periodo)} (hasta ${formatearPeriodo(ultimo)}); se guardan, pero la alerta se calcula sobre el mes declarado.` });
      }
    }
  }

  // 5. Columna Empresa (si existe) vs empresa de la carga
  if (parser.empresaDeclarada) {
    const a = parser.empresaDeclarada.toLowerCase();
    const b = empresaNombre.toLowerCase();
    const coincide = a === b || b.includes(a) || a.includes(b.split(" ")[0]);
    checks.push({
      codigo: "empresa",
      ok: true,
      nivel: coincide ? "aviso" : "aviso",
      mensaje: coincide
        ? `La columna Empresa del archivo dice "${parser.empresaDeclarada}" y coincide con ${empresaNombre}.`
        : `La columna Empresa del archivo dice "${parser.empresaDeclarada}" pero la carga es de ${empresaNombre}. Verifica que subiste el archivo correcto.`,
    });
  }

  for (const nota of parser.notas) checks.push({ codigo: "nota_parser", ok: true, nivel: "aviso", mensaje: nota });

  const errores = checks.filter((c) => c.nivel === "error" && !c.ok);
  return {
    estado: errores.length === 0 ? "aceptada" : "rechazada",
    checks,
    motivoRechazo: errores.length === 0 ? null : errores.map((c) => c.mensaje).join(" · "),
    ultimoMesDatos: ultimo ? Number(ultimo.slice(5, 7)) : null,
  };
}

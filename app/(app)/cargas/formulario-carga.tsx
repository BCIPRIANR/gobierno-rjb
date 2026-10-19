"use client";

import { useActionState, useRef, useState } from "react";
import { validarArchivoXlsx } from "@/lib/cargas/validacion";
import { formatearTamano } from "@/lib/formato";
import { subirArchivo, type EstadoSubida } from "./acciones";

export type EmpresaOpcion = { id: string; nombre: string; es_demo: boolean };
export type TipoOpcion = { codigo: string; nombre: string; periodicidad: "mensual" | "anual"; obligatorio: boolean };

const estadoInicial: EstadoSubida = { ok: false, mensaje: null };

const claseCampo =
  "h-11 w-full rounded-md border border-gris-borde bg-white px-3 text-base text-navy outline-none focus:border-azul focus:ring-2 focus:ring-azul/20";

export function FormularioCarga({
  empresas,
  tipos,
  mesPorDefecto,
}: {
  empresas: EmpresaOpcion[];
  tipos: TipoOpcion[];
  mesPorDefecto: string;
}) {
  const [archivo, setArchivo] = useState<{ nombre: string; tamano: number } | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [estado, accion, enviando] = useActionState(async (anterior: EstadoSubida, datos: FormData) => {
    const resultado = await subirArchivo(anterior, datos);
    if (resultado.ok) {
      // Limpia el formulario tras una carga exitosa (fuera de un efecto).
      formRef.current?.reset();
      setArchivo(null);
      setErrorArchivo(null);
    }
    return resultado;
  }, estadoInicial);

  function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) {
      setArchivo(null);
      setErrorArchivo(null);
      return;
    }
    const r = validarArchivoXlsx({ nombre: f.name, tamano: f.size });
    setArchivo({ nombre: f.name, tamano: f.size });
    setErrorArchivo(r.ok ? null : r.error);
  }

  const sinEmpresas = empresas.length === 0;

  return (
    <form ref={formRef} action={accion} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-navy">Empresa</span>
        <select name="empresa_id" required className={claseCampo} defaultValue={empresas.length === 1 ? empresas[0].id : ""}>
          {empresas.length !== 1 ? <option value="">Elige una empresa</option> : null}
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
              {e.es_demo ? " — DATOS DE DEMOSTRACIÓN" : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-navy">Tipo de archivo</span>
        <select name="tipo_archivo" required className={claseCampo} defaultValue={tipos[0]?.codigo ?? ""}>
          {tipos.map((t) => (
            <option key={t.codigo} value={t.codigo}>
              {t.nombre}
              {t.obligatorio ? "" : " (opcional)"}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-navy">Periodo</span>
          <input name="periodo" type="month" required defaultValue={mesPorDefecto} className={claseCampo} />
          <span className="text-xs text-gris-texto">Mes al que corresponden los datos.</span>
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium text-navy">Carácter</legend>
          <div className="flex h-11 items-center gap-5">
            <label className="flex items-center gap-2 text-sm text-navy">
              <input type="radio" name="caracter" value="preliminar" defaultChecked className="accent-azul" />
              Preliminar
            </label>
            <label className="flex items-center gap-2 text-sm text-navy">
              <input type="radio" name="caracter" value="definitivo" className="accent-azul" />
              Definitivo
            </label>
          </div>
          <span className="text-xs text-gris-texto">El Founder verá esta etiqueta junto al dato.</span>
        </fieldset>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-navy">Archivo (.xlsx, máximo 20 MB)</span>
        <input
          name="archivo"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          onChange={alElegirArchivo}
          className="block w-full text-sm text-gris-texto file:mr-3 file:rounded-md file:border file:border-gris-borde file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-navy hover:file:bg-gris-fondo"
        />
        {archivo && !errorArchivo ? (
          <span className="text-xs text-gris-texto">
            {archivo.nombre} · {formatearTamano(archivo.tamano)}
          </span>
        ) : null}
        {errorArchivo ? <span className="text-xs text-rojo">{errorArchivo}</span> : null}
      </label>

      {estado.mensaje ? (
        <p
          role={estado.ok ? "status" : "alert"}
          className={
            estado.ok
              ? "rounded-md border border-turquesa/40 bg-turquesa/5 px-3 py-2 text-sm text-navy"
              : "rounded-md border border-rojo/30 bg-rojo/5 px-3 py-2 text-sm text-rojo"
          }
        >
          {estado.mensaje}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enviando || sinEmpresas || Boolean(errorArchivo)}
        className="h-11 rounded-md bg-azul text-base font-semibold text-white transition hover:bg-navy disabled:cursor-not-allowed disabled:opacity-60"
      >
        {enviando ? "Subiendo…" : "Subir archivo"}
      </button>

      {sinEmpresas ? (
        <p className="text-sm text-gris-texto">No tienes empresas asignadas. Pide al administrador que te asigne una.</p>
      ) : null}
    </form>
  );
}

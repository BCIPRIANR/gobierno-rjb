"use client";

import { useActionState } from "react";
import { aprobarInforme, generarInforme, guardarBloques, type EstadoAccion } from "@/app/(app)/informes/acciones";

const inicial: EstadoAccion = { tipo: null, mensaje: null };

function Mensaje({ estado }: { estado: EstadoAccion }) {
  if (!estado.mensaje) return null;
  return (
    <p
      role={estado.tipo === "exito" ? "status" : "alert"}
      className={
        estado.tipo === "exito"
          ? "rounded-md border border-turquesa/40 bg-turquesa/5 px-3 py-2 text-sm text-navy"
          : "rounded-md border border-rojo/30 bg-rojo/5 px-3 py-2 text-sm text-rojo"
      }
    >
      {estado.mensaje}
    </p>
  );
}

export function BotonGenerar({ empresaId, periodo, existe }: { empresaId: string; periodo: string; existe: boolean }) {
  const [estado, accion, enviando] = useActionState(generarInforme, inicial);
  return (
    <form action={accion} className="flex flex-col gap-2 print:hidden">
      <input type="hidden" name="empresa_id" value={empresaId} />
      <input type="hidden" name="periodo" value={periodo} />
      <button
        type="submit"
        disabled={enviando}
        className={
          existe
            ? "h-10 rounded-md border border-gris-borde bg-white px-4 text-sm font-medium text-navy transition hover:bg-gris-fondo disabled:opacity-60"
            : "h-10 rounded-md bg-azul px-4 text-sm font-semibold text-white transition hover:bg-navy disabled:opacity-60"
        }
      >
        {enviando ? "Generando…" : existe ? "Regenerar borrador" : "Generar borrador"}
      </button>
      <Mensaje estado={estado} />
    </form>
  );
}

const claseArea =
  "min-h-[88px] w-full rounded-md border border-gris-borde bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azul focus:ring-2 focus:ring-azul/20 disabled:bg-gris-fondo print:min-h-0 print:border-0 print:p-0";

export function BloquesGerente({
  informeId,
  valores,
  aprobado,
}: {
  informeId: string;
  valores: { causas_acciones: string; hechos_relevantes: string; decisiones_junta: string; compromisos: string };
  aprobado: boolean;
}) {
  const [estado, accion, enviando] = useActionState(guardarBloques, inicial);
  const campos: { nombre: keyof typeof valores; numero: number; titulo: string; ayuda: string }[] = [
    { nombre: "causas_acciones", numero: 6, titulo: "Causas y acciones frente a cada alerta", ayuda: "Una línea por alerta: causa, acción, responsable y fecha." },
    { nombre: "hechos_relevantes", numero: 7, titulo: "Hechos relevantes", ayuda: "Máximo 5 puntos: contratos, clientes, personal, normativa." },
    { nombre: "decisiones_junta", numero: 8, titulo: "Decisiones que se piden a la Junta", ayuda: "Lo que necesitas que la Junta apruebe o defina." },
    { nombre: "compromisos", numero: 9, titulo: "Estado de los compromisos anteriores", ayuda: "Qué se cumplió, qué sigue pendiente y por qué." },
  ];

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="informe_id" value={informeId} />
      {campos.map((c) => (
        <section key={c.nombre} className="break-inside-avoid">
          <h3 className="flex items-baseline gap-2 text-sm font-semibold text-navy">
            <span className="rounded bg-navy px-1.5 py-0.5 text-[10px] text-white">{c.numero}</span>
            {c.titulo}
            <span className="rounded bg-[#C9772A]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#8A4B10] print:hidden">Gerente</span>
          </h3>
          <p className="mb-1 text-xs text-gris-texto print:hidden">{c.ayuda}</p>
          {aprobado ? (
            <p className="whitespace-pre-wrap text-sm text-navy">{valores[c.nombre] || <span className="text-gris-texto">Pendiente de comentario.</span>}</p>
          ) : (
            <textarea name={c.nombre} defaultValue={valores[c.nombre]} className={claseArea} placeholder="Pendiente de comentario." maxLength={4000} />
          )}
        </section>
      ))}
      {!aprobado ? (
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <button type="submit" disabled={enviando} className="h-10 rounded-md bg-azul px-4 text-sm font-semibold text-white transition hover:bg-navy disabled:opacity-60">
            {enviando ? "Guardando…" : "Guardar bloques"}
          </button>
          <Mensaje estado={estado} />
        </div>
      ) : null}
    </form>
  );
}

export function BotonAprobar({ informeId }: { informeId: string }) {
  const [estado, accion, enviando] = useActionState(aprobarInforme, inicial);
  return (
    <form action={accion} className="flex flex-wrap items-center gap-3 print:hidden">
      <input type="hidden" name="informe_id" value={informeId} />
      <button
        type="submit"
        disabled={enviando}
        onClick={(e) => {
          if (!window.confirm("Al aprobar, el informe queda cerrado: no se podrá editar ni regenerar. ¿Continuar?")) e.preventDefault();
        }}
        className="h-10 rounded-md border border-turquesa bg-white px-4 text-sm font-semibold text-turquesa transition hover:bg-turquesa/5 disabled:opacity-60"
      >
        {enviando ? "Aprobando…" : "Aprobar informe"}
      </button>
      <Mensaje estado={estado} />
    </form>
  );
}

export function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-10 rounded-md border border-gris-borde bg-white px-4 text-sm font-medium text-navy transition hover:bg-gris-fondo print:hidden"
    >
      Imprimir / PDF
    </button>
  );
}

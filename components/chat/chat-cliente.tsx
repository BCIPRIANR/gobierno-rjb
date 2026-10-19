"use client";

import { useEffect, useRef, useState } from "react";

type Mensaje = { id: number; rol: "user" | "assistant"; texto: string; herramientas?: string[] };

const NOMBRE_HERRAMIENTA: Record<string, string> = {
  listar_empresas: "empresas",
  consultar_kpi: "KPI del mes",
  serie_kpi: "serie mensual",
  top_conceptos: "top conceptos",
  terceros_compartidos: "cruce de terceros",
  semaforo_cargas: "semáforo",
};

export function ChatCliente({ conversacionId, sugerencias, iaDisponible }: { conversacionId: string; sugerencias: string[]; iaDisponible: boolean }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const siguienteId = useRef(1);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes, enviando]);

  async function enviar(pregunta: string) {
    const limpia = pregunta.trim();
    if (!limpia || enviando) return;
    setError(null);
    setTexto("");
    setMensajes((m) => [...m, { id: siguienteId.current++, rol: "user", texto: limpia }]);
    setEnviando(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversacion_id: conversacionId, pregunta: limpia }),
      });
      const datos = (await r.json().catch(() => ({}))) as { respuesta?: string; herramientas?: string[]; error?: string };
      if (!r.ok || !datos.respuesta) {
        setError(datos.error ?? "No se pudo obtener respuesta. Intenta de nuevo.");
        return;
      }
      setMensajes((m) => [...m, { id: siguienteId.current++, rol: "assistant", texto: datos.respuesta as string, herramientas: datos.herramientas }]);
    } catch {
      setError("Sin conexión con el servidor. Revisa tu red e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] flex-col rounded-lg border border-gris-borde bg-white">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {mensajes.length === 0 ? (
          <p className="text-sm text-gris-texto">
            Pregunta por los KPI de una empresa, su tendencia en el año, los mayores deudores, el semáforo de cargas o los terceros que comparten varias empresas.
            Toda cifra que responda viene de los KPI calculados; si falta un dato, dirá N/D.
          </p>
        ) : null}

        {mensajes.map((m) => (
          <div key={m.id} className={m.rol === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.rol === "user"
                  ? "max-w-[85%] rounded-lg bg-azul px-3 py-2 text-sm text-white"
                  : "max-w-[85%] rounded-lg border border-gris-borde bg-gris-fondo px-3 py-2 text-sm text-navy"
              }
            >
              <p className="whitespace-pre-wrap">{m.texto}</p>
              {m.herramientas && m.herramientas.length > 0 ? (
                <p className="mt-1 text-[11px] text-gris-texto">
                  Fuente: {[...new Set(m.herramientas)].map((h) => NOMBRE_HERRAMIENTA[h] ?? h).join(" · ")}
                </p>
              ) : null}
            </div>
          </div>
        ))}

        {enviando ? (
          <div className="flex justify-start">
            <div className="rounded-lg border border-gris-borde bg-gris-fondo px-3 py-2 text-sm text-gris-texto">Consultando los KPI…</div>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-md border border-rojo/30 bg-rojo/5 px-3 py-2 text-sm text-rojo">
            {error}
          </p>
        ) : null}
        <div ref={finRef} />
      </div>

      <div className="border-t border-gris-borde p-3">
        {sugerencias.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {sugerencias.map((s) => (
              <button
                key={s}
                type="button"
                disabled={enviando || !iaDisponible}
                onClick={() => enviar(s)}
                className="rounded-full border border-azul/30 bg-azul/5 px-3 py-1 text-xs text-azul transition hover:bg-azul/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar(texto);
          }}
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={iaDisponible ? "Escribe tu pregunta…" : "El chat no está configurado en el servidor"}
            disabled={enviando || !iaDisponible}
            maxLength={1000}
            className="h-11 flex-1 rounded-md border border-gris-borde bg-white px-3 text-base text-navy outline-none focus:border-azul focus:ring-2 focus:ring-azul/20 disabled:bg-gris-fondo"
          />
          <button
            type="submit"
            disabled={enviando || !iaDisponible || texto.trim().length < 2}
            className="h-11 rounded-md bg-azul px-4 text-sm font-semibold text-white transition hover:bg-navy disabled:cursor-not-allowed disabled:opacity-60"
          >
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}

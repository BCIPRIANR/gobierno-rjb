import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { empresasDelUsuario, requerirRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { iaConfigurada } from "@/lib/ia/chat";
import { sugerirPreguntas } from "@/lib/ia/sugerencias";
import { periodoDeReporte } from "@/lib/periodos";
import { ChatCliente } from "@/components/chat/chat-cliente";

export const metadata: Metadata = { title: "Chat" };

export default async function PaginaChat() {
  const usuario = await requerirRol("founder", "admin", "gerente");
  const [empresas, supabase] = await Promise.all([empresasDelUsuario(), crearClienteServidor()]);

  // Contexto para las sugerencias: último mes con KPI y cuáles quedaron en N/D.
  const { data: ultimo } = await supabase.from("kpi_resultados").select("periodo").order("periodo", { ascending: false }).limit(1).maybeSingle();
  const ultimoPeriodo = ultimo?.periodo ?? null;
  let kpisNd: string[] = [];
  if (ultimoPeriodo) {
    const { data: nd } = await supabase
      .from("kpi_resultados")
      .select("kpi_codigo, kpi_definiciones(nombre)")
      .eq("periodo", ultimoPeriodo)
      .eq("estado", "nd")
      .limit(5);
    kpisNd = (nd ?? []).map((r) => r.kpi_definiciones?.nombre ?? r.kpi_codigo);
  }

  const sugerencias = sugerirPreguntas({ rol: usuario.rol, empresas, ultimoPeriodo, kpisNd, periodoReporte: periodoDeReporte() });
  const disponible = iaConfigurada();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold text-navy">Chat con IA</h2>
        <p className="mt-1 text-sm text-gris-texto">Responde solo con los KPI calculados de las empresas que puedes ver. Nunca estima: si falta un dato, dice N/D.</p>
      </div>

      {!disponible ? (
        <p role="status" className="rounded-md border border-azul/30 bg-azul/5 px-3 py-2 text-sm text-navy">
          El chat no está configurado en el servidor: falta la clave de Anthropic (ANTHROPIC_API_KEY). Las sugerencias se activarán cuando esté.
        </p>
      ) : null}

      <ChatCliente conversacionId={randomUUID()} sugerencias={sugerencias} iaDisponible={disponible} />
    </div>
  );
}

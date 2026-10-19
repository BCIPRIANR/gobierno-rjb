import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/tipos";
import { diasDesde } from "@/lib/periodos";
import { notificar, yaAvisado, type Destinatario, type ResumenEnvio } from "./enviar";
import { plantillaCargaAceptada, plantillaCargaRechazada, plantillaRecordatorio } from "./plantillas";

type Admin = SupabaseClient<Database>;

/** Días antes de la fecha límite a partir de los cuales se recuerda. */
const DIAS_ANTICIPACION = 3;

function urlApp(ruta: string): string {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${ruta}`;
}

async function perfilesConRol(admin: Admin, roles: ("founder" | "admin")[]): Promise<Destinatario[]> {
  const { data } = await admin
    .from("perfiles")
    .select("id, nombre, email, telefono_whatsapp")
    .in("rol", roles)
    .eq("activo", true);
  return data ?? [];
}

/**
 * Avisa el resultado de una carga ya procesada:
 * - aceptada → al contador que subió (correo + WhatsApp) y a founder/admin (WhatsApp + correo);
 * - rechazada → al contador que subió y a los admin.
 */
export async function avisarResultadoCarga(admin: Admin, cargaId: string): Promise<ResumenEnvio> {
  const total: ResumenEnvio = { enviados: 0, fallidos: 0, omitidos: 0 };
  const sumar = (r: ResumenEnvio) => {
    total.enviados += r.enviados;
    total.fallidos += r.fallidos;
    total.omitidos += r.omitidos;
  };

  const { data: carga } = await admin
    .from("cargas")
    .select("id, empresa_id, periodo, version, caracter, estado, nombre_archivo, motivo_rechazo, resultado_checks, subido_por, empresas(nombre, es_demo)")
    .eq("id", cargaId)
    .maybeSingle();
  if (!carga || !carga.empresas || (carga.estado !== "aceptada" && carga.estado !== "rechazada")) return total;

  const { data: contador } = await admin
    .from("perfiles")
    .select("id, nombre, email, telefono_whatsapp")
    .eq("id", carga.subido_por)
    .maybeSingle();

  const empresa = carga.empresas.nombre;
  const esDemo = carga.empresas.es_demo;

  if (carga.estado === "aceptada") {
    const { data: kpis } = await admin
      .from("kpi_resultados")
      .select("kpi_codigo, valor, estado")
      .eq("empresa_id", carga.empresa_id)
      .eq("periodo", carga.periodo)
      .in("kpi_codigo", ["ingresos", "excedente", "recaudo_total"]);
    const valor = (codigo: string) => {
      const k = (kpis ?? []).find((x) => x.kpi_codigo === codigo);
      return k && k.estado !== "nd" && k.valor !== null ? Number(k.valor) : null;
    };
    const avisos = Array.isArray(carga.resultado_checks)
      ? carga.resultado_checks.filter((c) => c && typeof c === "object" && !Array.isArray(c) && (c as { nivel?: unknown }).nivel === "aviso").length
      : 0;

    const mensaje = plantillaCargaAceptada({
      empresa,
      esDemo,
      periodo: carga.periodo,
      caracter: carga.caracter,
      version: carga.version,
      ingresos: valor("ingresos"),
      excedente: valor("excedente"),
      recaudoTotal: valor("recaudo_total"),
      avisos,
      url: urlApp(`/gestion?empresa=${encodeURIComponent(slugDe(empresa))}&mes=${carga.periodo.slice(0, 7)}`),
    });

    if (contador) sumar(await notificar(admin, { destinatario: contador, empresaId: carga.empresa_id, tipo: "carga_aceptada", mensaje, canales: ["email", "whatsapp"] }));
    for (const d of await perfilesConRol(admin, ["founder", "admin"])) {
      if (contador && d.id === contador.id) continue;
      sumar(await notificar(admin, { destinatario: d, empresaId: carga.empresa_id, tipo: "carga_aceptada", mensaje, canales: ["whatsapp", "email"] }));
    }
    return total;
  }

  const mensaje = plantillaCargaRechazada({
    empresa,
    esDemo,
    periodo: carga.periodo,
    nombreArchivo: carga.nombre_archivo,
    motivo: carga.motivo_rechazo ?? "No pasó los controles automáticos.",
    url: urlApp("/cargas"),
  });
  if (contador) sumar(await notificar(admin, { destinatario: contador, empresaId: carga.empresa_id, tipo: "carga_rechazada", mensaje, canales: ["email", "whatsapp"] }));
  for (const d of await perfilesConRol(admin, ["admin"])) {
    if (contador && d.id === contador.id) continue;
    sumar(await notificar(admin, { destinatario: d, empresaId: carga.empresa_id, tipo: "carga_rechazada", mensaje, canales: ["email"] }));
  }
  return total;
}

/** Slug aproximado para el enlace; la página acepta también el nombre si no coincide (usa la primera empresa). */
function slugDe(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export type ResumenRecordatorios = ResumenEnvio & { periodo: string; pendientes: number; atrasadas: number; sinContador: number };

/**
 * Recordatorios diarios a los contadores: cargas atrasadas (todos los días) y
 * pendientes que vencen en los próximos 3 días. No repite el mismo aviso en 20 h.
 */
export async function enviarRecordatorios(admin: Admin, periodo: string, hoy: Date = new Date()): Promise<ResumenRecordatorios> {
  const resumen: ResumenRecordatorios = { periodo, enviados: 0, fallidos: 0, omitidos: 0, pendientes: 0, atrasadas: 0, sinContador: 0 };

  const { data: filas, error } = await admin.rpc("semaforo_cargas", { p_periodo: periodo });
  if (error || !filas) {
    console.error("[recordatorios] no se pudo leer el semáforo", error?.code);
    return resumen;
  }

  const { data: tipos } = await admin.from("tipos_archivo").select("codigo, nombre");
  const nombreTipo = new Map((tipos ?? []).map((t) => [t.codigo, t.nombre]));

  // Contadores activos por empresa.
  const { data: asignaciones } = await admin
    .from("usuario_empresa")
    .select("empresa_id, perfiles!inner(id, nombre, email, telefono_whatsapp, rol, activo)")
    .eq("perfiles.rol", "contador")
    .eq("perfiles.activo", true);
  const contadoresPorEmpresa = new Map<string, Destinatario[]>();
  for (const a of asignaciones ?? []) {
    const p = a.perfiles;
    if (!p) continue;
    const lista = contadoresPorEmpresa.get(a.empresa_id) ?? [];
    lista.push({ id: p.id, nombre: p.nombre, email: p.email, telefono_whatsapp: p.telefono_whatsapp });
    contadoresPorEmpresa.set(a.empresa_id, lista);
  }

  for (const f of filas) {
    if (f.estado === "cargado") continue;
    const faltan = -diasDesde(f.fecha_limite, hoy);
    if (f.estado === "pendiente" && faltan > DIAS_ANTICIPACION) continue;
    if (f.estado === "atrasado") resumen.atrasadas++;
    else resumen.pendientes++;

    const contadores = contadoresPorEmpresa.get(f.empresa_id) ?? [];
    if (contadores.length === 0) {
      resumen.sinContador++;
      continue;
    }

    const mensaje = plantillaRecordatorio({
      empresa: f.es_demo ? `${f.empresa} [DATOS DE DEMOSTRACIÓN]` : f.empresa,
      nombreArchivo: nombreTipo.get(f.tipo_archivo) ?? f.tipo_archivo,
      periodo,
      fechaLimite: f.fecha_limite,
      diasAtraso: f.dias_atraso,
      url: urlApp("/cargas"),
    });

    for (const c of contadores) {
      if (await yaAvisado(admin, c.id, "recordatorio_carga", mensaje.asunto)) {
        resumen.omitidos++;
        continue;
      }
      const r = await notificar(admin, { destinatario: c, empresaId: f.empresa_id, tipo: "recordatorio_carga", mensaje, canales: ["whatsapp", "email"] });
      resumen.enviados += r.enviados;
      resumen.fallidos += r.fallidos;
      resumen.omitidos += r.omitidos;
    }
  }

  return resumen;
}

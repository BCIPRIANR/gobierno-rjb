import { NextResponse, type NextRequest } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { registrarAuditoria } from "@/lib/auditoria";
import { enviarRecordatorios } from "@/lib/notificaciones/eventos";
import { periodoDeReporte, periodoDesdeMes } from "@/lib/periodos";

/**
 * Recordatorios diarios de carga. Lo invoca Vercel Cron (ver vercel.json) con
 * `Authorization: Bearer ${CRON_SECRET}`. Acepta `?mes=YYYY-MM` para forzar un periodo.
 */
export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    return NextResponse.json({ error: "CRON_SECRET no está configurado en el servidor." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const periodo = periodoDesdeMes(request.nextUrl.searchParams.get("mes")) ?? periodoDeReporte();
  const admin = crearClienteAdmin();
  const resumen = await enviarRecordatorios(admin, periodo);

  await registrarAuditoria({
    usuarioId: null,
    accion: "enviar_recordatorios",
    entidad: "notificaciones",
    detalle: { ...resumen },
  });

  return NextResponse.json(resumen);
}

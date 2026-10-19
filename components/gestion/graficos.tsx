"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatearCOPMillones } from "@/lib/formato";

/** Punto mensual para los gráficos: `null` = N/D (no se dibuja, no es 0). */
export type PuntoMes = { mes: string; a: number | null; b: number | null };

const COLORES = {
  navy: "#0A2342",
  azul: "#0B5CAD",
  turquesa: "#179E8F",
  gris: "#9AA3AE",
  grisTexto: "#5B6573",
  rojo: "#C93A3A",
  borde: "#DFE3E8",
};

function ejeMillones(v: number): string {
  return `${Math.round(v / 1_000_000).toLocaleString("es-CO")}`;
}

function valorTooltip(v: unknown): string {
  return typeof v === "number" ? formatearCOPMillones(v) : "N/D";
}

const estiloTooltip = {
  contentStyle: { borderRadius: 6, border: `1px solid ${COLORES.borde}`, fontSize: 12 },
  labelStyle: { color: COLORES.grisTexto, fontWeight: 600 },
};

/** Dos series en barras agrupadas (p. ej. ingresos vs costos). */
export function GraficoBarrasPareadas({
  datos,
  etiquetaA,
  etiquetaB,
  colorA = COLORES.azul,
  colorB = COLORES.gris,
}: {
  datos: PuntoMes[];
  etiquetaA: string;
  etiquetaB: string;
  colorA?: string;
  colorB?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke={COLORES.borde} />
        <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} stroke={COLORES.grisTexto} />
        <YAxis tickFormatter={ejeMillones} tickLine={false} axisLine={false} fontSize={11} stroke={COLORES.grisTexto} width={48} />
        <Tooltip formatter={valorTooltip} {...estiloTooltip} cursor={{ fill: "#F3F5F8" }} />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="a" name={etiquetaA} fill={colorA} radius={[3, 3, 0, 0]} />
        <Bar dataKey="b" name={etiquetaB} fill={colorB} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Una serie en barras; las negativas van en rojo (deterioro). */
export function GraficoBarrasSigno({ datos, etiqueta }: { datos: PuntoMes[]; etiqueta: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={COLORES.borde} />
        <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} stroke={COLORES.grisTexto} />
        <YAxis tickFormatter={ejeMillones} tickLine={false} axisLine={false} fontSize={11} stroke={COLORES.grisTexto} width={48} />
        <Tooltip formatter={valorTooltip} {...estiloTooltip} cursor={{ fill: "#F3F5F8" }} />
        <ReferenceLine y={0} stroke={COLORES.grisTexto} />
        <Bar dataKey="a" name={etiqueta} radius={[3, 3, 0, 0]}>
          {datos.map((d) => (
            <Cell key={d.mes} fill={d.a !== null && d.a < 0 ? COLORES.rojo : COLORES.turquesa} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Una serie en línea (saldos, p. ej. cartera). */
export function GraficoLinea({ datos, etiqueta }: { datos: PuntoMes[]; etiqueta: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={COLORES.borde} />
        <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} stroke={COLORES.grisTexto} />
        <YAxis tickFormatter={ejeMillones} tickLine={false} axisLine={false} fontSize={11} stroke={COLORES.grisTexto} width={48} domain={["auto", "auto"]} />
        <Tooltip formatter={valorTooltip} {...estiloTooltip} />
        <Line type="monotone" dataKey="a" name={etiqueta} stroke={COLORES.navy} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Mini tendencia de 12 meses para una tarjeta KPI. */
export function MiniTendencia({ serie, mesActual }: { serie: (number | null)[]; mesActual: number }) {
  const datos = serie.map((v, i) => ({ i: i + 1, v }));
  const hayDatos = serie.some((v) => v !== null);
  if (!hayDatos) return <div className="h-9" aria-hidden />;
  return (
    <ResponsiveContainer width="100%" height={36}>
      <LineChart data={datos} margin={{ top: 4, right: 2, left: 2, bottom: 2 }}>
        <Line type="monotone" dataKey="v" stroke={COLORES.azul} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
        <ReferenceLine x={mesActual} stroke={COLORES.borde} />
      </LineChart>
    </ResponsiveContainer>
  );
}

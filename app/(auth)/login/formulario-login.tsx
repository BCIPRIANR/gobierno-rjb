"use client";

import { useActionState } from "react";
import { iniciarSesion, type EstadoLogin } from "./acciones";

const estadoInicial: EstadoLogin = { error: null };

export function FormularioLogin({ siguiente }: { siguiente?: string }) {
  const [estado, accion, enviando] = useActionState(iniciarSesion, estadoInicial);

  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      {siguiente ? <input type="hidden" name="siguiente" value={siguiente} /> : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-navy">Correo</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          className="h-11 rounded-md border border-gris-borde bg-white px-3 text-base text-navy outline-none focus:border-azul focus:ring-2 focus:ring-azul/20"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-navy">Contraseña</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 rounded-md border border-gris-borde bg-white px-3 text-base text-navy outline-none focus:border-azul focus:ring-2 focus:ring-azul/20"
        />
      </label>

      {estado.error ? (
        <p role="alert" className="rounded-md border border-rojo/30 bg-rojo/5 px-3 py-2 text-sm text-rojo">
          {estado.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enviando}
        className="mt-2 h-11 rounded-md bg-azul text-base font-semibold text-white transition hover:bg-navy disabled:cursor-wait disabled:opacity-70"
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

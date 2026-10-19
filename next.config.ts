import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Todas las pantallas dependen de la sesión del usuario (RLS), así que se
  // renderizan de forma dinámica. Cache Components exigiría envolver cada
  // lectura de sesión en <Suspense>; no aporta valor en este sistema.
  cacheComponents: false,
  // Los archivos .xlsx llegan por Server Action; el límite por defecto es 1 MB.
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

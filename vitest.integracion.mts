import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Pruebas de integración contra la base real (requieren .env.local y tests/fixtures/usuario-demo.txt). */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integracion/**/*.test.ts"],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
});

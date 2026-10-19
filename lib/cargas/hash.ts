import { createHash } from "node:crypto";

/** SHA-256 en hexadecimal del contenido del archivo. Se calcula antes de procesar. */
export function calcularSha256(contenido: Uint8Array): string {
  return createHash("sha256").update(contenido).digest("hex");
}

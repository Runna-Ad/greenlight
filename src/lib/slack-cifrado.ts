// Cifra y descifra el token de un espacio de Slack conectado con «Add to Slack».
// AES-256-GCM con la llave SLACK_TOKEN_KEY (32 bytes en base64, la pone Pedro en Vercel).
// La base sólo guarda "v1:<iv>:<tag>:<cifrado>": sin la llave, un respaldo o una lectura de
// la tabla no sirve para mandar mensajes a nombre de nadie. El team id va como dato
// autenticado (AAD): un cifrado copiado a la fila de OTRO espacio no se descifra.
// Puro (recibe la llave): se prueba en node sin servidor.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const TAG = 16;
const IV = 12;

/** ¿La llave sirve? (32 bytes en base64). */
export function llaveValida(llaveB64: string | null | undefined): boolean {
  return !!llaveB64 && Buffer.from(llaveB64.trim(), "base64").length === 32;
}

function llaveDe(llaveB64: string): Buffer {
  if (!llaveValida(llaveB64)) throw new Error("SLACK_TOKEN_KEY debe ser 32 bytes en base64 (openssl rand -base64 32).");
  return Buffer.from(llaveB64.trim(), "base64");
}

export function cifrarToken(token: string, llaveB64: string, teamId: string): string {
  const iv = randomBytes(IV);
  const c = createCipheriv("aes-256-gcm", llaveDe(llaveB64), iv, { authTagLength: TAG });
  c.setAAD(Buffer.from(teamId, "utf8"));
  const cifrado = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), cifrado.toString("base64")].join(":");
}

/** null si el texto no es de este formato, la llave es otra, el espacio es otro o alguien lo alteró. */
export function descifrarToken(guardado: string, llaveB64: string, teamId: string): string | null {
  const [v, ivB64, tagB64, cifrado] = guardado.split(":");
  if (v !== "v1" || !ivB64 || !tagB64 || !cifrado) return null;
  try {
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    if (iv.length !== IV || tag.length !== TAG) return null;
    const d = createDecipheriv("aes-256-gcm", llaveDe(llaveB64), iv, { authTagLength: TAG });
    d.setAAD(Buffer.from(teamId, "utf8"));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(Buffer.from(cifrado, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

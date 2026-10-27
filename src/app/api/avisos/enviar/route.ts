import { timingSafeEqual } from "node:crypto";
import { dispatchPendingEmails } from "@/lib/notif-email";

// Un drenado manda correo por correo; que Vercel no lo corte a la mitad (lo cortado quedaría
// en 'sending' y se reenviaría a los 15 min). Igual que las otras rutas largas.
export const maxDuration = 60;

/**
 * Lo llama el reloj de 0084 (pg_cron, cada minuto) cuando a algún correo le llegó su turno:
 * manda lo que esperaba por la ventana de agrupado. Sin sesión (es la base quien llama):
 * se protege con un secreto compartido. `CRON_SECRET` en Vercel = 'greenlight_cron_secret'
 * en Vault. Sin el secreto configurado, nadie entra.
 */
function autorizado(req: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const dado = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${secreto}`);
  return dado.length === esperado.length && timingSafeEqual(dado, esperado);
}

export async function POST(req: Request) {
  if (!autorizado(req)) return new Response("No autorizado", { status: 401 });
  const r = await dispatchPendingEmails();
  return Response.json(r);
}

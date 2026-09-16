import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { prismaActivo } from "@/lib/prisma/flags";
import { correrVigia } from "@/lib/prisma/vigia-run";

/**
 * F6b — el cron semanal del vigía (vercel.json). Vercel llama con `Authorization: Bearer <CRON_SECRET>`; sin
 * secreto configurado la ruta no hace nada (503). Es la única ruta sin sesión que toca el vigía (el proxy la
 * deja pasar SÓLO a ella) y no devuelve contenido de las fuentes, sólo el resumen. Los crons de Vercel corren
 * en PRODUCCIÓN: mientras Prisma viva en preview, la revisión es el botón "Revisar ahora" del Hub.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function autorizado(req: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  const dado = req.headers.get("authorization") ?? "";
  if (!secreto || secreto.length < 16) return false;
  const a = Buffer.from(dado);
  const b = Buffer.from(`Bearer ${secreto}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) return Response.json({ ok: false, error: "no configurado" }, { status: 503 });
  if (!autorizado(req)) return Response.json({ ok: false }, { status: 401 });
  if (!prismaActivo() || !hasSupabase()) return Response.json({ ok: false, error: "prisma apagado" }, { status: 404 });
  // Mismo candado que "Revisar ahora" (sin pausa mínima: el cron es semanal).
  const r = await correrVigia(supabaseAdmin(), 0, { maxLlamadas: 12 });
  if (!r.ok) return Response.json({ ok: false, error: r.error }, { status: 409 });
  const { resumen } = r;
  console.info(`[prisma/vigia] cron: ${JSON.stringify({ ...resumen, errores: resumen.errores.length })}`);
  return Response.json({ ok: true, resumen: { ...resumen, errores: resumen.errores.map((e) => e.nombre) } });
}

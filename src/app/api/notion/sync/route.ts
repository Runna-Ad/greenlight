import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { hasNotion } from "@/lib/notion-legales";
import { sincronizarNotion } from "@/lib/notion-sync";

/**
 * El reloj de Notion (supabase/manual/0094_reloj_notion.sql): cada hora la base llama aquí
 * con `Authorization: Bearer <CRON_SECRET>` — el MISMO secreto del reloj de correos — y se
 * bajan los legales y las páginas de marca. Sin sesión (el proxy la deja pasar); sin secreto
 * configurado no hace nada. Devuelve sólo conteos, nunca el contenido.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function autorizado(req: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  const dado = req.headers.get("authorization") ?? "";
  if (!secreto || secreto.length < 16) return false;
  const a = Buffer.from(dado);
  const b = Buffer.from(`Bearer ${secreto}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function correr(req: Request) {
  if (!process.env.CRON_SECRET) return Response.json({ ok: false, error: "no configurado" }, { status: 503 });
  if (!autorizado(req)) return Response.json({ ok: false }, { status: 401 });
  if (!hasSupabase() || !hasNotion()) return Response.json({ ok: false, error: "sin base o sin Notion" }, { status: 503 });
  const r = await sincronizarNotion(supabaseAdmin());
  if (!r.ok) {
    console.error(`[notion/sync] ${r.error}`);
    return Response.json({ ok: false, error: r.error }, { status: 502 });
  }
  const resumen = { nuevos: r.nuevos, actualizados: r.actualizados, desactivados: r.desactivados, paginas: r.paginas, errores: r.paginasConError.length + r.sinMarca.length };
  if (resumen.errores) console.error(`[notion/sync] avisos: ${[...r.sinMarca, ...r.paginasConError].join(" | ")}`);
  console.info(`[notion/sync] ${JSON.stringify(resumen)}`);
  return Response.json({ ok: true, resumen });
}

export const GET = correr;
export const POST = correr;

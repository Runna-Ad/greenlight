import { supabaseAdmin } from "@/lib/supabase-admin";
import { insertarConCliente, leerEvento } from "@/lib/prisma/formatos/actividad";
import { gate, saturado } from "@/app/(app)/prisma/comun";
import { mismoOrigen } from "@/app/(app)/prisma/formatos-comun";

/**
 * HÜE Prisma › Formatos — anota en `prisma_actividad` (0091) lo que pasa en el navegador y nada más registra: PSD abierto,
 * descargas, ediciones, errores, trabajo recuperado o borrado.
 *
 * POST JSON { accion, archivo?, cliente?, detalle? } → { ok: true } | { ok: false, error }
 * La persona sale de la sesión, NUNCA del cuerpo. Un fallo aquí jamás le estorba a quien trabaja: el navegador ni lo mira.
 */
export const dynamic = "force-dynamic";

/** Eventos por persona cada 10 min: uso normal muy por debajo; lo de arriba es un loop. */
const EVENTOS_MAX = 200;
const CUERPO_MAX_BYTES = 4096;

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(req: Request) {
  if (!mismoOrigen(req)) return json({ ok: false, error: "Origen no permitido." }, 403);
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) return json({ ok: false, error: "Formato inválido." }, 415);
  const g = await gate();
  if ("ok" in g) return json(g, /sesión/i.test(g.error) ? 401 : 403);
  if (saturado(g.soyId, Date.now(), "formatos-actividad", EVENTOS_MAX)) return json({ ok: false, error: "Demasiados eventos." }, 429);
  if (Number(req.headers.get("content-length")) > CUERPO_MAX_BYTES) return json({ ok: false, error: "Evento demasiado grande." }, 413);

  let cuerpo: unknown;
  try {
    const texto = await req.text();
    if (texto.length > CUERPO_MAX_BYTES) return json({ ok: false, error: "Evento demasiado grande." }, 413);
    cuerpo = JSON.parse(texto);
  } catch {
    return json({ ok: false, error: "Formato inválido." }, 400);
  }
  const evento = leerEvento(cuerpo);
  if (!evento) return json({ ok: false, error: "Acción no válida." }, 400);

  try {
    const db = supabaseAdmin();
    const { error } = await insertarConCliente((fila) => db.from("prisma_actividad").insert(fila), { ...evento, member_id: g.soyId });
    if (error) {
      console.error("[formatos] anotar actividad:", error.message);
      return json({ ok: false, error: "No se pudo anotar." }, 500);
    }
  } catch (err) {
    console.error("[formatos] anotar actividad:", err);
    return json({ ok: false, error: "No se pudo anotar." }, 500);
  }
  return json({ ok: true });
}

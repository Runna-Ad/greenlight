import { supabaseAdmin } from "@/lib/supabase-admin";
import { prismaFormatosActivo } from "@/lib/prisma/flags";
import { ErrorConCosto, componer } from "@/lib/prisma/formatos/componer";
import { ErrorIA, expandidor } from "@/lib/prisma/formatos/proveedor";
import type { PrismaFormatosSalidaRow } from "@/lib/database.types";
import { gate, saturado, FRENO, UUID } from "@/app/(app)/prisma/comun";
import { BUCKET_FORMATOS, PROCESANDO_MUERTO_MS, bajarFuente, firmarFormatos, loteConPermiso, salidaVista } from "@/app/(app)/prisma/formatos-comun";

/**
 * HÜE Prisma › Formatos — procesa UN tamaño: escalar, rellenar, pegar duro el original, verificar, subir PNG
 * + JPG. Es una RUTA y no una server action porque Next manda las acciones de una en una por cliente; la
 * pantalla llama a esta ruta 4 a la vez. Mismo gate, mismo "¿puedo tocarlo?" y mismo freno que las acciones
 * (vienen de comun.ts / formatos-comun.ts: una sola implementación).
 *
 * POST { salidaId } → { ok: true, salida } | { ok: false, error, enCurso? }
 */
export const dynamic = "force-dynamic";
/** La IA tiene 150 s de tope; armar y subir, segundos. Abajo de PROCESANDO_MUERTO_MS (4 min) a propósito. */
export const maxDuration = 210;

/** Tamaños por persona cada 10 min (TODOS los modos: desenfoque y color también gastan CPU y memoria). */
const TAMANOS_MAX = 150;

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Las rutas no traen el chequeo de origen de las server actions: sólo se acepta la propia página. */
function mismoOrigen(req: Request): boolean {
  const origen = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origen || !host) return false;
  try {
    return new URL(origen).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!mismoOrigen(req)) return json({ ok: false, error: "Origen no permitido." }, 403);
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) return json({ ok: false, error: "Formato inválido." }, 415);
  if (!prismaFormatosActivo()) return json({ ok: false, error: "Formatos todavía no está activo." }, 404);
  const g = await gate();
  if ("ok" in g) return json(g, /sesión/i.test(g.error) ? 401 : 403);
  if (saturado(g.soyId, Date.now(), "formatos-tamano", TAMANOS_MAX)) return json({ ok: false, error: "Muchos tamaños en poco tiempo. Espera unos minutos." }, 429);

  let salidaId: unknown;
  try {
    salidaId = ((await req.json()) as { salidaId?: unknown })?.salidaId;
  } catch {
    return json({ ok: false, error: "Formato inválido." }, 400);
  }
  if (typeof salidaId !== "string" || !UUID.test(salidaId)) return json({ ok: false, error: "Ese tamaño ya no existe." }, 404);

  const db = supabaseAdmin();
  // Esta lectura sólo sirve para el permiso y para frenar temprano; lo que se PROCESA sale del reclamo de abajo.
  const { data: leida, error: errSalida } = await db.from("prisma_formatos_salidas").select("lote_id, modo, intentos").eq("id", salidaId).maybeSingle<Pick<PrismaFormatosSalidaRow, "lote_id" | "modo" | "intentos">>();
  if (errSalida) {
    console.error("[formatos] select salida:", errSalida.message);
    return json({ ok: false, error: "No se pudo leer ese tamaño. Reintenta." }, 500);
  }
  if (!leida) return json({ ok: false, error: "Ese tamaño ya no existe." }, 404);
  const lote = await loteConPermiso(db, leida.lote_id, g);
  if ("ok" in lote) return json(lote, 403);
  if (leida.modo === "ia" && !expandidor()) return json({ ok: false, error: "El relleno con IA está apagado. Usa desenfoque o color." }, 409);

  // Reclamo ATÓMICO: si dos clics (o dos pestañas) llegan juntos, sólo uno procesa. Devuelve la fila TAL COMO quedó
  // al reclamarla: si otra pestaña cambió el relleno entre la lectura y el reclamo, se procesa (y se cobra) lo actual.
  const muerto = new Date(Date.now() - PROCESANDO_MUERTO_MS).toISOString();
  const { data: salida, error: errReclamo } = await db
    .from("prisma_formatos_salidas")
    .update({ estado: "procesando", error: null, intentos: Math.min(50, leida.intentos + 1), updated_at: new Date().toISOString() })
    .eq("id", salidaId)
    .or(`estado.in.(pendiente,error),and(estado.eq.procesando,updated_at.lt."${muerto}")`)
    .select("*")
    .maybeSingle<PrismaFormatosSalidaRow>();
  if (errReclamo) {
    console.error("[formatos] reclamo:", errReclamo.message);
    return json({ ok: false, error: "No se pudo empezar este tamaño. Reintenta." }, 500);
  }
  if (!salida) return json({ ok: false, error: "Ese tamaño ya se está armando.", enCurso: true }, 409);

  const costoPrevio = salida.costo_real_usd === null ? 0 : Number(salida.costo_real_usd);
  /** Lo gastado se SUMA al costo real del tamaño aunque algo falle después de la IA (si no, se perdería). */
  const marcarError = async (mensaje: string, gastado: number | null = null) => {
    const { error } = await db
      .from("prisma_formatos_salidas")
      .update({ estado: "error", error: mensaje.slice(0, 300), updated_at: new Date().toISOString(), ...(gastado ? { costo_real_usd: Math.round((costoPrevio + gastado) * 10_000) / 10_000 } : {}) })
      .eq("id", salida.id);
    if (error) console.error("[formatos] marcar error:", error.message);
    return json({ ok: false, error: mensaje }, 200);
  };

  // Los frenos de la IA se revisan sobre la fila RECLAMADA (su modo es el que se va a cobrar).
  const prov = salida.modo === "ia" ? expandidor() : null;
  if (salida.modo === "ia" && !prov) return await marcarError("El relleno con IA está apagado. Usa desenfoque o color.");
  // Lo que se cobra comparte además el freno de Prisma (40 llamadas / 10 min por persona).
  if (salida.modo === "ia" && saturado(g.soyId)) {
    await marcarError(FRENO.error);
    return json(FRENO, 429);
  }

  let gastado: number | null = null;
  try {
    const r = await bajarFuente(db, lote.fuente_path);
    if ("ok" in r) return await marcarError(r.error);
    const c = await componer(r.fuente, salida.ancho, salida.alto, salida.modo, { color: salida.color ?? undefined, expandir: prov?.expandir });
    gastado = c.costoUsd;
    if (salida.modo === "ia" && c.costoUsd === null) console.warn(`[formatos] ${salida.id}: la IA no reportó uso; costo real sin sumar`);
    // Nunca se entrega un tamaño cuyo original no quedó idéntico (no debería pasar: es la garantía del pegado).
    if (!c.pixelLockOk) {
      console.error(`[formatos] pixel-lock FALLÓ en ${salida.id} (${salida.preset}, ${salida.modo})`);
      return await marcarError("El original no quedó idéntico; este tamaño no se entrega. Avísale a Pedro.", gastado);
    }
    const id = crypto.randomUUID();
    const png = `salida/${lote.id}/${id}.png`;
    const jpg = `salida/${lote.id}/${id}.jpg`;
    const bucket = db.storage.from(BUCKET_FORMATOS);
    const [upPng, upJpg] = await Promise.all([
      bucket.upload(png, c.png, { contentType: "image/png", upsert: false }),
      bucket.upload(jpg, c.jpg, { contentType: "image/jpeg", upsert: false }),
    ]);
    if (upPng.error || upJpg.error) {
      console.error("[formatos] upload:", upPng.error?.message ?? upJpg.error?.message);
      await bucket.remove([png, jpg]);
      return await marcarError("No se pudo guardar este tamaño. Reintenta.", gastado);
    }
    const { data: lista, error } = await db
      .from("prisma_formatos_salidas")
      .update({
        estado: "listo",
        png_path: png,
        jpg_path: jpg,
        pixel_lock_ok: true,
        deriva: c.deriva,
        proveedor: c.modelo,
        // Costo real ACUMULADO del tamaño (rehacer suma). Desenfoque y color son locales: no suman nada.
        costo_real_usd: Math.round((costoPrevio + (gastado ?? 0)) * 10_000) / 10_000,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", salida.id)
      .select("*")
      .single<PrismaFormatosSalidaRow>();
    if (error || !lista) {
      console.error("[formatos] update listo:", error?.message);
      await bucket.remove([png, jpg]);
      return await marcarError("No se pudo guardar este tamaño. Reintenta.", gastado);
    }
    // Los archivos de una corrida anterior de este tamaño ya no los apunta nadie (en paralelo con la firma).
    const viejos = [salida.png_path, salida.jpg_path].filter((p): p is string => !!p);
    const [urls] = await Promise.all([
      firmarFormatos(db, [png, jpg]),
      viejos.length ? bucket.remove(viejos).then(({ error: e }) => e && console.error("[formatos] remove viejos:", e.message)) : null,
    ]);
    return json({ ok: true, salida: salidaVista(lista, urls) });
  } catch (e) {
    const costo = e instanceof ErrorConCosto ? e.costoUsd : gastado;
    const causa = e instanceof ErrorConCosto ? e.causa : e;
    if (causa instanceof ErrorIA) {
      console.error(`[formatos] IA (${salida.preset}):`, causa.message);
      return await marcarError(causa.mensaje, costo);
    }
    console.error(`[formatos] ${salida.preset}:`, causa instanceof Error ? causa.message : causa);
    return await marcarError("No se pudo armar este tamaño. Reintenta.", costo);
  }
}

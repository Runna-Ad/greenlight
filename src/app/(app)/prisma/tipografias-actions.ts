"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  ARCHIVOS_ENTREGADOS_MAX,
  TIPOGRAFIAS_BUCKET,
  elegirParaCliente,
  exclusivasDeOtros,
  faltaTablaTipografias,
  nombresPedidos,
  rutaTipografia,
} from "@/lib/prisma/formatos/tipografias";
import { buscarEnGoogle, type DeGoogle } from "@/lib/prisma/formatos/google-fonts";
import { gate, saturado, UUID, type Fail } from "./comun";

/**
 * HÜE Prisma › Formatos — las tipografías que un PSD necesita, de la biblioteca de Greenlight.
 * Se piden por nombre PostScript (el PSD dice cuál usa cada texto); vuelven enlaces firmados al bucket privado.
 *   1. Las guardadas (Admin › Marcas): todas, menos las EXCLUSIVAS de un cliente que no es el elegido arriba en
 *      Formatos ("Sin cliente" = ninguna exclusiva).
 *   2. Lo que siga faltando se busca en Google Fonts; lo que aparece se guarda en la biblioteca (de nadie, para
 *      todos) y se entrega igual.
 *   3. Lo que aún falte pero sea exclusivo de otro cliente se dice ("es de DiDi"), para que se elija ese cliente.
 * Candado: el `gate()` de Prisma (rol con acceso, sesión Y ficha de equipo).
 */
/** El navegador la baja en el acto: un enlace que sirve 1 minuto no se puede pasar a nadie después. */
const FIRMA_SEG = 60;
/** Más filas que esto no es un catálogo de tipografías: se leen las primeras (las más antiguas). */
const FILAS_MAX = 2000;
const FALLO = "No se pudieron traer las tipografías de Greenlight.";
/** Búsquedas en Google por persona en la ventana del freno (cada una baja archivos y guarda filas). */
const GOOGLE_POR_PERSONA = 20;
/** Plazo de la búsqueda en Google: el navegador espera 20 s por todo el pedido (GREENLIGHT_MS). */
const GOOGLE_MS = 12_000;
/** Tipografías de Google en la biblioteca: con más, no se traen nuevas (un admin las borra en Marcas). */
const GOOGLE_FILAS_MAX = 300;

/** `ext` sale de la ruta (de leer sus bytes al guardarla), no del nombre que traía el archivo. `exclusivaDe` = el
 *  id del cliente si es sólo suya (el navegador la suelta si se cambia de cliente). */
export type TipografiaEnlace = { archivo: string; ext: "otf" | "ttf"; cliente: string; url: string; nombres: string[]; exclusivaDe: string | null };
export type TipografiasDelPsd = { ok: true; tipografias: TipografiaEnlace[]; ajenas: { cliente: string; nombres: string[] }[] };

type Fila = { archivo: string; ruta: string; nombres: string[]; client_id: string | null; exclusiva: boolean; clients: { name: string } | null };
type Entregar = { archivo: string; ruta: string; nombres: string[]; cliente: string; exclusivaDe: string | null };
const GOOGLE = "Google Fonts";

export async function tipografiasDelPsd(raw: unknown, clienteRaw: unknown): Promise<TipografiasDelPsd | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  const pedidos = nombresPedidos(raw);
  if (!pedidos.length) return { ok: true, tipografias: [], ajenas: [] };
  const clienteId = typeof clienteRaw === "string" && UUID.test(clienteRaw) ? clienteRaw : null;
  const db = supabaseAdmin();
  // Se lee el catálogo y se cruza aquí (no un filtro armado con lo que manda el navegador). En orden de alta: si
  // dos archivos traen el mismo nombre, gana siempre el mismo.
  const { data, error } = await db
    .from("tipografias")
    .select("archivo, ruta, nombres, client_id, exclusiva, clients(name)")
    .order("created_at")
    .limit(FILAS_MAX);
  if (error) {
    // Antes de la 0079 la tabla no existe: es como no tener ninguna guardada (la pantalla dice qué falta y se
    // pueden soltar). Tampoco se busca en Google: no habría dónde guardarla. Cualquier otro error sí se dice.
    if (faltaTablaTipografias(error)) return { ok: true, tipografias: [], ajenas: [] };
    console.error("[prisma] leer tipografias:", error.message);
    return { ok: false, error: FALLO };
  }
  const filas = ((data ?? []) as unknown as Fila[]).map((f) => ({ ...f, cliente: f.clients?.name ?? GOOGLE }));
  const { elegidas, faltan } = elegirParaCliente(filas, pedidos, clienteId);
  const entregar: Entregar[] = elegidas.map((e) => ({ archivo: e.archivo, ruta: e.ruta, nombres: e.nombres, cliente: e.cliente, exclusivaDe: e.exclusiva ? e.client_id : null }));

  let siguenFaltando = faltan;
  // Google sólo con freno por persona (cada búsqueda baja archivos y guarda filas) y con lugar en la biblioteca.
  if (faltan.length && !saturado(g.soyId, Date.now(), "tipografias-google", GOOGLE_POR_PERSONA) && (await caben(db))) {
    const deGoogle = (await buscarEnGoogle(faltan, AbortSignal.timeout(GOOGLE_MS))).slice(0, ARCHIVOS_ENTREGADOS_MAX - entregar.length);
    // A la vez: el índice único de la base ya resuelve dos guardados del mismo archivo.
    const guardadas = await Promise.all(deGoogle.map((x) => guardarDeGoogle(db, x, g.soyId)));
    deGoogle.forEach((x, i) => {
      const ruta = guardadas[i];
      if (ruta) entregar.push({ archivo: x.archivo, ruta, nombres: x.leida.nombres, cliente: GOOGLE, exclusivaDe: null });
    });
    const cubiertos = new Set(entregar.flatMap((e) => e.nombres));
    siguenFaltando = faltan.filter((n) => !cubiertos.has(n));
  }
  const ajenas = exclusivasDeOtros(filas, siguenFaltando, clienteId);
  if (!entregar.length) return { ok: true, tipografias: [], ajenas };

  const firmadas = await db.storage.from(TIPOGRAFIAS_BUCKET).createSignedUrls(entregar.map((e) => e.ruta), FIRMA_SEG);
  if (firmadas.error) {
    console.error("[prisma] firmar tipografías:", firmadas.error.message);
    return { ok: false, error: FALLO };
  }
  // Un archivo que ya no está en el bucket no se firma: queda fuera (la pantalla lo sigue contando como faltante).
  const enlacePorRuta = new Map(firmadas.data.filter((f) => !f.error && f.signedUrl).map((f) => [f.path, f.signedUrl]));
  const tipografias: TipografiaEnlace[] = [];
  for (const e of entregar) {
    const url = enlacePorRuta.get(e.ruta);
    if (url) tipografias.push({ archivo: e.archivo, ext: e.ruta.endsWith(".otf") ? "otf" : "ttf", cliente: e.cliente, url, nombres: e.nombres, exclusivaDe: e.exclusivaDe });
  }
  return { ok: true, tipografias, ajenas };
}

/** ¿Cabe otra de Google en la biblioteca? Si la cuenta falla, no (nada de pasar el tope por un error). */
async function caben(db: ReturnType<typeof supabaseAdmin>): Promise<boolean> {
  const { count, error } = await db.from("tipografias").select("id", { count: "exact", head: true }).is("client_id", null);
  if (error || count === null) {
    console.error("[prisma] contar tipografías de Google:", error?.message ?? "sin cuenta");
    return false;
  }
  if (count >= GOOGLE_FILAS_MAX) console.error(`[prisma] la biblioteca ya tiene ${count} tipografías de Google: no se traen más (bórralas en Admin › Marcas)`);
  return count < GOOGLE_FILAS_MAX;
}

/**
 * Guarda en la biblioteca una tipografía traída de Google (de nadie, para todos) y devuelve su ruta en el bucket.
 * Si ya estaba (otro PSD la trajo a la vez), usa la que hay. null = no se pudo guardar (se dice en el registro y
 * el PSD la sigue contando como faltante).
 */
async function guardarDeGoogle(db: ReturnType<typeof supabaseAdmin>, x: DeGoogle, soyId: string): Promise<string | null> {
  const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", x.datos))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const yaEsta = async () => (await db.from("tipografias").select("ruta").is("client_id", null).eq("sha256", sha256).maybeSingle()).data?.ruta as string | undefined;
  const antes = await yaEsta();
  if (antes) return antes;
  const ruta = rutaTipografia("google", sha256, x.leida.ext);
  // upsert: si quedó un archivo de un intento anterior sin su fila, es el MISMO (misma huella): se reemplaza.
  const up = await db.storage.from(TIPOGRAFIAS_BUCKET).upload(ruta, x.datos, { contentType: `font/${x.leida.ext}`, upsert: true });
  if (up.error) {
    console.error("[prisma] guardar tipografía de Google:", x.archivo, up.error.message);
    return null;
  }
  const ins = await db
    .from("tipografias")
    .insert({ client_id: null, origen: "google", exclusiva: false, archivo: x.archivo, ruta, sha256, bytes: x.datos.byteLength, nombres: x.leida.nombres, created_by: soyId });
  if (!ins.error) return ruta;
  // Dos PSD la trajeron a la vez: la otra fila ganó y apunta al mismo archivo.
  const otra = await yaEsta();
  if (otra) return otra;
  console.error("[prisma] guardar fila de tipografía de Google:", x.archivo, ins.error.message);
  // Sin fila nadie lo ve ni lo borra desde Admin: el archivo no se queda.
  await db.storage.from(TIPOGRAFIAS_BUCKET).remove([ruta]);
  return null;
}

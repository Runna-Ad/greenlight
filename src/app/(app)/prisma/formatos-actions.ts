"use server";

import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sniffImageMime } from "@/lib/referencia";
import { prismaFormatosActivo } from "@/lib/prisma/flags";
import { FUENTE_MAX_BYTES, FUENTE_MAX_PX, HEX, lienzoIA, presetDe, type Modo } from "@/lib/prisma/formatos/geometria";
import { leerFuente } from "@/lib/prisma/formatos/componer";
import { iaActiva } from "@/lib/prisma/formatos/proveedor";
import type { LoteVista, SalidaVista } from "@/lib/prisma/formatos/vista";
import type { PrismaFormatosLoteRow, PrismaFormatosSalidaRow } from "@/lib/database.types";
import { BUCKET } from "@/lib/prisma/data";
import { gate, fallo, puedeTocar, saturado, s0, UUID, faltaMigracion, type Fail, type Sesion } from "./comun";
import { BUCKET_FORMATOS, MIGRACION_FORMATOS, MIME_A_EXT, PROCESANDO_MUERTO_MS, bajarFuente, firmarFormatos, loteConPermiso, loteVista, salidaVista, type MimeFuente } from "./formatos-comun";

/**
 * HÜE Prisma › Formatos — server actions. El anuncio NUNCA viaja en el cuerpo de una acción (Vercel corta
 * a 4.5 MB): `crearLote` da una URL firmada de SUBIDA y el navegador sube directo al bucket privado;
 * `confirmarLote` lo baja, lo valida por bytes y lo mide. Cada tamaño se procesa en la ruta
 * /api/prisma/formatos/tamano (las acciones van de una en una por cliente; la ruta deja ir 4 a la vez).
 */

const MAX_TAMANOS = 20;
const NOMBRE_MAX = 80;
/** Subidas (y copias desde un resultado) por persona cada 10 min. */
const SUBIDAS_MAX = 30;
/** Lecturas pesadas (bajar y decodificar hasta 25 MB) por persona cada 10 min. */
const LECTURAS_MAX = 60;

async function gateFormatos(): Promise<Sesion | Fail> {
  if (!prismaFormatosActivo()) return { ok: false, error: "Formatos todavía no está activo." };
  return gate();
}

const MUCHAS_SUBIDAS: Fail = { ok: false, error: "Muchas subidas en poco tiempo. Espera unos minutos." };
const leeDemasiado = (soyId: string) => saturado(soyId, Date.now(), "formatos-leer", LECTURAS_MAX);

export type ResultadoCrear = { ok: true; loteId: string; path: string; token: string };

/** Paso 1: reservar el lote y la URL firmada para subir el anuncio (sólo esa ruta, una vez: sin sobrescribir). */
export async function crearLote(input: { nombre?: unknown; ext?: unknown; marcaId?: unknown }): Promise<ResultadoCrear | Fail> {
  const g = await gateFormatos();
  if ("ok" in g) return g;
  if (saturado(g.soyId, Date.now(), "formatos-subida", SUBIDAS_MAX)) return MUCHAS_SUBIDAS;
  const ext = Object.values(MIME_A_EXT).find((e) => e === input.ext);
  if (!ext) return { ok: false, error: "Sólo PNG, JPG o WebP." };
  const nombre = s0(input.nombre, NOMBRE_MAX) || "anuncio";
  const db = supabaseAdmin();
  let marcaId: string | null = null;
  let clientId: string | null = null;
  if (typeof input.marcaId === "string" && UUID.test(input.marcaId)) {
    const { data } = await db.from("marcas").select("id, client_id").eq("id", input.marcaId).maybeSingle<{ id: string; client_id: string }>();
    if (data) {
      marcaId = data.id;
      clientId = data.client_id;
    }
  }
  const path = `fuente/${crypto.randomUUID()}.${ext}`;
  const { data: firma, error: errFirma } = await db.storage.from(BUCKET_FORMATOS).createSignedUploadUrl(path, { upsert: false });
  if (errFirma || !firma) return fallo("formatos.createSignedUploadUrl", errFirma?.message);
  const { data: lote, error } = await db
    .from("prisma_formatos_lotes")
    .insert({ fuente_path: path, nombre, marca_id: marcaId, client_id: clientId, created_by: g.soyId })
    .select("id")
    .single<{ id: string }>();
  if (error || !lote) return faltaMigracion(error, MIGRACION_FORMATOS) ?? fallo("prisma_formatos_lotes.insert", error?.message);
  return { ok: true, loteId: lote.id, path: firma.path, token: firma.token };
}

/** Paso 2: el navegador ya subió. Se baja, se valida por bytes (tipo = extensión reservada) y se mide. Si el
 *  ARCHIVO no sirve (y el lote aún no estaba listo), se borran archivo y lote; un error de red no borra nada. */
export async function confirmarLote(loteId: string): Promise<({ ok: true } & LoteVista) | Fail> {
  const g = await gateFormatos();
  if ("ok" in g) return g;
  if (leeDemasiado(g.soyId)) return MUCHAS_SUBIDAS;
  const db = supabaseAdmin();
  const lote = await loteConPermiso(db, loteId, g);
  if ("ok" in lote) return lote;
  const r = await bajarFuente(db, lote.fuente_path);
  const extReservada = lote.fuente_path.split(".").pop();
  const fallaArchivo = "ok" in r ? r.invalida : MIME_A_EXT[r.mime] !== extReservada;
  if ("ok" in r || fallaArchivo) {
    if (fallaArchivo && lote.estado === "subiendo") {
      await db.storage.from(BUCKET_FORMATOS).remove([lote.fuente_path]);
      await db.from("prisma_formatos_lotes").delete().eq("id", lote.id);
    }
    return "ok" in r ? { ok: false, error: r.error } : { ok: false, error: "El archivo no es lo que dice ser. Sube un PNG, JPG o WebP." };
  }
  if (lote.estado !== "listo") {
    const { error } = await db.from("prisma_formatos_lotes").update({ estado: "listo", fuente_mime: r.mime, fuente_w: r.fuente.w, fuente_h: r.fuente.h }).eq("id", lote.id);
    if (error) return fallo("prisma_formatos_lotes.update", error.message);
  }
  const urls = await firmarFormatos(db, [lote.fuente_path]);
  return { ok: true, ...(await loteVista(lote, urls.get(lote.fuente_path) ?? "", r.fuente)) };
}

/** "Adaptar formatos" desde "¿Cómo salió?": la imagen de un resultado se COPIA al bucket de Formatos (los buckets
 *  no se mezclan) y nace un lote listo. Mismo permiso que el resultado. Idempotente: volver a abrir el enlace
 *  reusa el lote que ya existe (no copia otra vez). */
export async function loteDesdeResultado(resultadoId: string): Promise<({ ok: true } & LoteVista) | Fail> {
  const g = await gateFormatos();
  if ("ok" in g) return g;
  if (typeof resultadoId !== "string" || !UUID.test(resultadoId)) return { ok: false, error: "Ese resultado ya no existe." };
  const db = supabaseAdmin();
  type Fila = { id: string; storage_path: string; client_id: string | null; created_by: string | null };
  const { data: res } = await db.from("prisma_resultados").select("id, storage_path, client_id, created_by").eq("id", resultadoId).maybeSingle<Fila>();
  if (!res) return { ok: false, error: "Ese resultado ya no existe." };
  if (!puedeTocar(res, g)) return { ok: false, error: "Ese resultado lo subió otra persona." };
  if (leeDemasiado(g.soyId)) return MUCHAS_SUBIDAS;

  // ¿Ya hay un lote de este resultado para esta persona? Se reusa (un índice único lo garantiza en la base).
  const reusar = async (): Promise<({ ok: true } & LoteVista) | Fail | null> => {
    const { data: previo, error } = await db
      .from("prisma_formatos_lotes")
      .select("*")
      .eq("resultado_id", res.id)
      .eq("created_by", g.soyId)
      .maybeSingle<PrismaFormatosLoteRow>();
    if (error) return faltaMigracion(error, MIGRACION_FORMATOS) ?? fallo("prisma_formatos_lotes.select", error.message);
    if (!previo) return null;
    const r = await bajarFuente(db, previo.fuente_path);
    if ("ok" in r) return { ok: false, error: r.error };
    const urls = await firmarFormatos(db, [previo.fuente_path]);
    return { ok: true, ...(await loteVista(previo, urls.get(previo.fuente_path) ?? "", r.fuente)) };
  };
  const previo = await reusar();
  if (previo) return previo;

  if (saturado(g.soyId, Date.now(), "formatos-subida", SUBIDAS_MAX)) return MUCHAS_SUBIDAS;
  const { data: blob, error: errBaja } = await db.storage.from(BUCKET).download(res.storage_path);
  if (errBaja || !blob) return fallo("formatos.resultado.download", errBaja?.message);
  let bytes: Uint8Array = new Uint8Array(await blob.arrayBuffer());
  let mime = sniffImageMime(bytes);
  let fuente;
  try {
    // Un GIF (primer cuadro) se pasa a PNG sin pérdida: Formatos sólo trabaja con PNG/JPG/WebP. Con el MISMO tope
    // de píxeles que todo lo demás (un GIF chiquito puede decodificar a 1 GB).
    if (mime === "image/gif") {
      bytes = new Uint8Array(await sharp(bytes, { limitInputPixels: FUENTE_MAX_PX, failOn: "error", pages: 1 }).png().toBuffer());
      mime = "image/png";
    }
    if (!mime || !(mime in MIME_A_EXT)) return { ok: false, error: "Ese resultado no es una imagen que Formatos pueda leer." };
    if (bytes.length > FUENTE_MAX_BYTES) return { ok: false, error: "La imagen del resultado pesa más de 25 MB." };
    fuente = await leerFuente(bytes);
  } catch (e) {
    return fallo("formatos.resultado.leer", e instanceof Error ? e.message : String(e));
  }
  const path = `fuente/${crypto.randomUUID()}.${MIME_A_EXT[mime as MimeFuente]}`;
  const up = await db.storage.from(BUCKET_FORMATOS).upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) return fallo("formatos.resultado.upload", up.error.message);
  const { data: lote, error } = await db
    .from("prisma_formatos_lotes")
    .insert({ fuente_path: path, nombre: "resultado", estado: "listo", fuente_mime: mime, fuente_w: fuente.w, fuente_h: fuente.h, resultado_id: res.id, client_id: res.client_id, created_by: g.soyId })
    .select("*")
    .single<PrismaFormatosLoteRow>();
  if (error || !lote) {
    await db.storage.from(BUCKET_FORMATOS).remove([path]);
    // 23505 = otra pestaña creó el lote de este resultado un instante antes: se usa ése.
    if (error?.code === "23505") return (await reusar()) ?? { ok: false, error: "Ese resultado ya no existe." };
    return faltaMigracion(error, MIGRACION_FORMATOS) ?? fallo("prisma_formatos_lotes.insert", error?.message);
  }
  const urls = await firmarFormatos(db, [path]);
  return { ok: true, ...(await loteVista(lote, urls.get(path) ?? "", fuente)) };
}

export type TamanoPedido = { preset: string; modo: Modo; color?: string | null };

/**
 * Paso 3: los tamaños pedidos → una fila por tamaño (pendiente) con su costo estimado. Repetir un tamaño (otro
 * modo, rehacer) actualiza SU fila. Un tamaño que se está procesando AHORA (otra pestaña, doble clic) no se toca:
 * resetearlo dejaría pasar un segundo reclamo en la ruta = dos cobros. Después el navegador procesa cada fila.
 */
export async function prepararSalidas(loteId: string, tamanos: TamanoPedido[]): Promise<{ ok: true; salidas: SalidaVista[]; costoEstimadoUsd: number } | Fail> {
  const g = await gateFormatos();
  if ("ok" in g) return g;
  if (!Array.isArray(tamanos) || tamanos.length === 0) return { ok: false, error: "Elige al menos un tamaño." };
  if (tamanos.length > MAX_TAMANOS) return { ok: false, error: `Máximo ${MAX_TAMANOS} tamaños por anuncio.` };
  const db = supabaseAdmin();
  const lote = await loteConPermiso(db, loteId, g);
  if ("ok" in lote) return lote;
  if (lote.estado !== "listo" || !lote.fuente_w || !lote.fuente_h) return { ok: false, error: "El anuncio todavía no terminó de subir." };

  const ia = iaActiva();
  const filas = [];
  const pedidos = new Set<string>();
  for (const t of tamanos) {
    const p = presetDe(typeof t?.preset === "string" ? t.preset : "");
    if (!p) return { ok: false, error: "Hay un tamaño que no existe." };
    if (pedidos.has(p.id)) continue;
    pedidos.add(p.id);
    const modo: Modo | null = t.modo === "ia" || t.modo === "blur" || t.modo === "color" ? t.modo : null;
    if (!modo) return { ok: false, error: "Hay un tamaño sin relleno elegido." };
    if (modo === "ia" && !ia) return { ok: false, error: "El relleno con IA está apagado. Usa desenfoque o color." };
    const color = modo === "color" ? (typeof t.color === "string" && HEX.test(t.color) ? t.color.toLowerCase() : null) : null;
    if (modo === "color" && !color) return { ok: false, error: `Elige un color para ${p.w}×${p.h}.` };
    const costo = modo === "ia" ? lienzoIA(lote.fuente_w, lote.fuente_h, p.w, p.h).costoUsd : 0;
    filas.push({ lote_id: lote.id, preset: p.id, ancho: p.w, alto: p.h, modo, color, estado: "pendiente", error: null, costo_estimado_usd: costo, updated_at: new Date().toISOString() });
  }
  // 1) Los tamaños nuevos se insertan; los que ya tenían fila no se tocan aquí.
  const { data: nuevas, error: errIns } = await db
    .from("prisma_formatos_salidas")
    .upsert(filas, { onConflict: "lote_id,preset", ignoreDuplicates: true })
    .select("preset")
    .returns<{ preset: string }[]>();
  if (errIns) return faltaMigracion(errIns, MIGRACION_FORMATOS) ?? fallo("prisma_formatos_salidas.insert", errIns.message);
  // 2) Los que ya existían se reinician con un UPDATE CONDICIONAL: la condición la evalúa la base en el mismo
  //    paso que escribe, así que un tamaño que la ruta reclamó (procesando y vivo) nunca vuelve a "pendiente"
  //    (eso abriría un segundo reclamo = dos cobros). Leer primero y escribir después dejaba esa ventana.
  const insertadas = new Set((nuevas ?? []).map((n) => n.preset));
  const muerto = new Date(Date.now() - PROCESANDO_MUERTO_MS).toISOString();
  const reinicios = await Promise.all(
    filas
      .filter((f) => !insertadas.has(f.preset))
      .map(({ modo, color, costo_estimado_usd, preset }) =>
        db
          .from("prisma_formatos_salidas")
          .update({ modo, color, costo_estimado_usd, estado: "pendiente", error: null, updated_at: new Date().toISOString() })
          .eq("lote_id", lote.id)
          .eq("preset", preset)
          .or(`estado.neq.procesando,updated_at.lt."${muerto}"`),
      ),
  );
  const errUpd = reinicios.find((r) => r.error)?.error;
  if (errUpd) return fallo("prisma_formatos_salidas.update", errUpd.message);
  // El total del lote se recalcula sobre TODAS sus salidas (no sólo las de esta tanda).
  const { data: todas, error: errTodas } = await db.from("prisma_formatos_salidas").select("*").eq("lote_id", lote.id).returns<PrismaFormatosSalidaRow[]>();
  if (errTodas || !todas) return fallo("prisma_formatos_salidas.select", errTodas?.message);
  const costoEstimadoUsd = Math.round(todas.reduce((s, f) => s + Number(f.costo_estimado_usd), 0) * 10_000) / 10_000;
  const { error: errTotal } = await db.from("prisma_formatos_lotes").update({ costo_estimado_usd: costoEstimadoUsd }).eq("id", lote.id);
  if (errTotal) console.error("[formatos] costo del lote:", errTotal.message);
  const delPedido = todas.filter((f) => pedidos.has(f.preset));
  const urls = await firmarFormatos(db, delPedido.flatMap((f) => [f.png_path, f.jpg_path]));
  return { ok: true, salidas: delPedido.map((f) => salidaVista(f, urls)), costoEstimadoUsd };
}

/**
 * Sólo LEE: el estado y URLs recién firmadas de los tamaños de un lote. La pantalla lo usa para (a) seguir los
 * tamaños que quedaron "armándose" (otra pestaña, o una respuesta que se cortó) y (b) refirmar enlaces vencidos.
 * Nunca reinicia nada (prepararSalidas sí, por eso no se reusa).
 */
export async function verSalidas(loteId: string): Promise<{ ok: true; salidas: SalidaVista[] } | Fail> {
  const g = await gateFormatos();
  if ("ok" in g) return g;
  const db = supabaseAdmin();
  const lote = await loteConPermiso(db, loteId, g);
  if ("ok" in lote) return lote;
  const { data, error } = await db.from("prisma_formatos_salidas").select("*").eq("lote_id", lote.id).returns<PrismaFormatosSalidaRow[]>();
  if (error || !data) return faltaMigracion(error, MIGRACION_FORMATOS) ?? fallo("prisma_formatos_salidas.select", error?.message);
  const urls = await firmarFormatos(db, data.flatMap((f) => [f.png_path, f.jpg_path]));
  // Un "procesando" sin noticias en PROCESANDO_MUERTO_MS ya no va a terminar (la función se cayó): se muestra como
  // error para que aparezca "Reintentar" (la ruta sí deja reclamarlo).
  const muerto = Date.now() - PROCESANDO_MUERTO_MS;
  return {
    ok: true,
    salidas: data.map((f) =>
      f.estado === "procesando" && Date.parse(f.updated_at) < muerto
        ? { ...salidaVista(f, urls), estado: "error" as const, error: "Se interrumpió. Reintenta." }
        : salidaVista(f, urls),
    ),
  };
}

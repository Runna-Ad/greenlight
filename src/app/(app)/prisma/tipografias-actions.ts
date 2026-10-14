"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { TIPOGRAFIAS_BUCKET, elegirTipografias, faltaTablaTipografias, nombresPedidos } from "@/lib/prisma/formatos/tipografias";
import { gate, type Fail } from "./comun";

/**
 * HÜE Prisma › Formatos — las tipografías que un PSD necesita, de las que el equipo subió en Admin › Marcas.
 * Se piden por nombre PostScript (el PSD dice cuál usa cada texto); vuelven enlaces firmados al bucket privado.
 * Candado: el `gate()` de Prisma (rol con acceso, sesión Y ficha de equipo): la letra tiene licencia del cliente,
 * así que sólo la baja alguien del equipo (una cuenta sin ficha, p. ej. dada de baja antes de entrar, no).
 */
/** El navegador la baja en el acto: un enlace que sirve 1 minuto no se puede pasar a nadie después. */
const FIRMA_SEG = 60;
/** Más filas que esto no es un catálogo de tipografías: se leen las primeras (las más antiguas). */
const FILAS_MAX = 2000;

/** `ext` sale de la ruta (de leer sus bytes al subirla), no del nombre que traía el archivo. */
export type TipografiaEnlace = { archivo: string; ext: "otf" | "ttf"; cliente: string; url: string };
export type TipografiasDelPsd = { ok: true; tipografias: TipografiaEnlace[] };

export async function tipografiasDelPsd(raw: unknown): Promise<TipografiasDelPsd | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  const pedidos = nombresPedidos(raw);
  if (!pedidos.length) return { ok: true, tipografias: [] };
  const db = supabaseAdmin();
  // Se lee el catálogo y se cruza aquí (no un filtro armado con lo que manda el navegador). En orden de alta: si
  // dos archivos traen el mismo nombre, gana siempre el mismo.
  const { data, error } = await db.from("tipografias_cliente").select("archivo, ruta, nombres, clients(name)").order("created_at").limit(FILAS_MAX);
  if (error) {
    // Antes de la 0079 la tabla no existe: es como no tener ninguna guardada (la pantalla dice qué falta y se
    // pueden soltar). Cualquier otro error sí se dice.
    if (faltaTablaTipografias(error)) return { ok: true, tipografias: [] };
    console.error("[prisma] leer tipografias_cliente:", error.message);
    return { ok: false, error: "No se pudieron traer las tipografías de Greenlight." };
  }
  type Fila = { archivo: string; ruta: string; nombres: string[]; clients: { name: string } | null };
  const { elegidas } = elegirTipografias((data ?? []) as unknown as Fila[], pedidos);
  if (!elegidas.length) return { ok: true, tipografias: [] };
  const firmadas = await db.storage.from(TIPOGRAFIAS_BUCKET).createSignedUrls(elegidas.map((e) => e.ruta), FIRMA_SEG);
  if (firmadas.error) {
    console.error("[prisma] firmar tipografías:", firmadas.error.message);
    return { ok: false, error: "No se pudieron traer las tipografías de Greenlight." };
  }
  // Un archivo que ya no está en el bucket no se firma: queda fuera (la pantalla lo sigue contando como faltante).
  const enlacePorRuta = new Map(firmadas.data.filter((f) => !f.error && f.signedUrl).map((f) => [f.path, f.signedUrl]));
  const tipografias: TipografiaEnlace[] = [];
  for (const e of elegidas) {
    const enlace = enlacePorRuta.get(e.ruta);
    if (enlace) tipografias.push({ archivo: e.archivo, ext: e.ruta.endsWith(".otf") ? "otf" : "ttf", cliente: e.clients?.name ?? "", url: enlace });
  }
  return { ok: true, tipografias };
}

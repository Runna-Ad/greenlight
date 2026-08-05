"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canMoveStatus } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { urlSegura } from "@/lib/url-segura";
import {
  MAX_BYTES,
  EXT_POR_MIME,
  sniffImageMime,
  plataformaDeUrl,
} from "@/lib/referencia";

const BUCKET = "greenlight-referencias";

export type RefResultado = { ok: true } | { ok: false; error: string };

/**
 * A qué se ancla la referencia: un PLANO (guión) o un ESTÁTICO. Cada uno tiene
 * su tabla de vínculo, pero comparten el registro (produccion.references) y toda
 * la lógica de subida. Antes esto sólo servía para planos.
 */
export type RefOwner = { tipo: "plano" | "estatico"; id: string };

/** La tabla de vínculo y su columna, según el dueño. */
function vinculoDe(owner: RefOwner): { tabla: "plano_references" | "estatico_references"; col: string } {
  return owner.tipo === "plano"
    ? { tabla: "plano_references", col: "plano_id" }
    : { tabla: "estatico_references", col: "estatico_id" };
}

async function puedeEditar(): Promise<boolean> {
  return canMoveStatus(await getViewAs());
}

/**
 * Sube una IMAGEN de referencia y la ancla a su dueño (plano o estático).
 *
 * Toda la validación es del SERVIDOR: el tipo se decide por magic bytes (no por
 * el nombre ni el Content-Type que manda el cliente — un .exe renombrado a .png
 * mentiría), el tamaño se corta a 10 MB, y la extensión sale del tipo sniffado.
 */
export async function subirReferencia(owner: RefOwner, form: FormData): Promise<RefResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!(await puedeEditar())) return { ok: false, error: "Este rol no edita referencias." };

  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No llegó ningún archivo." };
  if (file.size > MAX_BYTES) return { ok: false, error: "La imagen pasa de 10 MB." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageMime(bytes);
  if (!mime) {
    return { ok: false, error: "Sólo imágenes (PNG, JPG, WebP, GIF, AVIF)." };
  }

  const soy = await getSoy();
  const db = supabaseAdmin();
  const { tabla, col } = vinculoDe(owner);

  // Ruta timestamp-libre: el nombre se arma con un uuid, no con Date.now().
  const ext = EXT_POR_MIME[mime];
  const nombre = `${owner.id}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(nombre, bytes, { contentType: mime, upsert: false });
  if (upErr) return { ok: false, error: `No se pudo subir: ${upErr.message}` };

  const urlInterna = `storage://${BUCKET}/${nombre}`;
  const { data: ref, error: refErr } = await db
    .from("references")
    .insert({
      url: urlInterna,
      kind: "imagen",
      storage_path: nombre,
      mime,
      bytes: file.size,
      platform: "upload",
      added_member_id: soy?.id ?? null,
    })
    .select("id")
    .single();
  if (refErr) {
    await db.storage.from(BUCKET).remove([nombre]); // rollback, no huérfanos
    return { ok: false, error: refErr.message };
  }

  const { error: linkErr } = await db.from(tabla).insert({ [col]: owner.id, reference_id: ref.id });
  if (linkErr) return { ok: false, error: linkErr.message };

  revalidatePath("/[cliente]/tareas/[id]", "page");
  return { ok: true };
}

/**
 * Agrega un VIDEO/referencia por LINK. Dedup por references.url (unique): si el
 * link ya existe, se reusa el registro en vez de duplicar. (Los estáticos no
 * usan esto — su UI es sólo imágenes — pero la acción sirve para ambos dueños.)
 */
export async function agregarReferenciaLink(
  owner: RefOwner,
  url: string,
  note?: string,
): Promise<RefResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!(await puedeEditar())) return { ok: false, error: "Este rol no edita referencias." };

  const limpia = url.trim();
  if (!urlSegura(limpia)) return { ok: false, error: "La liga debe empezar con http:// o https://" };

  const soy = await getSoy();
  const db = supabaseAdmin();
  const { tabla, col } = vinculoDe(owner);

  const { data: existente } = await db
    .from("references").select("id").eq("url", limpia).maybeSingle();

  let refId = existente?.id;
  if (!refId) {
    const { data: ref, error: refErr } = await db
      .from("references")
      .insert({
        url: limpia,
        kind: "video",
        platform: plataformaDeUrl(limpia),
        added_member_id: soy?.id ?? null,
      })
      .select("id")
      .single();
    if (refErr) return { ok: false, error: refErr.message };
    refId = ref.id;
  }

  const { error: linkErr } = await db
    .from(tabla)
    .upsert({ [col]: owner.id, reference_id: refId, note: note?.trim() || null });
  if (linkErr) return { ok: false, error: linkErr.message };

  revalidatePath("/[cliente]/tareas/[id]", "page");
  return { ok: true };
}

/** Quita una referencia de su dueño. El archivo del bucket se limpia si queda huérfano. */
export async function quitarReferencia(owner: RefOwner, referenceId: string): Promise<RefResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!(await puedeEditar())) return { ok: false, error: "Este rol no edita referencias." };

  const db = supabaseAdmin();
  const { tabla, col } = vinculoDe(owner);
  const { error } = await db.from(tabla).delete().eq(col, owner.id).eq("reference_id", referenceId);
  if (error) return { ok: false, error: error.message };

  // ¿Quedó sin ningún dueño (plano / estático / idea)? Si es imagen subida, se
  // borra el archivo y el registro para no acumular basura.
  const [{ count: enPlanos }, { count: enEstaticos }, { count: enIdeas }] = await Promise.all([
    db.from("plano_references").select("*", { count: "exact", head: true }).eq("reference_id", referenceId),
    db.from("estatico_references").select("*", { count: "exact", head: true }).eq("reference_id", referenceId),
    db.from("idea_references").select("*", { count: "exact", head: true }).eq("reference_id", referenceId),
  ]);
  if ((enPlanos ?? 0) === 0 && (enEstaticos ?? 0) === 0 && (enIdeas ?? 0) === 0) {
    const { data: ref } = await db
      .from("references").select("kind, storage_path").eq("id", referenceId).maybeSingle();
    if (ref?.kind === "imagen" && ref.storage_path) {
      await db.storage.from(BUCKET).remove([ref.storage_path]);
    }
    await db.from("references").delete().eq("id", referenceId);
  }

  revalidatePath("/[cliente]/tareas/[id]", "page");
  return { ok: true };
}

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

async function puedeEditar(): Promise<boolean> {
  return canMoveStatus(await getViewAs());
}

/**
 * Sube una IMAGEN de referencia y la ancla a un plano.
 *
 * Toda la validación es del SERVIDOR: el tipo se decide por magic bytes (no por
 * el nombre ni el Content-Type que manda el cliente — un .exe renombrado a .png
 * mentiría), el tamaño se corta a 10 MB, y la extensión sale del tipo sniffado.
 */
export async function subirReferencia(planoId: string, form: FormData): Promise<RefResultado> {
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

  // Ruta con timestamp-libre: el id de la fila lo pone la BD, así que el nombre
  // se arma con un valor único de la BD para no depender de Date.now().
  const ext = EXT_POR_MIME[mime];
  const nombre = `${planoId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(nombre, bytes, { contentType: mime, upsert: false });
  if (upErr) return { ok: false, error: `No se pudo subir: ${upErr.message}` };

  // El registro. url debe ser único (constraint de la 0001), y una imagen no
  // tiene url pública — se usa una url interna estable basada en el storage_path.
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
    // Rollback del archivo si el registro falla — no dejar huérfanos en el bucket.
    await db.storage.from(BUCKET).remove([nombre]);
    return { ok: false, error: refErr.message };
  }

  const { error: linkErr } = await db
    .from("plano_references")
    .insert({ plano_id: planoId, reference_id: ref.id });
  if (linkErr) return { ok: false, error: linkErr.message };

  revalidatePath("/[cliente]/tareas/[id]", "page");
  return { ok: true };
}

/**
 * Agrega un VIDEO/referencia por LINK a un plano. Dedup por references.url
 * (unique): si el link ya existe, se reusa el registro en vez de duplicar.
 */
export async function agregarReferenciaLink(
  planoId: string,
  url: string,
  note?: string,
): Promise<RefResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!(await puedeEditar())) return { ok: false, error: "Este rol no edita referencias." };

  const limpia = url.trim();
  if (!urlSegura(limpia)) return { ok: false, error: "La liga debe empezar con http:// o https://" };

  const soy = await getSoy();
  const db = supabaseAdmin();

  // ¿Ya existe ese link? (dedup global — references.url es único)
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
    .from("plano_references")
    .upsert({ plano_id: planoId, reference_id: refId, note: note?.trim() || null });
  if (linkErr) return { ok: false, error: linkErr.message };

  revalidatePath("/[cliente]/tareas/[id]", "page");
  return { ok: true };
}

/** Quita una referencia de un plano. El archivo del bucket se limpia si queda huérfano. */
export async function quitarReferencia(
  planoId: string,
  referenceId: string,
): Promise<RefResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!(await puedeEditar())) return { ok: false, error: "Este rol no edita referencias." };

  const db = supabaseAdmin();
  const { error } = await db
    .from("plano_references")
    .delete()
    .eq("plano_id", planoId)
    .eq("reference_id", referenceId);
  if (error) return { ok: false, error: error.message };

  // ¿La referencia quedó sin ningún plano ni idea que la use? Si es una imagen
  // subida, se borra el archivo y el registro para no acumular basura.
  const [{ count: enPlanos }, { count: enIdeas }] = await Promise.all([
    db.from("plano_references").select("*", { count: "exact", head: true }).eq("reference_id", referenceId),
    db.from("idea_references").select("*", { count: "exact", head: true }).eq("reference_id", referenceId),
  ]);
  if ((enPlanos ?? 0) === 0 && (enIdeas ?? 0) === 0) {
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

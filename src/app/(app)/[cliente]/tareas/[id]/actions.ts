"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canMoveStatus, canOverrideStatus } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { ESTADOS_CERRADOS } from "@/lib/plantilla";
import type { AssetStatus } from "@/lib/brand";

export type Tabla = "planos" | "estaticos";

/**
 * Whitelist en el SERVIDOR. El nombre del campo llega del cliente y termina
 * dentro de un identificador SQL — jamás se interpola algo que no esté aquí.
 */
const CAMPOS: Record<Tabla, Set<string>> = {
  planos: new Set([
    "titulo", "hook_narrativo", "hook_visual", "accion",
    "copy_in", "sfx", "gfx", "edicion", "dialogo",
  ]),
  estaticos: new Set([
    "copy_titulo", "copy_subtitulo", "copy_cta", "legales_extra",
    "referencia_url", "referencia_nota", "notas",
  ]),
};

export type GuardarResultado =
  | { ok: true }
  | { ok: false; conflicto: true; valorActual: string | null }
  | { ok: false; conflicto?: false; error: string };

/**
 * Guarda UN campo, con compare-and-set.
 *
 * Nunca se manda el objeto entero: eso es read-modify-write, y con varias
 * personas asignadas a la misma tarea (52 asignaciones sobre 30 tareas) el
 * último en guardar borraría lo que el otro acaba de escribir, sin error y sin
 * rastro — la misma familia que el `row_hash: "imported"`.
 *
 * El `where <campo> is not distinct from $anterior` hace que 0 filas signifique
 * "alguien más tocó justo este campo". Se devuelve el valor real para que la
 * persona decida, en vez de descartar algo en silencio.
 *
 * Se compara por CAMPO y no por updated_at: el trigger de updated_at es por
 * fila, así que editar el campo A haría conflictar el campo B sin razón.
 */
export async function guardarCampo(
  tabla: Tabla,
  filaId: string,
  campo: string,
  valorAnterior: string | null,
  valorNuevo: string | null,
): Promise<GuardarResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!CAMPOS[tabla]?.has(campo)) return { ok: false, error: `Campo no permitido: ${campo}` };

  const [role, soy] = await Promise.all([getViewAs(), getSoy()]);
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no edita la plantilla." };

  const db = supabaseAdmin();

  // ¿La tarea está cerrada? Un guión aprobado no debe cambiar después de
  // aprobado sin que nadie se entere.
  const { data: fila } = await db
    .from(tabla).select("idea_id").eq("id", filaId).maybeSingle();
  if (!fila) return { ok: false, error: "La fila ya no existe." };

  const { data: idea } = await db
    .from("ideas").select("status").eq("id", fila.idea_id).maybeSingle();
  const status = idea?.status as AssetStatus | undefined;
  if (status && ESTADOS_CERRADOS.includes(status) && !canOverrideStatus(role)) {
    return { ok: false, error: "Esta tarea ya está cerrada. Pídele a un lead que la reabra." };
  }

  const limpio = valorNuevo?.trim() ? valorNuevo : null;

  // El compare-and-set: la fila sólo se actualiza si el campo sigue teniendo el
  // valor que la persona vio. supabase-js no expresa "is not distinct from", así
  // que el caso null va con .is() y el resto con .eq().
  const base = db.from(tabla).update({ [campo]: limpio }).eq("id", filaId);
  const { data, error } =
    valorAnterior === null
      ? await base.is(campo, null).select("id")
      : await base.eq(campo, valorAnterior).select("id");

  if (error) return { ok: false, error: error.message };

  // 0 filas y la fila existe (ya se comprobó arriba) = alguien más la tocó.
  if (!data?.length) {
    const { data: actual } = await db
      .from(tabla).select(campo).eq("id", filaId).maybeSingle();
    const v = (actual as Record<string, string | null> | null)?.[campo] ?? null;
    // Si ya vale lo que queríamos escribir, no hay nada que resolver.
    if (v === limpio) return { ok: true };
    return { ok: false, conflicto: true, valorActual: v };
  }

  revalidatePath(`/[cliente]/tareas/${filaId}`, "page");
  void soy; // la identidad se usará para el aviso de "quién lo cambió"
  return { ok: true };
}

/** Añadir un plano al final del guión. Operación estructural: explícita. */
export async function agregarPlano(ideaId: string): Promise<GuardarResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const role = await getViewAs();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no edita la plantilla." };

  const db = supabaseAdmin();
  const { data: ultimo } = await db
    .from("planos").select("orden").eq("idea_id", ideaId)
    .order("orden", { ascending: false }).limit(1).maybeSingle();

  const { error } = await db
    .from("planos").insert({ idea_id: ideaId, orden: (ultimo?.orden ?? 0) + 1 });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function borrarPlano(planoId: string): Promise<GuardarResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const role = await getViewAs();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no edita la plantilla." };

  const { error } = await supabaseAdmin().from("planos").delete().eq("id", planoId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Asocia un snippet de la biblioteca (legal o selling point) a la tarea. */
export async function alternarSnippet(
  ideaId: string,
  snippetId: string,
  activar: boolean,
): Promise<GuardarResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const role = await getViewAs();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no edita la plantilla." };

  const db = supabaseAdmin();
  const { error } = activar
    ? await db.from("idea_snippets").upsert({ idea_id: ideaId, snippet_id: snippetId })
    : await db.from("idea_snippets").delete().eq("idea_id", ideaId).eq("snippet_id", snippetId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

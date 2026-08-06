"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import type { MiembroRow, RolAsignable } from "@/lib/equipo";

// published/delivered ya salieron del tablero — no cuentan como carga viva.
const TERMINALES = new Set(["published", "delivered"]);

/**
 * El equipo (track_members), activos e inactivos, con su carga de trabajo viva.
 * La carga se cuenta en JS sobre 2 queries pequeñas (≈32 ideas) en vez de pelear
 * con el embedding de PostgREST.
 */
export async function listarEquipo(): Promise<MiembroRow[]> {
  if (!hasSupabase()) return [];
  const db = supabaseAdmin();

  const { data: miembros } = await db
    .from("track_members")
    .select("id, name, track, color, role, email, slack_user_id, es_lead, active, sort_order")
    .order("track", { ascending: true })
    .order("sort_order", { ascending: true });

  const rows = (miembros ?? []) as Omit<MiembroRow, "carga">[];

  const [{ data: asigs }, { data: ideas }] = await Promise.all([
    db.from("idea_assignments").select("member_id, idea_id"),
    db.from("ideas").select("id, status"),
  ]);
  const statusById = new Map(
    ((ideas ?? []) as { id: string; status: string }[]).map((i) => [i.id, i.status]),
  );
  const carga = new Map<string, number>();
  for (const a of (asigs ?? []) as { member_id: string | null; idea_id: string }[]) {
    if (!a.member_id) continue;
    const st = statusById.get(a.idea_id);
    if (st && !TERMINALES.has(st)) carga.set(a.member_id, (carga.get(a.member_id) ?? 0) + 1);
  }

  return rows.map((r) => ({ ...r, carga: carga.get(r.id) ?? 0 }));
}

type Guardado = { ok: boolean; error?: string };

// Sólo estos campos se pueden editar desde el panel (whitelist — nunca el id ni
// profile_id, que es el puente con auth).
const CAMPOS_EDITABLES = new Set([
  "name",
  "color",
  "track",
  "role",
  "email",
  "slack_user_id",
  "es_lead",
  "active",
]);

/** Edita un miembro (guardado inmediato, como en SnapTrack). */
export async function guardarMiembro(
  id: string,
  patch: Record<string, unknown>,
): Promise<Guardado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const limpio: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!CAMPOS_EDITABLES.has(k)) continue;
    // Los campos de texto opcionales se normalizan a null cuando quedan vacíos.
    if ((k === "email" || k === "slack_user_id") && typeof v === "string") {
      limpio[k] = v.trim() || null;
    } else {
      limpio[k] = v;
    }
  }
  if (!Object.keys(limpio).length) return { ok: false, error: "Nada que guardar." };

  const { error } = await supabaseAdmin().from("track_members").update(limpio).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** Da de alta una persona nueva en el equipo. Devuelve la fila creada (carga 0). */
export async function crearMiembro(data: {
  name: string;
  track: "real" | "normal";
  color?: string;
  role?: RolAsignable;
  email?: string;
  slack_user_id?: string;
  es_lead?: boolean;
}): Promise<Guardado & { miembro?: MiembroRow }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!data.name.trim()) return { ok: false, error: "El nombre es obligatorio." };

  const db = supabaseAdmin();
  // sort_order = siguiente en su track (para que aparezca al final).
  const { data: ultimo } = await db
    .from("track_members")
    .select("sort_order")
    .eq("track", data.track)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (((ultimo?.sort_order as number) ?? 0) || 0) + 1;

  const { data: creado, error } = await db
    .from("track_members")
    .insert({
      name: data.name.trim(),
      track: data.track,
      color: data.color ?? "#775cbf",
      role: data.role ?? "creative",
      email: data.email?.trim() || null,
      slack_user_id: data.slack_user_id?.trim() || null,
      es_lead: data.es_lead ?? false,
      sort_order,
    })
    .select("id, name, track, color, role, email, slack_user_id, es_lead, active, sort_order")
    .single();
  if (error) {
    // unique (track, name) — nombre repetido dentro del mismo track.
    const msg = /duplicate|unique/i.test(error.message)
      ? `Ya hay un "${data.name.trim()}" en el track ${data.track === "real" ? "Real" : "Normal"}.`
      : error.message;
    return { ok: false, error: msg };
  }
  revalidatePath("/admin");
  return { ok: true, miembro: { ...(creado as Omit<MiembroRow, "carga">), carga: 0 } };
}

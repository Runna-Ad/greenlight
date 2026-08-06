"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import type { MiembroRow, RolAsignable } from "@/lib/equipo";
import type {
  ActividadRow,
  IntegracionesEstado,
  MarcaOpt,
  SnippetKind,
  SnippetRow,
} from "@/lib/admin-tipos";

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
    .select("id, name, track, color, role, email, slack_user_id, es_lead, active, notify_email, sort_order")
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
  "notify_email",
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
    .select("id, name, track, color, role, email, slack_user_id, es_lead, active, notify_email, sort_order")
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

// ── Actividad ──────────────────────────────────────────────
// El feed de "quién hizo qué": los cambios de estado de tareas (status_events),
// con quién actuó resuelto (member o profile). Los datos ya se capturan solos.
export async function listarActividad(limit = 40): Promise<ActividadRow[]> {
  if (!hasSupabase()) return [];
  const db = supabaseAdmin();

  const { data: eventos } = await db
    .from("status_events")
    .select("id, idea_id, from_status, to_status, actor_id, actor_member_id, reason, override, created_at")
    .not("idea_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (eventos ?? []) as {
    id: string; idea_id: string; from_status: string | null; to_status: string;
    actor_id: string | null; actor_member_id: string | null; reason: string | null;
    override: boolean; created_at: string;
  }[];
  if (!rows.length) return [];

  const ideaIds = [...new Set(rows.map((r) => r.idea_id))];
  const memberIds = [...new Set(rows.map((r) => r.actor_member_id).filter(Boolean))] as string[];
  const profileIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];

  const [ideasRes, membersRes, profilesRes] = await Promise.all([
    db.from("ideas").select("id, code, naming_base").in("id", ideaIds),
    memberIds.length
      ? db.from("track_members").select("id, name, color").in("id", memberIds)
      : Promise.resolve({ data: [] as { id: string; name: string; color: string }[] }),
    profileIds.length
      ? db.from("profiles").select("id, full_name").in("id", profileIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);

  const ideaById = new Map(
    ((ideasRes.data ?? []) as { id: string; code: string | null; naming_base: string | null }[])
      .map((i) => [i.id, i]),
  );
  const memberById = new Map(
    ((membersRes.data ?? []) as { id: string; name: string; color: string }[]).map((m) => [m.id, m]),
  );
  const profileById = new Map(
    ((profilesRes.data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p]),
  );

  return rows.map((r) => {
    const idea = ideaById.get(r.idea_id);
    const member = r.actor_member_id ? memberById.get(r.actor_member_id) : undefined;
    const profile = r.actor_id ? profileById.get(r.actor_id) : undefined;
    return {
      id: r.id,
      ideaCode: idea?.code ?? null,
      ideaNaming: idea?.naming_base ?? null,
      from: r.from_status,
      to: r.to_status,
      actor: member?.name ?? profile?.full_name ?? null,
      actorColor: member?.color ?? null,
      override: r.override,
      reason: r.reason,
      createdAt: r.created_at,
    };
  });
}

// ── Integraciones ──────────────────────────────────────────
export async function estadoIntegraciones(): Promise<IntegracionesEstado> {
  const sheetConfigurado = Boolean(
    process.env.SHEETS_SCRIPT_URL && process.env.SHEETS_SCRIPT_SECRET,
  );
  const notionConfigurado = Boolean(process.env.NOTION_TOKEN && process.env.NOTION_DB_ID);

  let ultimaSync: string | null = null;
  let tareasImportadas = 0;
  if (hasSupabase()) {
    const db = supabaseAdmin();
    const { data: ult } = await db
      .from("staged_rows")
      .select("reviewed_at")
      .not("reviewed_at", "is", null)
      .order("reviewed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    ultimaSync = (ult?.reviewed_at as string) ?? null;
    const { count } = await db
      .from("staged_rows")
      .select("id", { count: "exact", head: true })
      .not("idea_id", "is", null);
    tareasImportadas = count ?? 0;
  }

  return { sheetConfigurado, ultimaSync, tareasImportadas, notionConfigurado };
}

// ── Biblioteca (snippets) ──────────────────────────────────
export async function listarBiblioteca(): Promise<{ snippets: SnippetRow[]; marcas: MarcaOpt[] }> {
  if (!hasSupabase()) return { snippets: [], marcas: [] };
  const db = supabaseAdmin();
  const [snipRes, marcaRes] = await Promise.all([
    db.from("snippets").select("id, kind, title, body, scope, marca_id, active, sort_order")
      .order("kind", { ascending: true })
      .order("sort_order", { ascending: true }),
    db.from("marcas").select("id, name").order("name", { ascending: true }),
  ]);
  return {
    snippets: (snipRes.data ?? []) as SnippetRow[],
    marcas: (marcaRes.data ?? []) as MarcaOpt[],
  };
}

type SnipGuardado = { ok: boolean; error?: string; snippet?: SnippetRow };

export async function crearSnippet(data: {
  kind: SnippetKind;
  title: string;
  body: string;
  marca_id?: string | null;
}): Promise<SnipGuardado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!data.title.trim() || !data.body.trim()) {
    return { ok: false, error: "Título y texto son obligatorios." };
  }
  const db = supabaseAdmin();
  // scope = 'marca' si se ata a una marca; si no, 'global'.
  const scope = data.marca_id ? "marca" : "global";
  const { data: creado, error } = await db
    .from("snippets")
    .insert({
      kind: data.kind,
      title: data.title.trim(),
      body: data.body.trim(),
      scope,
      marca_id: data.marca_id ?? null,
    })
    .select("id, kind, title, body, scope, marca_id, active, sort_order")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true, snippet: creado as SnippetRow };
}

export async function editarSnippet(
  id: string,
  patch: { title?: string; body?: string; marca_id?: string | null },
): Promise<SnipGuardado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const limpio: Record<string, unknown> = {};
  if (typeof patch.title === "string") limpio.title = patch.title.trim();
  if (typeof patch.body === "string") limpio.body = patch.body.trim();
  if (patch.marca_id !== undefined) {
    limpio.marca_id = patch.marca_id;
    limpio.scope = patch.marca_id ? "marca" : "global";
  }
  if (!Object.keys(limpio).length) return { ok: false, error: "Nada que guardar." };
  const { error } = await supabaseAdmin().from("snippets").update(limpio).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function alternarSnippetActivo(id: string, active: boolean): Promise<SnipGuardado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const { error } = await supabaseAdmin().from("snippets").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

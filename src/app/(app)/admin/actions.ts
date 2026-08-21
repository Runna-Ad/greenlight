"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getViewAs } from "@/lib/view-as";
import { getSoyId } from "@/lib/soy";
import { canAdmin, canAssignAdmins } from "@/lib/roles";
import { MAX_BYTES, EXT_POR_MIME, sniffImageMime } from "@/lib/referencia";
import type { MiembroRow, RolAsignable } from "@/lib/equipo";
import type {
  ActividadRow,
  ClienteConMarcas,
  IntegracionesEstado,
  MarcaLogo,
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
    .select("id, name, track, color, role, email, slack_user_id, es_lead, active, notify_email, notify_slack, sort_order")
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
  "active",
  "notify_email",
  "notify_slack",
]);

// Ser lead se DERIVA del rol: un Dept Head / Lead es lead, nadie más. (Antes era
// un toggle "Puede ser lead" aparte — redundante con el rol.)
const esLeadDeRol = (role: unknown): boolean => role === "lead";

// Sólo el Master Builder puede nombrar admins/master; un admin gestiona al
// resto del equipo pero no crea otro admin.
const ROLES_SOLO_MASTER = new Set(["admin", "master"]);

/** Edita un miembro (guardado inmediato, como en SnapTrack). Sólo admin+; y sólo
 *  el master puede poner el rol en admin/master. */
export async function guardarMiembro(
  id: string,
  patch: Record<string, unknown>,
): Promise<Guardado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const rol = await getViewAs();
  if (!canAdmin(rol)) return { ok: false, error: "Sólo un admin edita el equipo." };
  if (ROLES_SOLO_MASTER.has(String(patch.role)) && !canAssignAdmins(rol)) {
    return { ok: false, error: "Sólo el Master Builder puede nombrar admins." };
  }

  const db = supabaseAdmin();
  // Un admin no-master no puede TOCAR la fila de otro admin/master (ni degradarlo
  // ni desactivarlo) — el guard de arriba sólo miraba el rol NUEVO, no el actual.
  const { data: actual } = await db
    .from("track_members")
    .select("role, profile_id")
    .eq("id", id)
    .maybeSingle<{ role: string; profile_id: string | null }>();
  if (!actual) return { ok: false, error: "Esa persona ya no existe." };
  if (ROLES_SOLO_MASTER.has(String(actual.role)) && !canAssignAdmins(rol)) {
    return { ok: false, error: "Sólo el Master Builder puede editar a un admin." };
  }

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
  // es_lead se deriva del rol: si cambia el rol, se re-sincroniza la bandera.
  if ("role" in limpio) limpio.es_lead = esLeadDeRol(limpio.role);

  const { error } = await db.from("track_members").update(limpio).eq("id", id);
  if (error) return { ok: false, error: error.message };

  // La fuente de permisos es profiles.role. Si esta persona YA tiene cuenta y le
  // cambiamos el rol, se propaga al profile — si no, "ascender a Lead/Admin" en
  // Equipo no le daría permisos reales (la cuenta seguiría como al hacer login).
  if ("role" in limpio && actual.profile_id) {
    await db.from("profiles").update({ role: limpio.role }).eq("id", actual.profile_id);
  }

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * "Mi perfil" — cada persona edita LO SUYO: nombre y sus notificaciones (email
 * y/o Slack). No necesita ser admin; se identifica por su SESIÓN (getSoyId) y sólo
 * puede tocar su propia fila, con una whitelist mínima. Así un lead/especialista
 * gestiona su perfil sin entrar a Configuración.
 */
export async function guardarMiPerfil(patch: {
  name?: string;
  notify_email?: boolean;
  notify_slack?: boolean;
}): Promise<Guardado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const soyId = await getSoyId();
  if (!soyId) return { ok: false, error: "Inicia sesión para editar tu perfil." };

  const limpio: Record<string, unknown> = {};
  if (typeof patch.name === "string") {
    const nombre = patch.name.trim();
    if (!nombre) return { ok: false, error: "El nombre no puede quedar vacío." };
    limpio.name = nombre;
  }
  if (typeof patch.notify_email === "boolean") limpio.notify_email = patch.notify_email;
  if (typeof patch.notify_slack === "boolean") limpio.notify_slack = patch.notify_slack;
  if (!Object.keys(limpio).length) return { ok: false, error: "Nada que guardar." };

  const { error } = await supabaseAdmin()
    .from("track_members")
    .update(limpio)
    .eq("id", soyId)
    .eq("active", true); // sólo tu propia fila ACTIVA, igual que getSoy
  if (error) return { ok: false, error: error.message };
  revalidatePath("/mi-perfil");
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
}): Promise<Guardado & { miembro?: MiembroRow }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const rol = await getViewAs();
  if (!canAdmin(rol)) return { ok: false, error: "Sólo un admin da de alta al equipo." };
  if (ROLES_SOLO_MASTER.has(String(data.role)) && !canAssignAdmins(rol)) {
    return { ok: false, error: "Sólo el Master Builder puede nombrar admins." };
  }
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
      es_lead: esLeadDeRol(data.role ?? "creative"),
      sort_order,
    })
    .select("id, name, track, color, role, email, slack_user_id, es_lead, active, notify_email, notify_slack, sort_order")
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
  // El ID de la página de legales es una constante en código (NOTION_LEGALES_PAGE_ID,
  // override por env) — así basta con setear el NOTION_TOKEN (secreto) en Vercel.
  const notionConfigurado = Boolean(process.env.NOTION_TOKEN);

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
  if (!canAdmin(await getViewAs())) return { ok: false, error: "Sólo un admin edita la biblioteca." };
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
  if (!canAdmin(await getViewAs())) return { ok: false, error: "Sólo un admin edita la biblioteca." };
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
  if (!canAdmin(await getViewAs())) return { ok: false, error: "Sólo un admin edita la biblioteca." };
  const { error } = await supabaseAdmin().from("snippets").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Borra un snippet de la biblioteca (HARD delete). Sólo admin+. Guarda de uso: si
 * está atado a alguna tarea (idea_snippets) se BLOQUEA — quítalo de esas tareas o
 * desactívalo primero (mismo patrón que eliminarMarca; no se pierde trabajo en
 * silencio). Nota: un legal que sigue en Notion RE-APARECE en el próximo sync —
 * para retirarlo de forma permanente, bórralo también en Notion.
 */
export async function eliminarSnippet(id: string): Promise<SnipGuardado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!canAdmin(await getViewAs())) return { ok: false, error: "Sólo un admin edita la biblioteca." };
  const db = supabaseAdmin();
  const { count } = await db
    .from("idea_snippets")
    .select("idea_id", { count: "exact", head: true })
    .eq("snippet_id", id);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Está en uso en ${count} tarea(s). Quítalo de ellas o desactívalo antes de borrarlo.`,
    };
  }
  const { error } = await db.from("snippets").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

// ── Marcas: logos de sub-marca ─────────────────────────────
// Un cliente tiene varias marcas (DiDi → Card / Préstamos), cada una con su
// logo. El logo se muestra en la cabecera de la tarea (marcas.logo_url). El
// bucket "greenlight-logos" es PÚBLICO (assets de marca, sin PII); se guarda la
// URL pública en logo_url y se lee directo, sin firmar por render.
const LOGOS_BUCKET = "greenlight-logos";

/**
 * El path dentro del bucket, extraído de una URL pública NUESTRA (o null). Se
 * valida host + prefijo exacto con `new URL` (no un substring suelto), para no
 * intentar borrar por una URL externa que casualmente contenga el nombre del
 * bucket, ni confundir un bucket con prefijo parecido.
 */
function pathEnBucketLogos(publicUrl: string | null): string | null {
  if (!publicUrl) return null;
  let u: URL;
  try {
    u = new URL(publicUrl);
  } catch {
    return null;
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (base) {
    try {
      if (u.host !== new URL(base).host) return null;
    } catch {
      /* base mal formado — se ignora el chequeo de host */
    }
  }
  const prefijo = `/storage/v1/object/public/${LOGOS_BUCKET}/`;
  return u.pathname.startsWith(prefijo)
    ? decodeURIComponent(u.pathname.slice(prefijo.length))
    : null;
}

/** Los clientes con sus marcas (y logo) para el panel de Marcas. */
export async function listarMarcasPorCliente(): Promise<ClienteConMarcas[]> {
  if (!hasSupabase()) return [];
  const db = supabaseAdmin();
  const [cliRes, marcaRes] = await Promise.all([
    db.from("clients").select("id, name, slug, logo_url").order("name", { ascending: true }),
    db.from("marcas").select("id, client_id, name, slug, logo_url").order("name", { ascending: true }),
  ]);
  const clientes = (cliRes.data ?? []) as { id: string; name: string; slug: string; logo_url: string | null }[];
  const marcas = (marcaRes.data ?? []) as {
    id: string; client_id: string; name: string; slug: string; logo_url: string | null;
  }[];
  return clientes.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    logo_url: c.logo_url,
    marcas: marcas
      .filter((m) => m.client_id === c.id)
      .map((m) => ({ id: m.id, name: m.name, slug: m.slug, logo_url: m.logo_url })),
  }));
}

type LogoGuardado = { ok: true; logoUrl: string } | { ok: false; error: string };

/**
 * Sube (o reemplaza) el logo de una MARCA. Sólo admin. Valida por magic bytes
 * (no por nombre), corta a 10 MB, sube al bucket público y guarda la URL pública
 * en marcas.logo_url. Si había un logo anterior nuestro, borra ese archivo para
 * no dejar huérfanos. Sólo raster (PNG/JPG/WebP/GIF/AVIF) — el mismo sniff seguro
 * que las referencias (SVG no, por el riesgo de script embebido).
 */
export async function subirLogoMarca(marcaId: string, form: FormData): Promise<LogoGuardado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!canAdmin(await getViewAs())) return { ok: false, error: "Sólo un admin sube logos." };

  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No llegó ningún archivo." };
  if (file.size > MAX_BYTES) return { ok: false, error: "El logo pasa de 10 MB." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageMime(bytes);
  if (!mime) return { ok: false, error: "Sólo imágenes (PNG, JPG, WebP, GIF, AVIF)." };

  const db = supabaseAdmin();
  // La marca DEBE existir ANTES de subir: un id válido pero inexistente subiría
  // el archivo y el UPDATE tocaría 0 filas SIN error → un huérfano público que
  // ninguna fila referencia. Se comprueba primero (y de paso se lee el logo
  // anterior para borrarlo después).
  const { data: prev } = await db
    .from("marcas").select("id, logo_url").eq("id", marcaId).maybeSingle();
  if (!prev) return { ok: false, error: "La marca ya no existe." };
  const prevPath = pathEnBucketLogos((prev as { logo_url: string | null }).logo_url ?? null);

  const ext = EXT_POR_MIME[mime];
  const nombre = `${marcaId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await db.storage
    .from(LOGOS_BUCKET)
    .upload(nombre, bytes, { contentType: mime, upsert: false });
  if (upErr) return { ok: false, error: `No se pudo subir: ${upErr.message}` };

  const { data: pub } = db.storage.from(LOGOS_BUCKET).getPublicUrl(nombre);
  const logoUrl = pub.publicUrl;

  // El UPDATE debe PROBAR que tocó la fila (.select). 0 filas (p. ej. la marca
  // se borró en la carrera) → se revierte el archivo recién subido, sin huérfano.
  const { data: updRow, error: updErr } = await db
    .from("marcas").update({ logo_url: logoUrl }).eq("id", marcaId).select("id").maybeSingle();
  if (updErr || !updRow) {
    await db.storage.from(LOGOS_BUCKET).remove([nombre]); // rollback, sin huérfanos
    return { ok: false, error: updErr?.message ?? "La marca ya no existe." };
  }

  // Ya guardado el nuevo: limpiar el archivo viejo (best-effort).
  if (prevPath && prevPath !== nombre) {
    await db.storage.from(LOGOS_BUCKET).remove([prevPath]);
  }

  revalidatePath("/admin");
  return { ok: true, logoUrl };
}

/** Quita el logo de una marca (borra el archivo y pone logo_url = null). Sólo admin. */
export async function quitarLogoMarca(marcaId: string): Promise<Guardado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!canAdmin(await getViewAs())) return { ok: false, error: "Sólo un admin quita logos." };

  const db = supabaseAdmin();
  const { data: prev } = await db.from("marcas").select("logo_url").eq("id", marcaId).maybeSingle();
  const path = pathEnBucketLogos((prev as { logo_url: string | null } | null)?.logo_url ?? null);

  const { error } = await db.from("marcas").update({ logo_url: null }).eq("id", marcaId);
  if (error) return { ok: false, error: error.message };
  if (path) await db.storage.from(LOGOS_BUCKET).remove([path]);

  revalidatePath("/admin");
  return { ok: true };
}

// ── Marcas: alta y baja (Phase 4) ───────────────────────────
function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type MarcaGuardada = { ok: true; marca: MarcaLogo } | { ok: false; error: string };

/** Crea una marca de un cliente. Respeta unique(client_id, slug). Sólo admin+. */
export async function crearMarca(clientId: string, name: string): Promise<MarcaGuardada> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!canAdmin(await getViewAs())) return { ok: false, error: "Sólo un admin crea marcas." };
  const nombre = name.trim();
  if (!nombre) return { ok: false, error: "Escribe el nombre de la marca." };
  const slug = slugify(nombre);
  if (!slug) return { ok: false, error: "Ese nombre no genera un identificador válido." };

  const { data, error } = await supabaseAdmin()
    .from("marcas")
    .insert({ client_id: clientId, name: nombre, slug })
    .select("id, name, slug, logo_url")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ya existe una marca con ese nombre en este cliente." };
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin");
  return { ok: true, marca: data as MarcaLogo };
}

/** Borra una marca. Sólo admin+. Los FK de la marca son SET NULL (ideas) / CASCADE
 *  (snippets, reglas), así que un delete "tiene éxito" aunque haya cosas colgando y
 *  se pierden en silencio — por eso se BLOQUEA a nivel app si la marca está en uso. */
export async function eliminarMarca(marcaId: string): Promise<Guardado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!canAdmin(await getViewAs())) return { ok: false, error: "Sólo un admin borra marcas." };

  const db = supabaseAdmin();
  const [ideas, snippets, reglas] = await Promise.all([
    db.from("ideas").select("id", { count: "exact", head: true }).eq("marca_id", marcaId),
    db.from("snippets").select("id", { count: "exact", head: true }).eq("marca_id", marcaId),
    db.from("reglas").select("id", { count: "exact", head: true }).eq("marca_id", marcaId),
  ]);
  const enUso = (ideas.count ?? 0) + (snippets.count ?? 0) + (reglas.count ?? 0);
  if (enUso > 0) {
    return { ok: false, error: "Esta marca tiene tareas, legales o reglas — quítalos antes de borrarla." };
  }

  const { error } = await db.from("marcas").delete().eq("id", marcaId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Borra a una persona del equipo (hard delete). Guarda: un admin borra miembros
 * regulares, pero SÓLO el Master Builder borra a otro admin/master. Si la persona
 * tiene historial referenciado, se bloquea y se sugiere desactivarla.
 */
export async function eliminarMiembro(id: string): Promise<Guardado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const rol = await getViewAs();
  if (!canAdmin(rol)) return { ok: false, error: "Sólo un admin borra personas." };

  const db = supabaseAdmin();
  const { data: target } = await db
    .from("track_members")
    .select("role")
    .eq("id", id)
    .maybeSingle<{ role: string }>();
  if (!target) return { ok: false, error: "Esa persona ya no existe." };
  if (ROLES_SOLO_MASTER.has(String(target.role)) && !canAssignAdmins(rol)) {
    return { ok: false, error: "Sólo el Master Builder puede borrar a un admin." };
  }

  // Sus FK son CASCADE/SET NULL: borrar "tiene éxito" aunque tenga trabajo o autoría,
  // y se pierde en silencio (asignaciones borradas, autoría desligada). Se bloquea a
  // nivel app si tiene historial; para eso está el toggle "desactivar".
  const [asigs, edits] = await Promise.all([
    db.from("idea_assignments").select("id", { count: "exact", head: true }).eq("member_id", id),
    db.from("field_edits").select("id", { count: "exact", head: true }).eq("member_id", id),
  ]);
  if ((asigs.count ?? 0) + (edits.count ?? 0) > 0) {
    return { ok: false, error: "Esta persona tiene tareas o autoría — desactívala en vez de borrarla." };
  }

  const { error } = await db.from("track_members").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

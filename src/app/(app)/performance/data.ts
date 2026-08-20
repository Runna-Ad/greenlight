import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { STATUS_LABEL, STATUS_TOKEN, type AssetStatus } from "@/lib/brand";
import type { WorkloadMember } from "@/components/workload/workload-board";
import type { PillStatus } from "@/components/ui/pill";
import type { Track } from "@/lib/vocab";
import {
  evaluarEquipo,
  atribuirAutor,
  type EvalMiembro,
  type Periodo,
  type AsignacionInput,
  type AutoriaInput,
  type CorreccionInput,
  type EditInput,
  type IdeaInput,
  type MiembroInput,
} from "@/lib/evaluacion";

// ── Carga (Workload) — movida aquí desde /workload (ahora sub-tab de Performance) ──
// "Activa" = asignada y NO publicada/entregada. Se cuenta en JS sobre queries
// pequeñas (mismo patrón que listarEquipo, evita el embedding de PostgREST).
const TERMINALES = new Set<string>(["published", "delivered"]);
const ESTADOS_ACTIVOS: AssetStatus[] = [
  "todo",
  "in_progress",
  "under_review",
  "in_corrections",
  "completed",
];

export async function cargarWorkload(): Promise<WorkloadMember[]> {
  if (!hasSupabase()) return [];
  const db = supabaseAdmin();

  const [{ data: miembros }, { data: asigs }, { data: ideas }, { data: briefs }, { data: clients }] =
    await Promise.all([
      db
        .from("track_members")
        .select("id, name, track, color, es_lead")
        .eq("active", true)
        .order("track", { ascending: true })
        .order("sort_order", { ascending: true }),
      db.from("idea_assignments").select("member_id, idea_id"),
      // Filtro de estado en SQL, no en JS: el enum sólo tiene 7 valores y ESTADOS_ACTIVOS
      // == exactamente el complemento de TERMINALES (published/delivered), así que esto
      // es equivalente al `!TERMINALES.has()` de abajo — sin traer ideas terminales (la
      // tabla que más crece con el histórico). Verificado contra el enum (reap perf).
      db.from("ideas").select("id, status, brief_id").in("status", ESTADOS_ACTIVOS),
      db.from("briefs").select("id, client_id"),
      db.from("clients").select("id, name, slug, brand_color"),
    ]);

  const ideaById = new Map(
    ((ideas ?? []) as { id: string; status: string; brief_id: string }[]).map((i) => [i.id, i]),
  );
  const briefClient = new Map(
    ((briefs ?? []) as { id: string; client_id: string }[]).map((b) => [b.id, b.client_id]),
  );
  const clientById = new Map(
    ((clients ?? []) as { id: string; name: string; slug: string; brand_color: string }[]).map((c) => [
      c.id,
      c,
    ]),
  );

  type Acc = { total: number; porEstado: Record<string, number>; porCliente: Map<string, number> };
  const acc = new Map<string, Acc>();
  for (const a of (asigs ?? []) as { member_id: string | null; idea_id: string }[]) {
    if (!a.member_id) continue;
    const idea = ideaById.get(a.idea_id);
    if (!idea || TERMINALES.has(idea.status)) continue;
    const m: Acc = acc.get(a.member_id) ?? { total: 0, porEstado: {}, porCliente: new Map() };
    m.total += 1;
    m.porEstado[idea.status] = (m.porEstado[idea.status] ?? 0) + 1;
    const cid = briefClient.get(idea.brief_id);
    if (cid) m.porCliente.set(cid, (m.porCliente.get(cid) ?? 0) + 1);
    acc.set(a.member_id, m);
  }

  return ((miembros ?? []) as {
    id: string;
    name: string;
    track: "real" | "normal";
    color: string;
    es_lead: boolean;
  }[]).map((mem) => {
    const d = acc.get(mem.id);
    return {
      id: mem.id,
      name: mem.name,
      track: mem.track,
      color: mem.color,
      es_lead: mem.es_lead,
      total: d?.total ?? 0,
      porEstado: ESTADOS_ACTIVOS.filter((s) => (d?.porEstado[s] ?? 0) > 0).map((s) => ({
        token: STATUS_TOKEN[s] as PillStatus,
        label: STATUS_LABEL[s],
        count: d!.porEstado[s],
      })),
      porCliente: d
        ? [...d.porCliente]
            .map(([cid, n]) => {
              const c = clientById.get(cid);
              return { name: c?.name ?? "?", slug: c?.slug ?? "", color: c?.brand_color ?? "#775cbf", count: n };
            })
            .sort((x, y) => y.count - x.count)
        : [],
    };
  });
}

/** Etiqueta de un brief: "Brief DD/MM" (por fecha), o su nombre, o su código. */
function briefLabelDe(b: { brief_name: string | null; code: string | null; brief_date: string | null }): string {
  if (b.brief_date) {
    const d = new Date(b.brief_date);
    if (!Number.isNaN(d.getTime()))
      return `Brief ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return b.brief_name || b.code || "Brief";
}

// ── Evaluación ──
/**
 * Devuelve la Evaluación por especialista para el periodo. `tracks` = equipos
 * visibles (null = todos; el lead pasa sólo el suyo). Sólo se evalúan miembros
 * con rol 'creative' (los especialistas) — leads/admins no son la fuerza que se
 * califica. Se traen queries chicas y se juntan en la lib pura `evaluarEquipo`.
 */
export async function cargarEvaluacion(
  tracks: Track[] | null,
  periodo: Periodo,
): Promise<EvalMiembro[]> {
  if (!hasSupabase()) return [];
  // tracks=[] = un lead SIN identidad (soy) — no puede acotar a "su equipo", así
  // que no ve a nadie. Se corta antes de un `.in("track", [])` (comportamiento
  // indefinido en PostgREST) — mejor vacío explícito.
  if (tracks && tracks.length === 0) return [];
  const db = supabaseAdmin();

  let qMiembros = db
    .from("track_members")
    .select("id, name, color, track")
    .eq("active", true)
    .eq("role", "creative")
    .order("name", { ascending: true });
  if (tracks) qMiembros = qMiembros.in("track", tracks);

  // La UNIDAD del reporte es la tarea APROBADA dentro del mes: se traen primero
  // esas ideas y todo lo demás se acota a ellas (queries chicas, no toda la
  // historia). completed_at es inmutable → el mes es reproducible.
  const [{ data: miembros }, { data: ideasP }] = await Promise.all([
    qMiembros,
    db
      .from("ideas")
      .select("id, completed_at, brief_id, naming_base, code")
      .not("completed_at", "is", null)
      .gte("completed_at", periodo.desde)
      .lt("completed_at", periodo.hasta),
  ]);

  const ideasRows = (ideasP ?? []) as {
    id: string;
    completed_at: string | null;
    brief_id: string;
    naming_base: string | null;
    code: string | null;
  }[];
  const ideaIds = ideasRows.map((i) => i.id);
  const briefIdsUniq = [...new Set(ideasRows.map((i) => i.brief_id).filter(Boolean))];

  const [asigs, corrs, edits, briefsData] = ideaIds.length
    ? await Promise.all([
        db
          .from("idea_assignments")
          .select("idea_id, member_id, assigned_at")
          .in("idea_id", ideaIds)
          .then((r) => r.data ?? []),
        db
          .from("comments")
          .select(
            "idea_id, categoria, ronda, target_tabla, target_fila_id, target_campo, created_at, atendido_at, hue_aplicado_at",
          )
          .eq("kind", "correction_request")
          .in("idea_id", ideaIds)
          .then((r) => r.data ?? []),
        db
          .from("field_edits")
          .select("idea_id, tabla, fila_id, campo, member_id, at")
          .in("idea_id", ideaIds)
          // Orden estable: la atribución "última edición <= T" debe ser
          // reproducible aun con ediciones en el mismo milisegundo.
          .order("at", { ascending: true })
          .order("id", { ascending: true })
          .then((r) => r.data ?? []),
        // Etiquetas de los briefs de estas tareas (para el desglose por brief).
        db
          .from("briefs")
          .select("id, brief_name, code, brief_date")
          .in("id", briefIdsUniq)
          .then((r) => r.data ?? []),
      ])
    : [[], [], [], []];

  const labelDe = new Map<string, string>();
  for (const b of briefsData as { id: string; brief_name: string | null; code: string | null; brief_date: string | null }[]) {
    labelDe.set(b.id, briefLabelDe(b));
  }

  const miembrosIn: MiembroInput[] = ((miembros ?? []) as {
    id: string;
    name: string;
    color: string;
    track: Track;
  }[]).map((m) => ({ id: m.id, name: m.name, color: m.color, track: m.track }));

  // Ediciones = la AUTORÍA (quién escribió cada sección). Sólo las que tienen autor.
  const editsIn: EditInput[] = (edits as {
    idea_id: string;
    tabla: string;
    fila_id: string | null;
    campo: string;
    member_id: string | null;
    at: string;
  }[])
    .filter((e) => e.member_id)
    .map((e) => ({
      ideaId: e.idea_id,
      tabla: e.tabla,
      filaId: e.fila_id,
      campo: e.campo,
      memberId: e.member_id as string,
      at: e.at,
    }));

  // Autoría por tarea: pares distintos (idea, miembro) que editaron algo.
  const vistos = new Set<string>();
  const autoria: AutoriaInput[] = [];
  for (const e of editsIn) {
    const k = `${e.ideaId}|${e.memberId}`;
    if (!vistos.has(k)) {
      vistos.add(k);
      autoria.push({ ideaId: e.ideaId, memberId: e.memberId });
    }
  }

  // Correcciones crudas (con destino + hora) → atribuidas al autor de su sección.
  // reworkFallido = el lead aplicó H.Ü.E (hue_aplicado_at) sobre una nota YA atendida
  // (atendido_at) → el arreglo del especialista fue incompleto (criterio "Resolución").
  const correccionesRaw: CorreccionInput[] = (corrs as {
    idea_id: string;
    categoria: string | null;
    ronda: number | null;
    target_tabla: string | null;
    target_fila_id: string | null;
    target_campo: string | null;
    created_at: string;
    atendido_at: string | null;
    hue_aplicado_at: string | null;
  }[]).map((c) => ({
    ideaId: c.idea_id,
    categoria: c.categoria,
    ronda: c.ronda,
    tabla: c.target_tabla,
    filaId: c.target_fila_id,
    campo: c.target_campo,
    createdAt: c.created_at,
    reworkFallido: !!c.hue_aplicado_at && !!c.atendido_at,
  }));
  const correcciones = atribuirAutor(correccionesRaw, editsIn);

  const asigsIn: AsignacionInput[] = (asigs as {
    idea_id: string;
    member_id: string | null;
    assigned_at: string | null;
  }[])
    .filter((a) => a.member_id)
    .map((a) => ({ ideaId: a.idea_id, memberId: a.member_id as string, assignedAt: a.assigned_at }));

  const ideasIn: IdeaInput[] = ideasRows.map((i) => ({
    id: i.id,
    completedAt: i.completed_at,
    briefId: i.brief_id,
    briefLabel: labelDe.get(i.brief_id) ?? "Brief",
    code: i.naming_base ?? i.code ?? null,
  }));

  return evaluarEquipo(miembrosIn, autoria, correcciones, asigsIn, ideasIn, periodo);
}

// ── Periodo (mes) ──
/**
 * Resuelve el periodo a partir de `?mes=YYYY-MM` (o el mes actual). Fronteras en
 * UTC — v1; suficiente para un reporte mensual. Devuelve también la etiqueta y el
 * id del mes anterior/siguiente para la navegación.
 */
export function resolverMes(mes: string | null): {
  periodo: Periodo;
  etiqueta: string;
  mesActual: string;
  mesPrev: string;
  mesNext: string;
} {
  const hoy = new Date();
  const valido = mes && /^\d{4}-\d{2}$/.test(mes);
  const y = valido ? Number(mes!.slice(0, 4)) : hoy.getUTCFullYear();
  const m = valido ? Number(mes!.slice(5, 7)) : hoy.getUTCMonth() + 1; // 1–12

  const id = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}`;
  const desde = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const hasta = new Date(Date.UTC(y, m, 1)).toISOString();
  const etiqueta = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return {
    periodo: { desde, hasta },
    etiqueta,
    mesActual: id(y, m),
    mesPrev: m === 1 ? id(y - 1, 12) : id(y, m - 1),
    mesNext: m === 12 ? id(y + 1, 1) : id(y, m + 1),
  };
}

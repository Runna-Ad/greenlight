import { Lock } from "lucide-react";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getViewAs } from "@/lib/view-as";
import { ROLE_LABEL, canSee } from "@/lib/roles";
import { EntregasBoard, type BriefArchivo } from "@/components/entregas/entregas-board";

// Entregas = ARCHIVO: registro COMPLETO de todo el trabajo Greenlit (delivered),
// agrupado por brief para consulta/reapertura. Lo que sigue con el cliente / en cambios
// vive en el TABLERO; las Greenlit recientes también salen ahí (columna Greenlit ≤7d),
// pero el archivo las tiene TODAS (Pedro: registro completo).

const fmtFecha = (iso: string | null): string | null =>
  iso ? new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : null;

/** Etiqueta del brief: "Brief DD/MM" (por fecha), o su nombre, o su código. */
function briefLabel(b: { brief_name: string | null; code: string | null; brief_date: string | null }): string {
  if (b.brief_date) {
    const d = new Date(b.brief_date);
    return `Brief ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return b.brief_name || b.code || "Brief";
}

async function cargarArchivo(): Promise<BriefArchivo[]> {
  if (!hasSupabase()) return [];
  const db = supabaseAdmin();
  // TODO el trabajo Greenlit (delivered), más reciente primero. Cota de seguridad de
  // 1000 (deuda: paginar si el archivo llega a crecer tanto — reap "sin caps silenciosos").
  const { data: ideas } = await db
    .from("ideas")
    .select("id, code, naming_base, brief_id, delivered_at")
    .eq("status", "delivered")
    .not("delivered_at", "is", null)
    .order("delivered_at", { ascending: false })
    .limit(1000);
  const rows = (ideas ?? []) as {
    id: string;
    code: string | null;
    naming_base: string | null;
    brief_id: string;
    delivered_at: string | null;
  }[];
  if (!rows.length) return [];

  // Lookups acotados a lo cargado (reap perf): briefs/asignaciones por id; clients/miembros
  // son tablas de referencia pequeñas.
  const briefIds = [...new Set(rows.map((r) => r.brief_id))];
  const ideaIds = rows.map((r) => r.id);
  const [{ data: briefs }, { data: clients }, { data: asigs }, { data: miembros }] =
    await Promise.all([
      db.from("briefs").select("id, brief_name, code, brief_date, client_id").in("id", briefIds),
      db.from("clients").select("id, name, slug, brand_color"),
      db.from("idea_assignments").select("member_id, idea_id").in("idea_id", ideaIds),
      db.from("track_members").select("id, name, color"),
    ]);

  const briefById = new Map(
    ((briefs ?? []) as {
      id: string;
      brief_name: string | null;
      code: string | null;
      brief_date: string | null;
      client_id: string;
    }[]).map((b) => [b.id, b]),
  );
  const clientById = new Map(
    ((clients ?? []) as { id: string; name: string; slug: string; brand_color: string | null }[]).map((c) => [c.id, c]),
  );
  const memberById = new Map(
    ((miembros ?? []) as { id: string; name: string; color: string }[]).map((m) => [m.id, m]),
  );
  const asigsByIdea = new Map<string, { name: string; color: string }[]>();
  for (const a of (asigs ?? []) as { member_id: string | null; idea_id: string }[]) {
    if (!a.member_id) continue;
    const m = memberById.get(a.member_id);
    if (!m) continue;
    (asigsByIdea.get(a.idea_id) ?? asigsByIdea.set(a.idea_id, []).get(a.idea_id)!).push({
      name: m.name,
      color: m.color,
    });
  }

  // Bundle por brief. rows viene delivered_at desc → cada brief se ve por primera vez en
  // su tarea más reciente, así que el orden de inserción del Map = briefs por recencia.
  const porBrief = new Map<string, BriefArchivo>();
  for (const r of rows) {
    const brief = briefById.get(r.brief_id);
    if (!brief) continue;
    const cli = clientById.get(brief.client_id);
    if (!porBrief.has(r.brief_id)) {
      porBrief.set(r.brief_id, {
        briefId: r.brief_id,
        briefLabel: briefLabel(brief),
        clienteName: cli?.name ?? "Sin cliente",
        clienteColor: cli?.brand_color ?? "#775cbf",
        clienteSlug: cli?.slug ?? "?",
        tareas: [],
      });
    }
    porBrief.get(r.brief_id)!.tareas.push({
      id: r.id,
      code: r.code,
      namingBase: r.naming_base,
      greenlitEl: fmtFecha(r.delivered_at),
      asignados: asigsByIdea.get(r.id) ?? [],
    });
  }

  return [...porBrief.values()];
}

export default async function EntregasPage() {
  // Entregas es sólo para leads y arriba — un especialista no entra (ni por URL).
  const role = await getViewAs();
  if (!canSee(role, "entregas")) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
        <Lock className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-3 text-sm text-foreground">Un {ROLE_LABEL[role]} no entra a Entregas.</p>
      </div>
    );
  }

  const briefs = await cargarArchivo();
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <p className="gl-eyebrow">Entregas</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Archivo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todo el trabajo Greenlit (aprobado por el cliente), agrupado por brief. Las recientes también
          están en el tablero, en la columna Greenlit. Ábrelas para consultarlas o reabrirlas.
        </p>
      </header>
      <EntregasBoard briefs={briefs} />
    </div>
  );
}

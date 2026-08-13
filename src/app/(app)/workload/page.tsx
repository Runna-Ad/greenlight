import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { STATUS_LABEL, STATUS_TOKEN, type AssetStatus } from "@/lib/brand";
import { WorkloadBoard, type WorkloadMember } from "@/components/workload/workload-board";
import type { PillStatus } from "@/components/ui/pill";

// "Activa" = asignada y NO publicada/entregada (mismo criterio que la carga del
// panel de Equipo). Se muestran estos estados en el desglose, en este orden.
const TERMINALES = new Set<string>(["published", "delivered"]);
const ESTADOS_ACTIVOS: AssetStatus[] = [
  "todo",
  "in_progress",
  "under_review",
  "in_corrections",
  "completed",
];

// Carga viva por persona, desglosada por estado y por cliente. Se cuenta en JS
// sobre queries pequeñas (mismo patrón que listarEquipo, evita el embedding de
// PostgREST).
async function cargarWorkload(): Promise<WorkloadMember[]> {
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
      db.from("ideas").select("id, status, brief_id"),
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

export default async function WorkloadPage() {
  const miembros = await cargarWorkload();
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <p className="gl-eyebrow">Equipo</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Workload</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Carga viva de cada persona para balancear asignaciones — por estado y por cliente.
        </p>
      </header>
      <WorkloadBoard miembros={miembros} />
    </div>
  );
}

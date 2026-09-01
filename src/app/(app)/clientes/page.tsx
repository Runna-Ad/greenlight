import Link from "next/link";
import { ArrowRight, Plus, FileText, Layers, AlertTriangle, Lock } from "lucide-react";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getViewAs } from "@/lib/view-as";
import { getCurrentUser } from "@/lib/identity";
import { canSee, tracksVisibles, ROLE_LABEL } from "@/lib/roles";
import type { Track } from "@/lib/vocab";

// Counts are LIVE from the DB — never hardcode them. The old MOCK_CLIENTS froze
// DiDi at 4/37/3 and survived a full platform reset, showing phantom work.
// Definitions mirror the rest of the app:
//   · briefs    = briefs en curso (draft/active) — no delivered ni archived.
//   · abiertos  = ideas NO terminales (mirror TERMINALES en performance/data.ts).
//   · atrasados = esas ideas abiertas con due_date ya vencido.
export const dynamic = "force-dynamic";

// Estados "abiertos" de una idea = los 5 no terminales (todo lo que no es
// published/delivered). Mismo conjunto que ESTADOS_ACTIVOS en performance/data.ts.
const OPEN_IDEA_STATES = [
  "todo",
  "in_progress",
  "under_review",
  "in_corrections",
  "completed",
];
const INFLIGHT_BRIEF = ["draft", "active"];

type ClientCard = {
  slug: string;
  name: string;
  tagline: string | null;
  brandColor: string;
  initial: string;
  briefs: number;
  abiertos: number;
  atrasados: number;
};

async function cargarClientes(tracks: Track[] | null): Promise<ClientCard[]> {
  if (!hasSupabase()) return [];
  const db = supabaseAdmin();

  const { data: clientsRaw } = await db
    .from("clients")
    .select("id, slug, name, tagline, brand_color")
    .eq("active", true)
    .order("name");
  const clients = (clientsRaw ?? []) as {
    id: string;
    slug: string;
    name: string;
    tagline: string | null;
    brand_color: string | null;
  }[];
  if (!clients.length) return [];

  const clientIds = clients.map((c) => c.id);

  // Briefs de estos clientes + todas las ideas ABIERTAS (ideas no tiene client_id;
  // se mapea vía brief_id → briefs.client_id). Cota de 5000 en ideas abiertas
  // (deuda: paginar/agregar en SQL si el volumen abierto llega a crecer tanto).
  // Un lead DEPARTAMENTAL sólo cuenta el trabajo (ideas) de su(s) track(s) otorgado(s):
  // tracksVisibles da null=admin/master (cuentan todo) o el grant del lead (1 o 2 tracks) —
  // un lead de AMBOS tracks cuenta ambos, uno de un solo track sólo el suyo. Sin esto, los
  // conteos abiertos/atrasados sumaban AMBOS tracks y un lead de un solo track veía cuánto
  // del OTRO tenía cada cliente. Los briefs NO llevan track (un brief puede tener trabajo de
  // cualquier track) → su cuenta queda a nivel cliente. (reap track-scope)
  let ideasQ = db
    .from("ideas")
    .select("brief_id, due_date, status")
    .in("status", OPEN_IDEA_STATES)
    .is("deleted_at", null); // papelera 0057: no se cuenta lo borrado
  if (tracks) ideasQ = ideasQ.in("track", tracks);
  const [{ data: briefsRaw }, { data: ideasRaw }] = await Promise.all([
    db.from("briefs").select("id, client_id, status").in("client_id", clientIds).is("deleted_at", null),
    ideasQ.limit(5000),
  ]);
  const briefs = (briefsRaw ?? []) as { id: string; client_id: string; status: string }[];
  const ideas = (ideasRaw ?? []) as {
    brief_id: string;
    due_date: string | null;
    status: string;
  }[];

  const clientByBrief = new Map(briefs.map((b) => [b.id, b.client_id]));
  const hoy = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (vencido = due_date < hoy)

  const briefCt = new Map<string, number>();
  const abiertosCt = new Map<string, number>();
  const atrasadosCt = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const b of briefs) {
    if (INFLIGHT_BRIEF.includes(b.status)) bump(briefCt, b.client_id);
  }
  for (const i of ideas) {
    const cid = clientByBrief.get(i.brief_id);
    if (!cid) continue; // idea de un brief de cliente inactivo/desconocido
    bump(abiertosCt, cid);
    if (i.due_date && i.due_date < hoy) bump(atrasadosCt, cid);
  }

  return clients.map((c) => ({
    slug: c.slug,
    name: c.name,
    tagline: c.tagline,
    brandColor: c.brand_color || "#775cbf",
    initial: (c.name.trim()[0] ?? "?").toUpperCase(),
    briefs: briefCt.get(c.id) ?? 0,
    abiertos: abiertosCt.get(c.id) ?? 0,
    atrasados: atrasadosCt.get(c.id) ?? 0,
  }));
}

export default async function ClientesPage() {
  // Guard de ruta (no sólo nav): un rol sin acceso no debe recibir el índice de
  // clientes por teclear la URL. El middleware ya amarra al cliente a su portal;
  // esto lo respalda (creative/client → Denegado). (reap pre-launch)
  const role = await getViewAs();
  if (!canSee(role, "clientes")) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
        <Lock className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-3 text-sm text-foreground">Un {ROLE_LABEL[role]} no entra a Clientes.</p>
      </div>
    );
  }

  // Scope por track del que MIRA: admin/master → null (todos), lead → su grant (1 o 2).
  const u = await getCurrentUser();
  const tracksVis = tracksVisibles(role, u?.member?.tracks ?? null);
  const clientes = await cargarClientes(tracksVis);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
          La entrada
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Elige un cliente
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Cada cliente tiene su propio espacio: sus briefs, su tablero, su equipo
          asignado, sus instrucciones y legales. Nada se mezcla entre clientes.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clientes.map((client) => (
          <Link
            key={client.slug}
            href={`/${client.slug}/tablero`}
            className="group gl-card-interactive flex flex-col p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center gap-3">
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white font-[family-name:var(--font-poppins)]"
                style={{ backgroundColor: client.brandColor }}
              >
                {client.initial}
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-foreground">
                  {client.name}
                </h3>
                <p className="truncate text-xs text-muted-foreground">
                  {client.tagline}
                </p>
              </div>
              <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4">
              <Stat icon={FileText} value={client.briefs} label="briefs" />
              <Stat icon={Layers} value={client.abiertos} label="abiertos" />
              <Stat
                icon={AlertTriangle}
                value={client.atrasados}
                label="atrasados"
                alert={client.atrasados > 0}
              />
            </div>
          </Link>
        ))}

        <button
          type="button"
          className="flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-transparent p-5 text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-6" />
          <span className="text-sm font-medium">Nuevo cliente</span>
          <span className="text-xs text-muted-foreground">Se agrega desde Admin</span>
        </button>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  alert = false,
}: {
  icon: typeof FileText;
  value: number;
  label: string;
  alert?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon
        className={`size-3.5 ${alert ? "text-status-corrections" : "text-muted-foreground"}`}
      />
      <span
        className={`text-lg font-semibold tabular-nums font-[family-name:var(--font-poppins)] ${
          alert ? "text-status-corrections" : "text-foreground"
        }`}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

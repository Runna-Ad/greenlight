import { Lock } from "lucide-react";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getViewAs } from "@/lib/view-as";
import { ROLE_LABEL, canSee } from "@/lib/roles";
import {
  EntregasBoard,
  type ClienteEntregas,
  type Entrega,
  type EstadoEntrega,
} from "@/components/entregas/entregas-board";

// El bucket de una entrega según su estado ACTUAL. published_at ya está set (la
// query filtra por eso = "llegó al cliente"). delivered = cerrada; published =
// con el cliente; cualquier otro estado de trabajo = volvió a cambios/rework.
function bucket(status: string): EstadoEntrega {
  if (status === "delivered") return "entregado";
  if (status === "published") return "con_cliente";
  return "en_cambios";
}

const fmtFecha = (iso: string | null): string | null =>
  iso ? new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : null;

async function cargarEntregas(): Promise<ClienteEntregas[]> {
  if (!hasSupabase()) return [];
  const db = supabaseAdmin();

  // Sólo lo que YA se envió al cliente (published_at set), en cualquier estado.
  const { data: ideas } = await db
    .from("ideas")
    .select("id, code, naming_base, status, brief_id, entrega_num, entrega_url, published_at")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false });

  const rows = (ideas ?? []) as {
    id: string;
    code: string | null;
    naming_base: string | null;
    status: string;
    brief_id: string;
    entrega_num: string | null;
    entrega_url: string | null;
    published_at: string | null;
  }[];
  if (!rows.length) return [];

  const [{ data: briefs }, { data: clients }, { data: asigs }, { data: miembros }] =
    await Promise.all([
      db.from("briefs").select("id, client_id"),
      db.from("clients").select("id, name, slug, brand_color").order("name"),
      db.from("idea_assignments").select("member_id, idea_id"),
      db.from("track_members").select("id, name, color"),
    ]);

  const briefClient = new Map(
    ((briefs ?? []) as { id: string; client_id: string }[]).map((b) => [b.id, b.client_id]),
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

  // Agrupa las entregas por cliente, preservando el orden por-cliente y el orden
  // de las tareas (published_at desc, ya venían así).
  const porCliente = new Map<string, ClienteEntregas>();
  for (const r of rows) {
    const clientId = briefClient.get(r.brief_id);
    const cli = clientId
      ? ((clients ?? []) as { id: string; name: string; slug: string; brand_color: string }[]).find(
          (c) => c.id === clientId,
        )
      : undefined;
    const slug = cli?.slug ?? "?";
    if (!porCliente.has(slug)) {
      porCliente.set(slug, {
        slug,
        name: cli?.name ?? "Sin cliente",
        color: cli?.brand_color ?? "#775cbf",
        entregas: [],
      });
    }
    const entrega: Entrega = {
      id: r.id,
      code: r.code,
      namingBase: r.naming_base,
      entregaNum: r.entrega_num,
      entregaUrl: r.entrega_url,
      estado: bucket(r.status),
      enviadaEl: fmtFecha(r.published_at),
      asignados: asigsByIdea.get(r.id) ?? [],
    };
    porCliente.get(slug)!.entregas.push(entrega);
  }

  return [...porCliente.values()];
}

export default async function EntregasPage() {
  // Entregas es sólo para leads y arriba — un especialista no entra (ni por URL).
  const role = await getViewAs();
  if (!canSee(role, "entregas")) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
        <Lock className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-3 text-sm text-foreground">
          Un {ROLE_LABEL[role]} no entra a Entregas.
        </p>
      </div>
    );
  }

  const clientes = await cargarEntregas();
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <p className="gl-eyebrow">Entregas</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Entregas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todo lo enviado al cliente y su estado — con el cliente, en cambios, o entregado.
        </p>
      </header>
      <EntregasBoard clientes={clientes} />
    </div>
  );
}

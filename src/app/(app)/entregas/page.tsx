import { Lock } from "lucide-react";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { ROLE_LABEL, canSee, canAdmin, tracksVisibles } from "@/lib/roles";
import type { Track } from "@/lib/vocab";
import { EntregasBoard, type BriefArchivo } from "@/components/entregas/entregas-board";
import { paquetesDeTareas } from "@/lib/paquetes-data";
import { agruparArchivo } from "@/lib/entregas-archivo";

// Entregas = ARCHIVO: registro COMPLETO de todo el trabajo Greenlit (delivered),
// agrupado por brief (Real y Normal del mismo día juntos) y por paquete, para consulta/reapertura. Lo que sigue con el cliente / en cambios
// vive en el TABLERO; las Greenlit recientes también salen ahí (columna Greenlit ≤7d),
// pero el archivo las tiene TODAS (Pedro: registro completo).

const fmtFecha = (iso: string | null): string | null =>
  iso ? new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : null;

async function cargarArchivo(tracks: Track[] | null): Promise<BriefArchivo[]> {
  if (!hasSupabase()) return [];
  const db = supabaseAdmin();
  // TODO el trabajo Greenlit (delivered), más reciente primero. Cota de seguridad de
  // 1000 (deuda: paginar si el archivo llega a crecer tanto — reap "sin caps silenciosos").
  // Acotado por track: `null` = todos (admin/master); un lead ve sólo su(s) track(s)
  // (grant multi-track) — antes veía el archivo de AMBOS equipos. (reap S4)
  let q = db
    .from("ideas")
    .select("id, code, naming_base, brief_id, track, delivered_at")
    .eq("status", "delivered")
    .not("delivered_at", "is", null)
    .is("deleted_at", null) // papelera 0057: lo borrado sale también del ARCHIVO
    .order("delivered_at", { ascending: false })
    .limit(1000);
  if (tracks) q = q.in("track", tracks);
  const { data: ideas } = await q;
  const rows = (ideas ?? []) as {
    id: string;
    code: string | null;
    naming_base: string | null;
    brief_id: string;
    track: string | null;
    delivered_at: string | null;
  }[];
  if (!rows.length) return [];

  // Lookups acotados a lo cargado (reap perf): briefs/asignaciones por id; clients/miembros
  // son tablas de referencia pequeñas.
  const briefIds = [...new Set(rows.map((r) => r.brief_id))];
  const ideaIds = rows.map((r) => r.id);
  const [{ data: briefs }, { data: clients }, { data: asigs }, { data: miembros }, { data: stars }, paqDe] =
    await Promise.all([
      db.from("briefs").select("id, brief_name, code, brief_date, client_id").in("id", briefIds),
      db.from("clients").select("id, name, slug, brand_color"),
      db.from("idea_assignments").select("member_id, idea_id").in("idea_id", ideaIds),
      db.from("track_members").select("id, name, color"),
      db.from("hue_top_performers").select("idea_id").in("idea_id", ideaIds),
      paquetesDeTareas(ideaIds),
    ]);
  const starredSet = new Set(((stars ?? []) as { idea_id: string }[]).map((s) => s.idea_id));

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

  // Un card por brief JUNTO (Real + Normal del mismo día) y, adentro, por paquete (fase 2).
  // rows viene delivered_at desc → el brief con la entrega más nueva va primero.
  const cards = agruparArchivo(
    rows.map((r) => ({ ...r, briefId: r.brief_id, paquete: paqDe.get(r.id) ?? null })),
    briefById,
  );
  return cards.map((c) => {
    const cli = clientById.get(c.clientId);
    return {
      briefId: c.llave,
      briefLabel: c.etiqueta,
      desglose: c.desglose,
      clienteName: cli?.name ?? "Sin cliente",
      clienteColor: cli?.brand_color ?? "#775cbf",
      clienteSlug: cli?.slug ?? "?",
      total: c.total,
      grupos: c.grupos.map((g) => ({
        paqueteId: g.paqueteId,
        nombre: g.nombre,
        tareas: g.tareas.map((r) => ({
          id: r.id,
          code: r.code,
          namingBase: r.naming_base,
          track: r.track === "real" ? ("Real" as const) : r.track === "normal" ? ("Normal" as const) : null,
          greenlitEl: fmtFecha(r.delivered_at),
          asignados: asigsByIdea.get(r.id) ?? [],
          starred: starredSet.has(r.id),
        })),
      })),
    };
  });
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

  // Scope por track: un lead ve sólo su(s) equipo(s); admin/master (null) ven todo. (reap S4)
  const soy = await getSoy();
  const briefs = await cargarArchivo(tracksVisibles(role, soy?.tracks ?? null));
  const puedeEstrellar = canAdmin(role);
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <p className="gl-eyebrow">Entregas</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Archivo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todo el trabajo Greenlit (aprobado por el cliente), agrupado por brief y por paquete. Las recientes también
          están en el tablero, en la columna Greenlit. Ábrelas para consultarlas o reabrirlas.
        </p>
        {puedeEstrellar && (
          <p className="mt-1 text-xs text-muted-foreground">
            Marca con la estrella los mejores guiones: alimentan la Biblioteca de Ganadores de H.Ü.E
            (aprende de los patrones de tus ganadores; la estrella la pones tú).
          </p>
        )}
      </header>
      <EntregasBoard briefs={briefs} puedeEstrellar={puedeEstrellar} />
    </div>
  );
}

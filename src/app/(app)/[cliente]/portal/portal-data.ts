import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { plantillaPara } from "@/lib/plantilla";
import { cargarRefsPorPlano, cargarRefsEstatico } from "@/lib/referencias-data";
import type { AssetStatus } from "@/lib/brand";
import type { PlanoVista, EstaticoVista } from "@/components/tarea/preview-slide";
import type { RefVista } from "@/components/tarea/referencias-plano";
import { estadoDeTimestamps, type Correccion } from "@/lib/correcciones";

// El portal muestra SÓLO lo que ya se envió al cliente: published_at != null (el
// mismo criterio que Entregas). Su estado ACTUAL puede ser published (en su
// cancha), in_corrections (pidió cambios) o delivered (aprobado/cerrado).

export type PortalTarea = {
  id: string;
  code: string | null;
  naming: string | null;
  status: AssetStatus;
  marcaName: string | null;
  marcaLogo: string | null;
  /** La tarea volvió al cliente DESPUÉS de una ronda de cambios (published + tiene
   *  client_change enviados). Distingue "vuelve a revisión, ya aplicamos lo que
   *  pediste" de una idea nueva por revisar. */
  reReview: boolean;
};

export type PortalBrief = {
  id: string;
  label: string;
  /** Fecha del brief (ISO) — para agrupar por mes en el selector del portal. null si no tiene. */
  date: string | null;
  tasks: PortalTarea[];
};

export type PortalData = {
  cliente: { name: string; slug: string; logoUrl: string | null; brandColor: string };
  briefs: PortalBrief[];
};

/** La etiqueta de un brief: "Brief DD/MM" (por fecha), o su nombre, o su código. */
function briefLabel(b: { brief_name: string | null; code: string | null; brief_date: string | null }): string {
  if (b.brief_date) {
    const d = new Date(b.brief_date);
    return `Brief ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return b.brief_name || b.code || "Brief";
}

/** Los briefs de un cliente con sus tareas YA enviadas (para revisar). */
export async function cargarPortal(clienteSlug: string): Promise<PortalData | null> {
  if (!hasSupabase()) return null;
  const db = supabaseAdmin();

  const { data: cli } = await db
    .from("clients")
    .select("id, name, slug, logo_url, brand_color")
    .eq("slug", clienteSlug)
    .maybeSingle<{ id: string; name: string; slug: string; logo_url: string | null; brand_color: string | null }>();
  if (!cli) return null;

  const [{ data: briefs }, { data: marcas }] = await Promise.all([
    db.from("briefs").select("id, brief_name, code, brief_date").eq("client_id", cli.id),
    db.from("marcas").select("id, name, logo_url").eq("client_id", cli.id),
  ]);
  const briefRows = (briefs ?? []) as { id: string; brief_name: string | null; code: string | null; brief_date: string | null }[];
  const marcaById = new Map(
    ((marcas ?? []) as { id: string; name: string; logo_url: string | null }[]).map((m) => [m.id, m]),
  );
  const briefIds = briefRows.map((b) => b.id);
  if (!briefIds.length) {
    return {
      cliente: { name: cli.name, slug: cli.slug, logoUrl: cli.logo_url, brandColor: cli.brand_color ?? "#775cbf" },
      briefs: [],
    };
  }

  const { data: ideas } = await db
    .from("ideas")
    .select("id, code, naming_base, status, marca_id, brief_id")
    .in("brief_id", briefIds)
    .not("published_at", "is", null)
    .order("code", { ascending: true });

  const ideaRows = (ideas ?? []) as {
    id: string;
    code: string | null;
    naming_base: string | null;
    status: AssetStatus;
    marca_id: string | null;
    brief_id: string;
  }[];

  // ¿Qué tareas tienen un cambio del cliente YA APLICADO que el portal puede mostrar?
  // El badge "Cambios listos" debe encender SÓLO cuando la vista de la tarea tendrá algo
  // que enseñar — así que este filtro debe ser IDÉNTICO al de `revisiones` en
  // cargarTareaPortal: enviado (ronda!=null) + aplicado (resolved_at!=null) + anclado
  // (target_campo!=null). Si divergen, el badge miente: promete cambios listos y la
  // tarea abre vacía (los client_change legacy sin target de 0036 caían justo ahí).
  const conRonda = new Set<string>();
  if (ideaRows.length) {
    const { data: sent } = await db
      .from("comments")
      .select("idea_id")
      .in("idea_id", ideaRows.map((i) => i.id))
      .eq("kind", "client_change")
      .not("ronda", "is", null)
      .not("resolved_at", "is", null)
      .not("target_campo", "is", null);
    for (const r of (sent ?? []) as { idea_id: string }[]) conRonda.add(r.idea_id);
  }

  const porBrief = new Map<string, PortalTarea[]>();
  for (const i of ideaRows) {
    const m = i.marca_id ? marcaById.get(i.marca_id) : undefined;
    (porBrief.get(i.brief_id) ?? porBrief.set(i.brief_id, []).get(i.brief_id)!).push({
      id: i.id,
      code: i.code,
      naming: i.naming_base,
      status: i.status,
      marcaName: m?.name ?? null,
      marcaLogo: m?.logo_url ?? null,
      reReview: i.status === "published" && conRonda.has(i.id),
    });
  }

  // Sólo briefs CON tareas enviadas; los de más tareas primero.
  const conTareas: PortalBrief[] = briefRows
    .filter((b) => porBrief.has(b.id))
    .map((b) => ({ id: b.id, label: briefLabel(b), date: b.brief_date, tasks: porBrief.get(b.id)! }))
    .sort((a, b) => b.tasks.length - a.tasks.length || a.label.localeCompare(b.label));

  return {
    cliente: { name: cli.name, slug: cli.slug, logoUrl: cli.logo_url, brandColor: cli.brand_color ?? "#775cbf" },
    briefs: conTareas,
  };
}

export type TareaPortal = {
  ideaId: string;
  clienteSlug: string;
  naming: string | null;
  status: AssetStatus;
  tipoAsset: string | null;
  esEstatico: boolean;
  marcaName: string | null;
  marcaLogo: string | null;
  briefLabel: string | null;
  notaGuion: string | null;
  entregaUrl: string | null;
  concepto: string | null;
  trend: string | null;
  plataformas: string[];
  tamanos: string[];
  duracion: string[];
  planos: PlanoVista[];
  estatico: EstaticoVista | null;
  /** Referencias visuales (imágenes firmadas + videos) — el cliente las ve igual que el equipo. */
  refsPorPlano: Record<string, RefVista[]>;
  refsEstatico: RefVista[];
  /** Cambios que el cliente ya fijó y todavía no envía (pins pendientes). */
  cambios: Correccion[];
  /** Cambios que el cliente pidió en rondas PASADAS y el equipo YA aplicó (ronda!=null,
   *  confirmados). Se muestran read-only ("aplicado") para que el cliente vea dónde y
   *  qué se cambió al re-revisar — no lo dejan adivinando. */
  revisiones: Correccion[];
};

type PinRow = {
  id: string;
  body: string;
  target_tabla: string | null;
  target_fila_id: string | null;
  target_campo: string | null;
  target_label: string | null;
  target_quote: string | null;
  target_start: number | null;
  target_end: number | null;
  ronda: number | null;
  atendido_at: string | null;
  resolved_at: string | null;
};

/**
 * Los datos de UNA tarea para la vista de sólo lectura del portal. Guarda que la
 * tarea sea de ESTE cliente y esté enviada (published_at != null); si no, null.
 */
export async function cargarTareaPortal(clienteSlug: string, ideaId: string): Promise<TareaPortal | null> {
  if (!hasSupabase()) return null;
  const db = supabaseAdmin();

  const { data: idea } = await db
    .from("ideas")
    .select(
      "id, naming_base, status, tipo_asset, concepto, trend, plataformas, tamanos, duracion, nota_guion, entrega_url, marca_id, brief_id, published_at",
    )
    .eq("id", ideaId)
    .maybeSingle<{
      id: string;
      naming_base: string | null;
      status: AssetStatus;
      tipo_asset: string | null;
      concepto: string | null;
      trend: string | null;
      plataformas: string[] | null;
      tamanos: string[] | null;
      duracion: string[] | null;
      nota_guion: string | null;
      entrega_url: string | null;
      marca_id: string | null;
      brief_id: string;
      published_at: string | null;
    }>();
  if (!idea || !idea.published_at) return null;

  // La tarea debe pertenecer a ESTE cliente (por su brief).
  const { data: brief } = await db
    .from("briefs")
    .select("brief_name, code, brief_date, client_id, clients(slug)")
    .eq("id", idea.brief_id)
    .maybeSingle<{
      brief_name: string | null;
      code: string | null;
      brief_date: string | null;
      client_id: string;
      clients: { slug: string } | null;
    }>();
  if (!brief || brief.clients?.slug !== clienteSlug) return null;

  const [{ data: marca }, planosRes, estaticoRes, pinsRes, revsRes] = await Promise.all([
    idea.marca_id
      ? db.from("marcas").select("name, logo_url").eq("id", idea.marca_id).maybeSingle<{ name: string; logo_url: string | null }>()
      : Promise.resolve({ data: null }),
    db
      .from("planos")
      .select("id, orden, titulo, accion, copy_in, sfx, gfx, edicion, dialogo, es_cierre")
      .eq("idea_id", idea.id)
      .order("orden")
      .returns<PlanoVista[]>(),
    db
      .from("estaticos")
      .select("id, copy_titulo, copy_subtitulo, copy_cta, legales_extra, referencia_url, referencia_nota")
      .eq("idea_id", idea.id)
      .order("orden")
      .limit(1)
      .maybeSingle<EstaticoVista>(),
    // Los pins del cliente aún SIN ENVIAR (ronda null = borrador) — se pintan como
    // resaltados y se pueden quitar antes de "Pedir cambios". Al enviar se les asigna
    // ronda (0038); enviado ya no es borrador y entra al lifecycle interno.
    db
      .from("comments")
      .select(
        "id, body, target_tabla, target_fila_id, target_campo, target_label, target_quote, target_start, target_end, ronda, atendido_at, resolved_at",
      )
      .eq("idea_id", idea.id)
      .eq("kind", "client_change")
      .is("ronda", null)
      // Sólo pins ANCLADOS (0037): los client_change de texto libre legacy (0036, sin
      // target) no son pins que el cliente pueda ver/quitar — no inflan el conteo.
      .not("target_campo", "is", null)
      .order("created_at")
      .returns<PinRow[]>(),
    // Los cambios YA ENVIADOS (ronda!=null) — las rondas pasadas que el equipo atendió.
    // Anclados (con target) para poder ubicarlos en un campo. Read-only: son el registro
    // de "qué pediste y ya se aplicó". Se agrupan por ronda en el panel/campo.
    db
      .from("comments")
      .select(
        "id, body, target_tabla, target_fila_id, target_campo, target_label, target_quote, target_start, target_end, ronda, atendido_at, resolved_at",
      )
      .eq("idea_id", idea.id)
      .eq("kind", "client_change")
      .not("ronda", "is", null)
      // Sólo los YA APLICADOS (confirmados por el equipo). Un sent aún sin resolver
      // (la ronda en curso durante in_corrections) NO es "aplicado" — no se muestra
      // como tal. En published (re-revisión) el gate garantiza que todos estén resueltos.
      .not("resolved_at", "is", null)
      .not("target_campo", "is", null)
      .order("created_at")
      .returns<PinRow[]>(),
  ]);

  const planos = (planosRes.data ?? []) as PlanoVista[];
  const estatico = (estaticoRes.data ?? null) as EstaticoVista | null;
  const esEstatico = plantillaPara(idea.tipo_asset) === "estatico";
  // Referencias visuales, firmadas por render (bucket privado). El cliente ve la
  // misma dirección visual que el equipo — antes el portal las ocultaba.
  const refsPorPlano = !esEstatico ? await cargarRefsPorPlano(db, planos.map((p) => p.id)) : {};
  const refsEstatico = esEstatico && estatico ? await cargarRefsEstatico(db, estatico.id) : [];

  const aCorreccion = (r: PinRow): Correccion => ({
    id: r.id,
    targetTabla: r.target_tabla,
    targetFilaId: r.target_fila_id,
    targetCampo: r.target_campo,
    targetLabel: r.target_label,
    targetQuote: r.target_quote,
    targetStart: r.target_start,
    targetEnd: r.target_end,
    body: r.body,
    autor: null,
    ronda: r.ronda ?? 1,
    estado: estadoDeTimestamps(r),
    categoria: null,
    cliente: true,
  });
  const cambios: Correccion[] = (pinsRes.data ?? []).map(aCorreccion);
  const revisiones: Correccion[] = (revsRes.data ?? []).map(aCorreccion);

  return {
    ideaId: idea.id,
    clienteSlug,
    naming: idea.naming_base,
    status: idea.status,
    tipoAsset: idea.tipo_asset,
    esEstatico,
    marcaName: marca?.name ?? null,
    marcaLogo: marca?.logo_url ?? null,
    briefLabel: briefLabel(brief),
    notaGuion: idea.nota_guion,
    entregaUrl: idea.entrega_url,
    concepto: idea.concepto,
    trend: idea.trend,
    plataformas: idea.plataformas ?? [],
    tamanos: idea.tamanos ?? [],
    duracion: idea.duracion ?? [],
    planos,
    estatico,
    refsPorPlano,
    refsEstatico,
    cambios,
    revisiones,
  };
}

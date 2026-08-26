import "server-only";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { resolverMes } from "@/app/(app)/performance/data";
import { diffGuion, esEdicionUtil, type DiffGuion } from "@/lib/hue-diff";
import type { PlanoParsed } from "@/lib/guion";

/**
 * Loaders de datos del H.Ü.E HUB (server-only, sin gate — el gate lo pone hue-actions).
 * REGLA DE HONESTIDAD: sólo métricas COMPUTABLES desde datos guardados; nada de números
 * inventados. Lo que necesita NLP (agregación de texto libre) NO se calcula aquí.
 */

type Sug = { kind: string; decision: string | null };
export type AdopcionKind = {
  ofrecidas: number;
  aplicadas: number;
  ignoradas: number;
  descartadas: number;
  sinDecidir: number;
};

/** Lanza si la query erró — un `{data:null,error}` NO debe convertirse en 0 silencioso
 *  (eso muestra un mes vacío falso; el loader debe fallar honesto). Devuelve data (o null). */
function must<T>(res: { data: T | null; error: { message: string } | null }, que: string): T | null {
  if (res.error) throw new Error(`${que}: ${res.error.message}`);
  return res.data;
}

/** Una fila del audit "qué aprendió y cambió H.Ü.E" (hue_adaptations + el título de su lección). */
export type AdaptacionRow = {
  id: string;
  at: string;
  trigger_summary: string | null;
  instruccionTitle: string | null;
  reverted_at: string | null;
};

export type HubIntel = {
  etiqueta: string;
  mesActual: string;
  mesPrev: string;
  mesNext: string;
  tareas: number; // aprobadas (completed_at) en el periodo — la unidad
  tareasLimpias: number; // 0 correcciones internas
  correccionesTotal: number;
  correccionesPorTarea: number | null;
  bounceTareas: number; // pasaron por in_corrections ≥1 vez
  bounceRate: number | null;
  cicloMedianoDias: number | null;
  adopcionValidador: AdopcionKind;
  adopcionOrtografia: AdopcionKind;
  topSellingPoints: { title: string; usos: number }[];
  topLegales: { title: string; usos: number }[];
};

function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function tallyAdopcion(rows: Sug[], kind: string): AdopcionKind {
  const r = rows.filter((s) => s.kind === kind);
  return {
    ofrecidas: r.length,
    aplicadas: r.filter((s) => s.decision === "applied").length,
    ignoradas: r.filter((s) => s.decision === "ignored").length,
    descartadas: r.filter((s) => s.decision === "dismissed").length,
    sinDecidir: r.filter((s) => s.decision === null).length,
  };
}

/** Métricas de "qué está funcionando" para un mes. Escala a cero con gracia (DB casi
 *  vacía tras el reset → empty-states honestos). Correcciones/rebote/ciclo se acotan a
 *  tareas COMPLETADAS en el mes; adopción a sugerencias ofrecidas en el mes; snippets es
 *  histórico (métrica de biblioteca). Filtros por marca/brief/especialista = refinamiento futuro. */
export async function cargarHubIntelligence(mes: string | null): Promise<HubIntel | null> {
  if (!hasSupabase()) return null;
  const db = supabaseAdmin();
  const { periodo, etiqueta, mesActual, mesPrev, mesNext } = resolverMes(mes);
  const { desde, hasta } = periodo;

  const ideas =
    must<{ id: string; completed_at: string }[]>(
      await db
        .from("ideas")
        .select("id, completed_at")
        .not("completed_at", "is", null)
        .gte("completed_at", desde)
        .lt("completed_at", hasta),
      "ideas",
    ) ?? [];
  const ideaIds = ideas.map((i) => i.id);
  const tareas = ideas.length;

  let correccionesTotal = 0;
  let tareasLimpias = tareas;
  let bounceTareas = 0;
  let cicloMedianoDias: number | null = null;

  if (ideaIds.length) {
    const [rc, re, ra] = await Promise.all([
      db.from("comments").select("idea_id").eq("kind", "correction_request").in("idea_id", ideaIds),
      db.from("status_events").select("idea_id").eq("to_status", "in_corrections").in("idea_id", ideaIds),
      db.from("idea_assignments").select("idea_id, assigned_at").in("idea_id", ideaIds),
    ]);
    const corrs = must<{ idea_id: string }[]>(rc, "comments") ?? [];
    const eventos = must<{ idea_id: string }[]>(re, "status_events") ?? [];
    const asigs = must<{ idea_id: string; assigned_at: string | null }[]>(ra, "idea_assignments") ?? [];
    const corrPorIdea = new Map<string, number>();
    for (const c of corrs) {
      corrPorIdea.set(c.idea_id, (corrPorIdea.get(c.idea_id) ?? 0) + 1);
    }
    correccionesTotal = [...corrPorIdea.values()].reduce((a, b) => a + b, 0);
    tareasLimpias = tareas - corrPorIdea.size;
    bounceTareas = new Set(eventos.map((e) => e.idea_id)).size;

    const asigMin = new Map<string, string>();
    for (const a of asigs) {
      if (!a.assigned_at) continue;
      const prev = asigMin.get(a.idea_id);
      if (!prev || a.assigned_at < prev) asigMin.set(a.idea_id, a.assigned_at);
    }
    const dias: number[] = [];
    for (const i of ideas) {
      const a = asigMin.get(i.id);
      if (a) dias.push((Date.parse(i.completed_at) - Date.parse(a)) / 86_400_000);
    }
    cicloMedianoDias = mediana(dias);
  }

  const filas =
    must<Sug[]>(
      await db.from("hue_suggestions").select("kind, decision").gte("offered_at", desde).lt("offered_at", hasta),
      "hue_suggestions",
    ) ?? [];

  // Snippets más usados: AGREGADOS en SQL (RPC hue_top_snippets, ya ordenado desc), no
  // se trae toda idea_snippets a JS (se truncaría/pesaría al crecer).
  const topSnips =
    must<{ snippet_id: string; title: string; kind: string; usos: number }[]>(
      await db.rpc("hue_top_snippets"),
      "hue_top_snippets",
    ) ?? [];
  const topDe = (kind: string) =>
    topSnips
      .filter((s) => s.kind === kind)
      .slice(0, 5)
      .map((s) => ({ title: s.title, usos: Number(s.usos) }));

  return {
    etiqueta,
    mesActual,
    mesPrev,
    mesNext,
    tareas,
    tareasLimpias,
    correccionesTotal,
    correccionesPorTarea: tareas ? correccionesTotal / tareas : null,
    bounceTareas,
    bounceRate: tareas ? bounceTareas / tareas : null,
    cicloMedianoDias,
    adopcionValidador: tallyAdopcion(filas, "correction_verdict"),
    adopcionOrtografia: tallyAdopcion(filas, "ortografia"),
    topSellingPoints: topDe("selling_point"),
    topLegales: topDe("legal"),
  };
}

export type WinnerPlano = { orden: number; accion: string | null; copy_in: string | null; dialogo: string | null };
export type Winner = {
  ideaId: string;
  code: string | null;
  namingBase: string | null;
  clienteName: string;
  clienteSlug: string;
  briefLabel: string;
  starredAt: string;
  reason: string | null;
  planos: WinnerPlano[];
};

/** La Biblioteca de Ganadores: guiones estrellados (más reciente primero) con su
 *  contenido de planos, para que el master los lea y el writer de Fase 2 los consuma. */
export async function cargarWinners(): Promise<Winner[]> {
  if (!hasSupabase()) return [];
  const db = supabaseAdmin();
  const filas =
    must<{ idea_id: string; reason: string | null; starred_at: string }[]>(
      await db.from("hue_top_performers").select("idea_id, reason, starred_at").order("starred_at", { ascending: false }).limit(200),
      "hue_top_performers",
    ) ?? [];
  if (!filas.length) return [];
  const ideaIds = filas.map((s) => s.idea_id);

  const [{ data: ideas }, { data: planos }] = await Promise.all([
    db.from("ideas").select("id, code, naming_base, brief_id").in("id", ideaIds),
    db.from("planos").select("idea_id, orden, accion, copy_in, dialogo").in("idea_id", ideaIds).order("orden"),
  ]);
  const ideaById = new Map(
    ((ideas ?? []) as { id: string; code: string | null; naming_base: string | null; brief_id: string }[]).map((i) => [i.id, i]),
  );
  const briefIds = [...new Set(((ideas ?? []) as { brief_id: string }[]).map((i) => i.brief_id))];
  const [{ data: briefs }, { data: clients }] = await Promise.all([
    db.from("briefs").select("id, brief_name, code, brief_date, client_id").in("id", briefIds),
    db.from("clients").select("id, name, slug"),
  ]);
  const briefById = new Map(
    ((briefs ?? []) as { id: string; brief_name: string | null; code: string | null; brief_date: string | null; client_id: string }[]).map((b) => [b.id, b]),
  );
  const clientById = new Map(((clients ?? []) as { id: string; name: string; slug: string }[]).map((c) => [c.id, c]));
  const planosByIdea = new Map<string, WinnerPlano[]>();
  for (const p of (planos ?? []) as (WinnerPlano & { idea_id: string })[]) {
    (planosByIdea.get(p.idea_id) ?? planosByIdea.set(p.idea_id, []).get(p.idea_id)!).push({
      orden: p.orden,
      accion: p.accion,
      copy_in: p.copy_in,
      dialogo: p.dialogo,
    });
  }

  const briefLabel = (b: { brief_name: string | null; code: string | null; brief_date: string | null } | undefined): string => {
    if (!b) return "Brief";
    if (b.brief_date) {
      const d = new Date(b.brief_date);
      return `Brief ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    return b.brief_name || b.code || "Brief";
  };

  return filas.map((s) => {
    const idea = ideaById.get(s.idea_id);
    const brief = idea ? briefById.get(idea.brief_id) : undefined;
    const cli = brief ? clientById.get(brief.client_id) : undefined;
    return {
      ideaId: s.idea_id,
      code: idea?.code ?? null,
      namingBase: idea?.naming_base ?? null,
      clienteName: cli?.name ?? "Sin cliente",
      clienteSlug: cli?.slug ?? "?",
      briefLabel: briefLabel(brief),
      starredAt: s.starred_at,
      reason: s.reason,
      planos: planosByIdea.get(s.idea_id) ?? [],
    };
  });
}

// ── Aprender de ediciones (borrador de H.Ü.E → guión publicado) ──────────────
export type EdicionTarea = {
  ideaId: string;
  code: string | null;
  namingBase: string | null;
  clientId: string | null;
  clienteName: string;
  clienteSlug: string;
  generatedAt: string;
  diff: DiffGuion;
  /** Sirve para minar (editado, no descartado ni intacto). */
  esUtil: boolean;
};

export type EdicionesResumen = {
  tareas: EdicionTarea[];      // recientes primero (para el visor)
  total: number;               // tareas publicadas con borrador de H.Ü.E
  conEdicion: number;          // cuántas se tocaron (editRate > 0)
  utiles: number;              // cuántas sirven para aprender
  editRateMediano: number | null;
};

// El guión "se mandó" = estados ESTABLES ya fuera del ciclo interno de edición.
// Se excluye `in_corrections` a propósito: es un estado de edición ACTIVA (y se
// alcanza desde under_review, antes de que el cliente lo vea) → leer sus planos en
// vivo daría un diff a media escritura. under_review también queda fuera (interno).
const ESTADOS_ENVIADOS = ["published", "completed", "delivered"];

/**
 * El material del loop de ediciones: por cada tarea de GUIÓN ya publicada que tuvo
 * un borrador de H.Ü.E, el diff borrador→publicado (leído EN VIVO de los planos).
 * Alimenta el visor del HUB Y la síntesis (`correrSintesisEdiciones`). Copies se
 * capturan (kind='copy') pero aún no se minan (v1 = guión). Sin gate — lo pone el
 * caller (hue-actions/síntesis).
 */
export async function cargarEdiciones(): Promise<EdicionesResumen> {
  const vacio: EdicionesResumen = { tareas: [], total: 0, conEdicion: 0, utiles: 0, editRateMediano: null };
  if (!hasSupabase()) return vacio;
  const db = supabaseAdmin();

  // Sólo generaciones IMPORTADAS: el borrador que DE VERDAD se usó (imported_at
  // sellado en importarGuion), no una regeneración posterior que nunca se importó.
  const gens =
    must<{ idea_id: string; draft: unknown; generated_at: string }[]>(
      await db.from("hue_generations").select("idea_id, draft, generated_at").eq("kind", "guion").not("imported_at", "is", null).order("generated_at", { ascending: false }).limit(400),
      "hue_generations",
    ) ?? [];
  // La generación MÁS reciente por idea (el orden desc ya la trae primero).
  const ultimaPorIdea = new Map<string, { draft: unknown; generated_at: string }>();
  for (const g of gens) if (!ultimaPorIdea.has(g.idea_id)) ultimaPorIdea.set(g.idea_id, { draft: g.draft, generated_at: g.generated_at });
  if (!ultimaPorIdea.size) return vacio;

  const ideas =
    must<{ id: string; code: string | null; naming_base: string | null; brief_id: string; status: string }[]>(
      await db.from("ideas").select("id, code, naming_base, brief_id, status").in("id", [...ultimaPorIdea.keys()]),
      "ideas",
    ) ?? [];
  const enviadas = ideas.filter((i) => ESTADOS_ENVIADOS.includes(i.status));
  if (!enviadas.length) return vacio;

  const planos =
    must<{ idea_id: string; orden: number; accion: string | null; copy_in: string | null; dialogo: string | null }[]>(
      await db.from("planos").select("idea_id, orden, accion, copy_in, dialogo").in("idea_id", enviadas.map((i) => i.id)).order("orden"),
      "planos",
    ) ?? [];
  const planosByIdea = new Map<string, PlanoParsed[]>();
  for (const p of planos) {
    const arr = planosByIdea.get(p.idea_id) ?? planosByIdea.set(p.idea_id, []).get(p.idea_id)!;
    arr.push({ titulo: null, accion: p.accion, copy_in: p.copy_in, sfx: null, gfx: null, edicion: null, dialogo: p.dialogo });
  }

  const briefIds = [...new Set(enviadas.map((i) => i.brief_id))];
  const briefs = must<{ id: string; client_id: string }[]>(await db.from("briefs").select("id, client_id").in("id", briefIds), "briefs") ?? [];
  const clients = must<{ id: string; name: string; slug: string }[]>(await db.from("clients").select("id, name, slug"), "clients") ?? [];
  const briefById = new Map(briefs.map((b) => [b.id, b]));
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const tareas: EdicionTarea[] = enviadas
    .map((i) => {
      const gen = ultimaPorIdea.get(i.id)!;
      const borrador = Array.isArray(gen.draft) ? (gen.draft as PlanoParsed[]) : [];
      const diff = diffGuion(borrador, planosByIdea.get(i.id) ?? []);
      const clientId = briefById.get(i.brief_id)?.client_id ?? null;
      const cli = clientById.get(clientId ?? "");
      return {
        ideaId: i.id,
        code: i.code,
        namingBase: i.naming_base,
        clientId,
        clienteName: cli?.name ?? "Sin cliente",
        clienteSlug: cli?.slug ?? "?",
        generatedAt: gen.generated_at,
        diff,
        esUtil: esEdicionUtil(diff),
      };
    })
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));

  return {
    tareas,
    total: tareas.length,
    conEdicion: tareas.filter((t) => t.diff.editRate > 0).length,
    utiles: tareas.filter((t) => t.esUtil).length,
    editRateMediano: mediana(tareas.map((t) => t.diff.editRate)),
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { getViewAs } from "@/lib/view-as";
import { canAdmin } from "@/lib/roles";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { hasNotion } from "@/lib/notion-legales";
import { sincronizarNotion, type SyncLegalesResultado } from "@/lib/notion-sync";
import { cifrasDe, cifrasNoVigentes, type AvisoMarca, type CampoRevisar, type MarcaSlug } from "@/lib/reglas-marca";

/** El botón "Sincronizar" de Integraciones: legales + páginas de marca. Sólo admin+.
 *  La misma sincronización corre sola cada hora (/api/notion/sync). */
export async function sincronizarLegales(): Promise<SyncLegalesResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!hasNotion()) return { ok: false, error: "Falta NOTION_TOKEN en el entorno (Vercel)." };
  if (!canAdmin(await getViewAs())) {
    return { ok: false, error: "Sólo un admin sincroniza la biblioteca." };
  }
  const r = await sincronizarNotion(supabaseAdmin());
  revalidatePath("/admin");
  return r;
}

export type TareaConCifrasViejas = { ideaId: string; nombre: string; url: string; avisos: AvisoMarca[] };

const ESTADOS_ACTIVOS = ["todo", "in_progress", "under_review", "in_corrections", "published"];

/**
 * Barrido de una vez (Pedro, 2026-11-06): qué tareas ACTIVAS de DiDi Card / Préstamos traen
 * cifras-promesa que ya no están en Notion (páginas de marca + legales) ni en su brief. Sólo
 * lee; no cambia nada. Sólo admin+. Sin páginas de Notion sincronizadas, no marca nada.
 */
export async function buscarCifrasViejas(): Promise<{ ok: true; tareas: TareaConCifrasViejas[]; revisadas: number } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!canAdmin(await getViewAs())) return { ok: false, error: "Sólo un admin." };
  const db = supabaseAdmin();

  const { data: marcas } = await db.from("marcas").select("id, slug").in("slug", ["card", "prestamos"]);
  const filasMarca = (marcas ?? []) as { id: string; slug: MarcaSlug }[];
  const marcaIds = filasMarca.map((m) => m.id);
  if (!marcaIds.length) return { ok: true, tareas: [], revisadas: 0 };

  const [{ data: docs }, { data: legales }, { data: ideas }] = await Promise.all([
    db.from("hue_kb_documents").select("marca_id, extracted_text").in("marca_id", marcaIds).like("storage_path", "notion:%"),
    db.from("snippets").select("marca_id, body").eq("kind", "legal").eq("active", true).in("marca_id", marcaIds),
    db.from("ideas").select("id, code, naming_base, marca_id, brief_id, selling_points, concepto")
      .in("marca_id", marcaIds).in("status", ESTADOS_ACTIVOS).is("deleted_at", null).limit(500),
  ]);

  const base = new Map<string, Set<string>>();
  const sumar = (marcaId: string, texto: string | null) => {
    const set = base.get(marcaId) ?? new Set<string>();
    for (const c of cifrasDe(texto ?? "")) set.add(c);
    base.set(marcaId, set);
  };
  const conNotion = new Set<string>();
  for (const d of (docs ?? []) as { marca_id: string; extracted_text: string | null }[]) { sumar(d.marca_id, d.extracted_text); conNotion.add(d.marca_id); }
  for (const l of (legales ?? []) as { marca_id: string; body: string | null }[]) sumar(l.marca_id, l.body);

  type Idea = { id: string; code: string | null; naming_base: string | null; marca_id: string; brief_id: string; selling_points: string[] | null; concepto: string | null };
  const lista = ((ideas ?? []) as Idea[]).filter((i) => conNotion.has(i.marca_id));
  if (!lista.length) return { ok: true, tareas: [], revisadas: 0 };
  const ids = lista.map((i) => i.id);

  const [{ data: planos }, { data: estaticos }, { data: briefs }] = await Promise.all([
    db.from("planos").select("idea_id, orden, accion, copy_in, cta, gfx, dialogo").in("idea_id", ids),
    db.from("estaticos").select("idea_id, copy_titulo, copy_subtitulo, copy_cta").in("idea_id", ids),
    db.from("briefs").select("id, clients(slug)").in("id", [...new Set(lista.map((i) => i.brief_id))]),
  ]);
  const slugDe = new Map(((briefs ?? []) as { id: string; clients: { slug: string } | { slug: string }[] | null }[])
    .map((b) => [b.id, Array.isArray(b.clients) ? b.clients[0]?.slug : b.clients?.slug]));

  const camposDe = new Map<string, CampoRevisar[]>();
  const agregar = (ideaId: string, label: string, campo: string, texto: unknown) => {
    if (typeof texto !== "string" || !texto.trim()) return;
    (camposDe.get(ideaId) ?? camposDe.set(ideaId, []).get(ideaId)!).push({ label, campo, texto });
  };
  for (const p of (planos ?? []) as Record<string, unknown>[]) {
    const id = p.idea_id as string;
    for (const [k, l] of [["accion", "Acción"], ["copy_in", "Copy in"], ["cta", "CTA"], ["gfx", "GFX"], ["dialogo", "Diálogos"]] as const)
      agregar(id, `Plano ${p.orden} · ${l}`, k, p[k]);
  }
  for (const e of (estaticos ?? []) as Record<string, unknown>[]) {
    const id = e.idea_id as string;
    for (const [k, l] of [["copy_titulo", "Título"], ["copy_subtitulo", "Subtítulo"], ["copy_cta", "Botón CTA"]] as const) agregar(id, l, k, e[k]);
  }

  const tareas: TareaConCifrasViejas[] = [];
  for (const i of lista) {
    const vigente = new Set(base.get(i.marca_id));
    for (const t of [...(i.selling_points ?? []), i.concepto ?? ""]) for (const c of cifrasDe(t)) vigente.add(c);
    // Si la cifra es de la otra marca (guión de Card pegado en Préstamos), el aviso lo dice.
    const propia = filasMarca.find((m) => m.id === i.marca_id);
    const otra = filasMarca.find((m) => m.id !== i.marca_id);
    const otraMarca = propia && otra && conNotion.has(otra.id) ? { tarea: propia.slug, otra: otra.slug, cifras: base.get(otra.id) ?? new Set<string>() } : null;
    const avisos = cifrasNoVigentes(camposDe.get(i.id) ?? [], vigente, otraMarca);
    if (avisos.length)
      tareas.push({ ideaId: i.id, nombre: i.naming_base ?? i.code ?? i.id.slice(0, 8), url: `/${slugDe.get(i.brief_id) ?? "didi"}/tareas/${i.id}`, avisos });
  }
  return { ok: true, tareas, revisadas: lista.length };
}

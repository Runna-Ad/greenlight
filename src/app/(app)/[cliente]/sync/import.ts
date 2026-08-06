"use server";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { classifyTab, type SheetRow } from "@/lib/sheet-sync";
import { namingKindForTipo } from "@/lib/filename";
import { generatesFiles, missingRequired } from "@/lib/required";

export type ImportRow = {
  key: string;
  hash: string;          // content fingerprint — lets a later sync tell
  rowNumber: number;     // "unchanged" from "the sheet was edited"

  tab: string;
  data: SheetRow;          // what the sheet says
  edited?: Partial<SheetRow>; // the lead's corrections
};

export type BlockedRow = { naming: string; tab: string; missing: string[] };

export type ImportResult = {
  ok: boolean;
  created: number;
  assets: number;
  skipped: number;
  /** Filas rechazadas por campos obligatorios. Nunca se saltan en silencio. */
  blocked: BlockedRow[];
  errors: string[];
};

const list = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

/**
 * Sheet sizes sometimes carry pixel dimensions: "1:1 (1080*1080)".
 * Only the ratio belongs in a filename — the parenthetical is a note to the
 * designer. Without this, the token came out as "1X110801080".
 */
const cleanSize = (s: string) => s.replace(/\s*\(.*?\)\s*/g, "").trim();

/**
 * The sheet stores human LABELS ("Ilustración"); filenames need vocab CODES
 * ("ILLUS"). Passing the label straight through produced "ILUSTRACIN" — the
 * accent stripped by tokenisation, and the wrong token entirely.
 */
function labelToCode(
  vocab: { set: string; code: string; label_es: string; track: string }[],
  set: string,
  track: string,
  label: string,
): string {
  if (!label) return "";
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const target = norm(label);
  const match =
    vocab.find(
      (v) => v.set === set && norm(v.label_es) === target && (v.track === track || v.track === "both"),
    ) ??
    vocab.find((v) => v.set === set && norm(v.code) === target);
  return match?.code ?? label; // unknown values pass through rather than vanish
}

/** "A4" → family "A", variant 4.  "B" → family "B", variant 1. */
function splitIdeaCode(raw: string): { letter: string; variant: number } {
  const m = (raw || "").trim().match(/^([A-Za-z]+)\s*(\d*)$/);
  if (!m) return { letter: "X", variant: 1 };
  return { letter: m[1].toUpperCase(), variant: m[2] ? Number(m[2]) : 1 };
}

/**
 * Create real work from approved sheet rows.
 *
 * One TAB becomes one brief (a project). Rows become ideas under an idea family
 * derived from "# Idea", and each idea fans out into assets for every
 * Tamaño × Plataforma the row asks for.
 *
 * Idempotent: re-importing the same row updates its staged record instead of
 * creating a second task, so a repeated sync can't duplicate work.
 */
export async function importRows(
  clienteSlug: string,
  rows: ImportRow[],
): Promise<ImportResult> {
  const res: ImportResult = {
    ok: false, created: 0, assets: 0, skipped: 0, blocked: [], errors: [],
  };
  if (!hasSupabase()) {
    res.errors.push("La base de datos no está configurada.");
    return res;
  }
  if (!rows.length) {
    res.errors.push("No hay filas seleccionadas.");
    return res;
  }

  const db = supabaseAdmin();

  const { data: client } = await db
    .from("clients").select("id").eq("slug", clienteSlug).maybeSingle();
  if (!client) {
    res.errors.push(`Cliente "${clienteSlug}" no encontrado.`);
    return res;
  }

  // Sheet labels → filename tokens (see labelToCode above).
  const { data: vocab } = await db
    .from("vocab_terms").select("set, code, label_es, track");
  const V = (vocab ?? []) as { set: string; code: string; label_es: string; track: string }[];

  // "Asignación" and "Marca" are columns the sheet always fills, and the import
  // used to drop both — Asignación was read for the dedup key and then thrown
  // away. Resolve them here so a re-sync can't lose them again.
  const { data: memberRows } = await db
    .from("track_members").select("id, name, track").eq("active", true);
  const MEMBERS = (memberRows ?? []) as { id: string; name: string; track: string }[];

  const { data: marcaRows } = await db
    .from("marcas").select("id, name").eq("client_id", client.id);
  const MARCAS = (marcaRows ?? []) as { id: string; name: string }[];

  const fold = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

  /** "Galie, Mony" → the two member ids, matched within the row's own track. */
  const resolveMembers = (raw: string, track: string): string[] =>
    raw
      .split(",")
      .map((n) => fold(n))
      .filter(Boolean)
      .map((n) => MEMBERS.find((m) => m.track === track && fold(m.name) === n)?.id)
      .filter((id): id is string => Boolean(id));

  const resolveMarca = (raw: string): string | null =>
    MARCAS.find((m) => fold(m.name) === fold(raw))?.id ?? null;

  // Whoever is acting — until login exists, attribute to the admin.
  const { data: actor } = await db
    .from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();

  // ── 1. one brief per tab ──
  const briefByTab = new Map<string, string>();
  for (const tab of new Set(rows.map((r) => r.tab))) {
    const info = classifyTab(tab);
    const sample = rows.find((r) => r.tab === tab)!;
    const v = (f: keyof SheetRow) => sample.edited?.[f] ?? sample.data[f] ?? "";

    const { data: existing } = await db
      .from("briefs").select("id")
      .eq("client_id", client.id).eq("source_tab", tab).maybeSingle();

    if (existing) {
      briefByTab.set(tab, existing.id);
      continue;
    }

    const { data: brief, error } = await db
      .from("briefs")
      .insert({
        client_id: client.id,
        code: `DIDI-${(info.dateLabel ?? "").replace("/", "")}-${(info.track ?? "").toUpperCase()}`,
        title: info.label,
        brief_name: v("Brief Name") || null,
        track: info.track,
        source_tab: tab,
        status: "active",
        created_by: actor?.id ?? null,
      })
      .select("id").single();

    if (error) {
      res.errors.push(`Brief "${tab}": ${error.message}`);
      continue;
    }
    briefByTab.set(tab, brief.id);
  }

  // ── 2. rows → ideas + assets ──
  for (const row of rows) {
    const briefId = briefByTab.get(row.tab);
    if (!briefId) {
      res.skipped++;
      continue;
    }
    const info = classifyTab(row.tab);
    const track = info.track ?? "real";
    const v = (f: keyof SheetRow) => (row.edited?.[f] ?? row.data[f] ?? "").trim();

    try {
      // skip anything already imported — this is what makes re-sync safe
      const { data: staged } = await db
        .from("staged_rows").select("id, idea_id")
        .eq("client_id", client.id).eq("natural_key", row.key).maybeSingle();
      if (staged?.idea_id) {
        res.skipped++;
        continue;
      }

      // ── El gate de verdad ──
      // La UI también avisa, pero esto es una server action: un POST público.
      // Antes se creaba la tarea y DESPUÉS se reportaba que faltaba la
      // Asignación — así entraron 2 tareas sin responsable a la base.
      const faltan = missingRequired({ ...row.data, ...row.edited });

      // Un nombre que el pool no conoce es tan inválido como la celda vacía:
      // se comprueba ANTES de crear nada, no después.
      const memberIds = resolveMembers(v("Asignación"), track);
      if (!faltan.includes("Asignación") && memberIds.length === 0) {
        faltan.push("Asignación");
      }

      if (faltan.length) {
        res.blocked.push({
          naming: v("Naming") || v("Concepto").slice(0, 40) || row.key,
          tab: row.tab,
          missing: faltan,
        });
        res.skipped++;
        continue;
      }

      // idea family from "# Idea"
      const { letter } = splitIdeaCode(v("# Idea"));
      let familyId: string;
      const { data: fam } = await db
        .from("idea_families").select("id")
        .eq("brief_id", briefId).eq("letter", letter).maybeSingle();
      if (fam) familyId = fam.id;
      else {
        const { data: created, error } = await db
          .from("idea_families")
          .insert({ brief_id: briefId, letter, name: v("Concepto").slice(0, 120) || null })
          .select("id").single();
        if (error) throw new Error(`familia ${letter}: ${error.message}`);
        familyId = created.id;
      }

      // variant_number must be unique per family; the sheet reuses codes, so
      // take the next free slot rather than trusting the number in "# Idea".
      const { data: siblings } = await db
        .from("ideas").select("variant_number").eq("family_id", familyId);
      const used = new Set((siblings ?? []).map((s) => s.variant_number));
      let variant = 1;
      while (used.has(variant)) variant++;

      const tipo = v("Tipo de Asset");
      const namingKind = tipo ? namingKindForTipo(tipo) : "real";
      const mesToken = v("Mes") ? `${v("Mes").toUpperCase()}26` : "";

      const { data: idea, error: ideaErr } = await db
        .from("ideas")
        .insert({
          family_id: familyId,
          brief_id: briefId,
          track,
          marca_id: resolveMarca(v("Marca")),
          variant_number: variant,
          naming_base: v("Naming") || null,
          naming_kind: namingKind,
          genero_code: labelToCode(V, "genero", track, v("Género")) || null,
          formato_code: labelToCode(V, "formato", track, v("Formato")) || null,
          mes_code: mesToken || null,
          plataformas: list(v("Plataforma")),
          tamanos: list(v("Tamaño")).map(cleanSize),
          duracion: v("Duración") || null,
          tipo_code: tipo || null,
          tipo_asset: tipo || null,
          entrega_num: v("# Entrega") || null,
          entrega_final: v("Entrega final") || null,
          concepto: v("Concepto") || null,
          selling_points: v("Selling Points") ? [v("Selling Points")] : [],
          comentarios_creativo: v("Comentarios Leads") || null,
          peloteo_raw: v("Peloteo") || null,
          // Trend = columna Referencias; Notas se lee de peloteo_raw. Así estos
          // campos del workspace ya vienen llenos del sheet (Pedro).
          trend: v("Referencias") || null,
          created_by: actor?.id ?? null,
        })
        .select("id, code").single();
      if (ideaErr) throw new Error(`idea: ${ideaErr.message}`);

      res.created++;

      // ── people: "Asignación" is multi-person and carries no role ──
      // memberIds ya se resolvió y validó arriba: si llegamos aquí, hay gente.
      const { error: asgErr } = await db
        .from("idea_assignments")
        .insert(memberIds.map((member_id) => ({ idea_id: idea.id, member_id })));
      if (asgErr) res.errors.push(`asignación de ${v("Naming")}: ${asgErr.message}`);

      // ── assets: every Tamaño × Plataforma the row asks for ──
      // Un copy es texto: no tiene proporción ni archivo. El fallback de antes
      // ("9:16" × "FB" cuando la fila no traía Tamaño ni Plataforma) le inventó
      // a las 2 filas de Copies un entregable llamado
      // SINNAMING_9X16_TEXTO_STATIC_IDEAX1_GG_V1_SINMES_RN — cuatro valores
      // inventados apilados, camino a una entrega. Sin fallback: si un tipo que
      // sí entrega archivos llega sin Tamaño o Plataforma, el gate de arriba ya
      // lo bloqueó.
      const sizes = list(v("Tamaño")).map(cleanSize).filter(Boolean);
      const plats = list(v("Plataforma"));
      const ideaToken = v("# Idea") || idea.code || letter;
      const assetRows = [];
      for (const size of generatesFiles(tipo) ? sizes : []) {
        for (const plat of plats) {
          assetRows.push({
            idea_id: idea.id,
            brief_id: briefId,
            track,
            naming_kind: namingKind,
            naming_base: v("Naming") || "SINNAMING",
            tamano_code: size,
            plataforma_code: plat,
            duracion_code: namingKind === "static" ? null : v("Duración") || null,
            genero_code: labelToCode(V, "genero", track, v("Género")) || null,
            formato_code: labelToCode(V, "formato", track, v("Formato")) || null,
            idea_code: ideaToken,     // verbatim from the sheet, so filenames match
            mes_code: mesToken || "SINMES",
            version: 1,
            status: "todo",
          });
        }
      }
      if (assetRows.length) {
        const { error: aErr, count } = await db
          .from("assets").insert(assetRows, { count: "exact" });
        if (aErr) res.errors.push(`assets de ${v("Naming")}: ${aErr.message}`);
        else res.assets += count ?? assetRows.length;
      }

      // ── remember it, so a future sync knows this row is done ──
      await db.from("staged_rows").upsert(
        {
          client_id: client.id,
          source_tab: row.tab,
          source_row: row.rowNumber,
          track,
          natural_key: row.key,
          row_hash: row.hash,
          diff: "new",
          status: "approved",
          data: row.data,
          edited: row.edited ?? null,
          idea_id: idea.id,
          reviewed_by: actor?.id ?? null,
          reviewed_at: new Date().toISOString(),
        },
        { onConflict: "client_id,natural_key" },
      );
    } catch (e) {
      res.errors.push(`${v("Naming") || row.key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  res.ok = res.errors.length === 0;
  return res;
}

/** naturalKey → rowHash for everything already imported, so sync skips it. */
export async function knownRows(clienteSlug: string): Promise<Record<string, string>> {
  if (!hasSupabase()) return {};
  const db = supabaseAdmin();
  const { data: client } = await db
    .from("clients").select("id").eq("slug", clienteSlug).maybeSingle();
  if (!client) return {};
  const { data } = await db
    .from("staged_rows").select("natural_key, row_hash").eq("client_id", client.id);
  return Object.fromEntries((data ?? []).map((r) => [r.natural_key, r.row_hash]));
}

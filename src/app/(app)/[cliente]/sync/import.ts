"use server";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getCurrentUser } from "@/lib/identity";
import { canCreateBrief } from "@/lib/roles";
import { classifyTab, type SheetRow } from "@/lib/sheet-sync";
import { namingKindForTipo } from "@/lib/filename";
import { generatesFiles, missingRequired } from "@/lib/required";
// Helpers de mapeo del sheet → tarea: una sola definición compartida con la
// captura a mano (BriefBuilder / crearBrief). Ver src/lib/intake-crear.ts.
import { list, cleanSize, labelToCode, splitIdeaCode, fold } from "@/lib/intake-crear";

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

  // Server-side gate: importar crea briefs/tareas → sólo lead/admin/master.
  const u = await getCurrentUser();
  if (!u || !canCreateBrief(u.role)) {
    res.errors.push("Sólo un lead o un admin puede importar del sheet.");
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
    .from("track_members").select("id, name, track, role, es_lead").eq("active", true);
  const MEMBERS = (memberRows ?? []) as {
    id: string; name: string; track: string; role: string; es_lead: boolean;
  }[];
  // Pool de LEADS: el sheet trae al LEAD (dept head). Lead-capable = es_lead o rol
  // lead/admin/master. (Pedro: a confirmar en test — Nils=admin califica.)
  const LEADS = MEMBERS.filter(
    (m) => m.es_lead || m.role === "lead" || m.role === "admin" || m.role === "master",
  );

  const { data: marcaRows } = await db
    .from("marcas").select("id, name").eq("client_id", client.id);
  const MARCAS = (marcaRows ?? []) as { id: string; name: string }[];

  /**
   * El lead del sheet → el track_member lead que le corresponde, con match INTELIGENTE:
   * "Nils" (sheet) casa con "Nils Vera" (plataforma). Insensible a acento/caso (fold),
   * por nombre completo, por prefijo ("nils " → "nils vera"), o por token. SÓLO si es
   * INEQUÍVOCO (exactamente 1 candidato) — si "Nils" casara con dos leads se deja SIN
   * lead (no adivinamos). Sin match → null → la tarea se crea igual, sin lead
   * ("Falta responsable"), para asignar a mano. Los leads NUNCA se auto-crean (Pedro).
   */
  const matchLead = (raw: string): string | null => {
    const fN = fold(raw.split(",")[0] ?? ""); // a futuro el sheet trae 1 lead; toma el 1º
    if (!fN) return null;
    const cands = LEADS.filter((m) => {
      const fm = fold(m.name);
      return fm === fN || fm.startsWith(`${fN} `) || fm.split(" ").includes(fN);
    });
    return cands.length === 1 ? cands[0].id : null;
  };

  const resolveMarca = (raw: string): string | null =>
    MARCAS.find((m) => fold(m.name) === fold(raw))?.id ?? null;

  // Attribute the import to the authenticated user (login is on).
  const actor = { id: u.userId };

  // ── 1. one brief per tab ──
  const briefByTab = new Map<string, string>();
  // Briefs CREADOS en este run (no los reusados). Si al final alguno quedó SIN
  // ideas (todas sus filas se bloquearon/omitieron) se borra: un brief vacío de
  // una sync fallida es basura que ensucia el tablero y la tarjeta de cliente.
  const nuevosBriefIds = new Set<string>();
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
    nuevosBriefIds.add(brief.id);
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
      // Asignación ya NO bloquea la creación: el sheet trae el LEAD, y si su nombre no
      // hace match con el pool de leads, la tarea se crea IGUAL "sin lead" para
      // asignarla a mano (decisión de Pedro). Se quita de los obligatorios SÓLO en
      // este path de sync — ALWAYS_REQUIRED y su contract test quedan intactos.
      const faltan = missingRequired({ ...row.data, ...row.edited }).filter(
        (c) => c !== "Asignación",
      );
      // El lead con match inteligente ("Nils" → "Nils Vera"); null = sin lead.
      const leadId = matchLead(v("Asignación"));

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
          // duracion ahora es text[]: cada duración es una pastilla. La celda del
          // sheet puede traer varias separadas por coma ("15-30s, 40s").
          duracion: list(v("Duración")),
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

      // ── lead ── el sheet trae al LEAD → idea_assignments con es_lead=true. Si no
      // hubo match, la tarea queda SIN lead (se asigna a mano; luego el lead elige a
      // los especialistas dentro de la app, es_lead=false — Fase 2).
      if (leadId) {
        const { error: asgErr } = await db
          .from("idea_assignments")
          .insert({ idea_id: idea.id, member_id: leadId, es_lead: true, assigned_by: actor.id });
        if (asgErr) res.errors.push(`lead de ${v("Naming")}: ${asgErr.message}`);
      }

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
      // Fan-out por duración: cada duración es su propio archivo (tamaño × plat ×
      // duración). Los estáticos no duran → una sola fila por tamaño×plat
      // (duracion_code null). Un video sin duración → también una fila (null).
      // Dedupe: una celda sucia ("15-30s, 15-30s") no debe crear dos filas
      // idénticas → chocarían con el índice único y tumbarían TODA la fila.
      const durs = [...new Set(list(v("Duración")))];
      const durCodes = namingKind === "static" ? [null] : durs.length ? durs : [null];
      const assetRows = [];
      for (const size of generatesFiles(tipo) ? sizes : []) {
        for (const plat of plats) {
          for (const dur of durCodes) {
            assetRows.push({
              idea_id: idea.id,
              brief_id: briefId,
              track,
              naming_kind: namingKind,
              naming_base: v("Naming") || "SINNAMING",
              tamano_code: size,
              plataforma_code: plat,
              duracion_code: dur,
              genero_code: labelToCode(V, "genero", track, v("Género")) || null,
              formato_code: labelToCode(V, "formato", track, v("Formato")) || null,
              idea_code: ideaToken,     // verbatim from the sheet, so filenames match
              mes_code: mesToken || "SINMES",
              version: 1,
              status: "todo",
            });
          }
        }
      }
      if (assetRows.length) {
        const { error: aErr, count } = await db
          .from("assets").insert(assetRows, { count: "exact" });
        if (aErr) res.errors.push(`assets de ${v("Naming")}: ${aErr.message}`);
        else res.assets += count ?? assetRows.length;
      }

      // ── remember it, so a future sync knows this row is done ──
      // Este upsert ES el marcador de dedup. Si falla en silencio, la próxima sync no
      // encuentra el registro y RE-IMPORTA la fila → tarea duplicada en prod. Antes se
      // ignoraba su error; ahora se revisa y se avisa para reconciliar a mano (reap).
      const { error: stErr } = await db.from("staged_rows").upsert(
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
      if (stErr) {
        res.errors.push(
          `Se creó la tarea de «${v("Naming") || row.key}» pero no se pudo marcar como importada — re-sincronizar podría duplicarla. Revísalo: ${stErr.message}`,
        );
      }
    } catch (e) {
      res.errors.push(`${v("Naming") || row.key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Limpieza: borra los briefs creados ESTE run que quedaron SIN ideas (todas sus
  // filas se bloquearon/omitieron). Un brief vacío no debe existir — 0 downstream
  // (0 ideas/assets/asignaciones), así que borrarlo es seguro y evita el "1 BRIEF"
  // fantasma en la tarjeta de cliente. Sólo toca los creados este run.
  for (const briefId of nuevosBriefIds) {
    const { count } = await db
      .from("ideas")
      .select("id", { count: "exact", head: true })
      .eq("brief_id", briefId);
    if ((count ?? 0) === 0) {
      await db.from("briefs").delete().eq("id", briefId);
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

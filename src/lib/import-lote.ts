// El write-path del import del sheet, UNA VEZ pasadas las puertas (identidad, rol,
// track — eso vive en la server action `sync/import.ts`): filas aprobadas →
// briefs · familias · ideas · lead · assets · staged_rows.
//
// Vive aparte de la server action por dos razones:
//  1. Recibe la conexión (`db`) por parámetro → se prueba en Node contra una base
//     FALSA en memoria (scripts/test-import.mjs), sin `server-only` ni alias `@/`
//     en imports de valor. Es el write-path de creación de tareas en producción:
//     la lógica de lotes tiene que estar donde un test la pueda CONTAR.
//  2. `"use server"` sólo exporta funciones async; los tipos y helpers puros
//     necesitan un módulo normal.
//
// LOTES, no N+1 (2026-09-02). Antes cada fila costaba ~7 viajes seriados a la base
// (staged → familia → hermanas → idea → lead → assets → staged): una pestaña de 40
// filas eran ~280 viajes, y el import se acercaba al tope de tiempo de la función.
// Ahora las LECTURAS van una vez por lote (acotadas a las claves/briefs de ESTE run,
// nunca "toda la tabla" — que se trunca en silencio al tope de PostgREST) y las
// ESCRITURAS van en un insert por tabla. El número de consultas ya no crece con las
// filas; el test lo vigila (5 filas y 40 filas = mismas consultas).
//
// El AISLAMIENTO por fila se conserva: un insert en lote es atómico (una fila mala
// tumba todas), así que si falla se reintenta FILA A FILA — las buenas entran y el
// error nombra a la mala, igual que antes. Los ids de idea se generan AQUÍ (uuid)
// para no depender del orden en que la base devuelve un insert múltiple, y para que
// un reintento tras un fallo ambiguo choque en el PK (ruidoso) en vez de duplicar.

import type { supabaseAdmin } from "@/lib/supabase-admin";
import { classifyTab, type SheetRow } from "./sheet-sync.ts";
import { namingKindForTipo } from "./filename.ts";
import { generatesFiles, missingRequired } from "./required.ts";
import { list, cleanSize, labelToCode, splitIdeaCode, fold } from "./intake-crear.ts";

type Db = ReturnType<typeof supabaseAdmin>;

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

export type ImportContexto = {
  clientId: string;
  /** Quién importa (login encendido): queda en created_by / assigned_by / reviewed_by. */
  actorId: string;
};

/**
 * Cuántos valores van por consulta `in (...)`. PostgREST los manda en la URL (GET) y
 * una clave natural mide ~60 caracteres: 100 por viaje queda lejos del tope de URL.
 */
const LOTE_IN = 100;

function enLotes<T>(items: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/**
 * ¿Esta fila del staging tiene detrás una tarea VIVA? Ésa es la única definición de
 * "ya sincronizada" — y la comparten el dedup del import y el mapa de la vista previa.
 *
 * Tres casos, uno solo cuenta como sincronizada:
 *  · con tarea viva            → SÍ  (saltar: ya está en la plataforma)
 *  · con tarea en la papelera  → no  (0057: se puede reimportar; al restaurarla vuelve a contar)
 *  · SIN vínculo (`idea_id` null) → no. Aquí caen las tareas borradas en DURO antes de que
 *    existiera la papelera: el FK `on delete set null` dejó la fila huérfana. Mirar sólo el
 *    vínculo daba "sin cambios" en el preview y la fila no se podía volver a importar nunca
 *    (29 filas así en prod el 2026-09-01 — el bug que reportó Pedro). También cubre lo
 *    stageado que nunca se aprobó: si no está en la plataforma, es importable.
 *
 * El embed de PostgREST (`ideas(deleted_at)`) llega como OBJETO en una relación
 * muchos-a-uno, pero los tipos generados lo declaran como ARRAY — y esos tipos van por
 * detrás del esquema. Se aceptan LAS DOS formas en vez de apostar por una: si la
 * conjetura fallara, esto diría "no hay tarea viva" siempre y re-importaríamos duplicados.
 */
export function tieneIdeaViva(ideas: unknown): boolean {
  const fila = (Array.isArray(ideas) ? ideas[0] : ideas) as
    | { deleted_at?: string | null }
    | null
    | undefined;
  return Boolean(fila) && !fila!.deleted_at;
}

type Vocab = { set: string; code: string; label_es: string; track: string };

/** Una fila que pasó el dedup y los obligatorios: lo que hace falta para crearla. */
type Plan = {
  row: ImportRow;
  briefId: string;
  track: string;
  letter: string;
  leadId: string | null;
  v: (f: keyof SheetRow) => string;
};

/** Un plan con su idea ya decidida (id + variante), lista para escribirse. */
type Creada = Plan & { ideaId: string; familyId: string; variant: number };

const nombre = (p: Plan) => p.v("Naming") || p.row.key;

/**
 * Escribe `items` en UN viaje (insert o upsert). Si el lote falla, reintenta FILA A
 * FILA para aislar la mala: las buenas entran, `onError` recibe la mala con su
 * mensaje. Devuelve las que entraron y cuántas filas de tabla sumaron.
 * `filas` puede devolver varias filas por item (assets: tamaño × plat × duración).
 */
async function escribirEnLote<T>(
  db: Db,
  tabla: string,
  items: T[],
  filas: (t: T) => Record<string, unknown>[],
  onError: (t: T, msg: string) => void,
  upsert?: { onConflict: string },
): Promise<{ ok: T[]; filas: number }> {
  const conFilas = items.map((t) => ({ t, rows: filas(t) })).filter((x) => x.rows.length);
  if (!conFilas.length) return { ok: [], filas: 0 };
  const escribir = (rows: Record<string, unknown>[]) =>
    upsert ? db.from(tabla).upsert(rows, upsert) : db.from(tabla).insert(rows);

  const { error } = await escribir(conFilas.flatMap((x) => x.rows));
  if (!error) {
    return { ok: conFilas.map((x) => x.t), filas: conFilas.reduce((n, x) => n + x.rows.length, 0) };
  }
  const ok: T[] = [];
  let n = 0;
  for (const x of conFilas) {
    const { error: e } = await escribir(x.rows);
    if (e) onError(x.t, e.message);
    else {
      ok.push(x.t);
      n += x.rows.length;
    }
  }
  return { ok, filas: n };
}

function fallo(res: ImportResult, msg: string): ImportResult {
  res.errors.push(msg);
  res.ok = false;
  return res;
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
export async function ejecutarImport(
  db: Db,
  ctx: ImportContexto,
  rows: ImportRow[],
): Promise<ImportResult> {
  const res: ImportResult = {
    ok: false, created: 0, assets: 0, skipped: 0, blocked: [], errors: [],
  };
  const { clientId, actorId } = ctx;
  if (!rows.length) return fallo(res, "No hay filas seleccionadas.");

  // ── catálogos: 3 consultas fijas, no dependen de las filas ──
  // Sheet labels → filename tokens (see labelToCode).
  const { data: vocab } = await db
    .from("vocab_terms").select("set, code, label_es, track");
  const V = (vocab ?? []) as Vocab[];

  // "Asignación" and "Marca" are columns the sheet always fills, and the import
  // used to drop both — Asignación was read for the dedup key and then thrown
  // away. Resolve them here so a re-sync can't lose them again.
  const { data: memberRows } = await db
    .from("track_members").select("id, name, track, role, es_lead").eq("active", true);
  const MEMBERS = (memberRows ?? []) as {
    id: string; name: string; track: string; role: string; es_lead: boolean;
  }[];
  // Pool de LEADS del sheet: SÓLO rol `lead` (dept head). Admins/master son globales,
  // no son doers → no asignables como lead (Pedro 2026-08-21). Se matchea DENTRO del
  // track de la fila.
  const LEADS = MEMBERS.filter((m) => m.role === "lead");

  const { data: marcaRows } = await db
    .from("marcas").select("id, name").eq("client_id", clientId);
  const MARCAS = (marcaRows ?? []) as { id: string; name: string }[];

  /**
   * El lead del sheet → el track_member lead que le corresponde, con match INTELIGENTE:
   * "Nils" (sheet) casa con "Nils Vera" (plataforma). Insensible a acento/caso (fold),
   * por nombre completo, por prefijo ("nils " → "nils vera"), o por token. SÓLO si es
   * INEQUÍVOCO (exactamente 1 candidato) — si "Nils" casara con dos leads se deja SIN
   * lead (no adivinamos). Sin match → null → la tarea se crea igual, sin lead
   * ("Falta responsable"), para asignar a mano. Los leads NUNCA se auto-crean (Pedro).
   */
  const matchLead = (raw: string, track: string): string | null => {
    const fN = fold(raw.split(",")[0] ?? ""); // a futuro el sheet trae 1 lead; toma el 1º
    if (!fN) return null;
    const cands = LEADS.filter((m) => {
      if (m.track !== track) return false; // atado al track de la tarea
      const fm = fold(m.name);
      return fm === fN || fm.startsWith(`${fN} `) || fm.split(" ").includes(fN);
    });
    return cands.length === 1 ? cands[0].id : null;
  };

  const resolveMarca = (raw: string): string | null =>
    MARCAS.find((m) => fold(m.name) === fold(raw))?.id ?? null;

  // ── 0. filas que NO entran a los lotes ──
  // · Pestaña sin equipo: classifyTab devuelve track null para lo que no es Real/Normal.
  //   Antes se le ponía "real" por defecto — un lead de Normal podía crear tareas de
  //   Real mandando una pestaña inventada (rows es un POST). La server action ya lo
  //   rechaza entero; aquí se vuelve a defender fila a fila.
  // · Comillas o barra invertida en la clave/pestaña: supabase-js entrecomilla los
  //   valores de `.in()` pero no escapa `"` → la consulta del dedup rompería y se
  //   abortaría TODO el run por una fila. Se aparta sólo esa fila, con aviso.
  const filas: ImportRow[] = [];
  for (const row of rows) {
    if (/["\\]/.test(row.key) || /["\\]/.test(row.tab)) {
      res.errors.push(`Fila «${row.key}»: la clave o la pestaña traen comillas — no se importa.`);
      res.skipped++;
      continue;
    }
    if (!classifyTab(row.tab).track) {
      res.errors.push(`Pestaña «${row.tab}» sin equipo (Real/Normal): no se importa.`);
      res.skipped++;
      continue;
    }
    filas.push(row);
  }
  if (!filas.length) return res;

  // ── 1. one brief per tab ──
  const tabs = [...new Set(filas.map((r) => r.tab))];
  const briefByTab = new Map<string, string>();
  // Briefs CREADOS en este run (no los reusados). Si al final alguno quedó SIN
  // ideas (todas sus filas se bloquearon/omitieron) se borra: un brief vacío de
  // una sync fallida es basura que ensucia el tablero y la tarjeta de cliente.
  const nuevosBriefIds = new Set<string>();

  // UNA lectura para todas las pestañas. Sólo briefs VIVOS: reusar uno que está en la
  // papelera metería las tareas nuevas en un brief invisible (board_tasks filtra
  // b.deleted_at) — el import "funcionaría" y no se vería nada.
  const { data: briefsPrevios, error: bErr } = await db
    .from("briefs").select("id, source_tab")
    .eq("client_id", clientId).is("deleted_at", null).in("source_tab", tabs);
  if (bErr) return fallo(res, `No se pudieron leer los briefs: ${bErr.message}`);
  for (const b of (briefsPrevios ?? []) as { id: string; source_tab: string | null }[]) {
    if (b.source_tab && !briefByTab.has(b.source_tab)) briefByTab.set(b.source_tab, b.id);
  }

  // ── 2. lecturas en LOTE, acotadas a este run ──
  // 2a. Dedup: qué claves de ESTE run ya tienen una tarea viva detrás. Esto es lo que
  // hace segura una re-sync. Si la lectura falla se ABORTA: seguir "a ciegas" es
  // re-importar todo y duplicar tareas (antes el error se ignoraba).
  // …salvo que la tarea importada esté en la PAPELERA (0057): antes el borrado era
  // DURO y el FK `on delete set null` limpiaba `staged_rows.idea_id` solo, así que la
  // fila se podía volver a importar. Con el borrado suave la idea sigue existiendo y
  // el dedup la daba por importada para siempre — borrabas una tarea y ya no había
  // forma de traerla del sheet (Pedro, 2026-09-01). Se mira el ESTADO de la idea, no
  // sólo el vínculo: si está sellada, la fila vuelve a ser importable; si se restaura
  // desde la papelera, el vínculo vuelve a valer solo (sin tocar nada).
  const yaVivas = new Set<string>();
  for (const lote of enLotes([...new Set(filas.map((r) => r.key))], LOTE_IN)) {
    const { data, error } = await db
      .from("staged_rows").select("natural_key, ideas(deleted_at)")
      .eq("client_id", clientId).in("natural_key", lote);
    if (error) return fallo(res, `No se pudo leer lo ya sincronizado: ${error.message}`);
    for (const s of (data ?? []) as unknown as { natural_key: string; ideas: unknown }[]) {
      if (tieneIdeaViva(s.ideas)) yaVivas.add(s.natural_key);
    }
  }

  // 2b. Familias existentes de los briefs en juego (una letra por "# Idea").
  const claveFam = (briefId: string, letter: string) => `${briefId}|${letter}`;
  const famPorClave = new Map<string, string>();
  for (const lote of enLotes([...new Set(briefByTab.values())], LOTE_IN)) {
    const { data, error } = await db
      .from("idea_families").select("id, brief_id, letter").in("brief_id", lote);
    if (error) return fallo(res, `No se pudieron leer las familias: ${error.message}`);
    for (const f of (data ?? []) as { id: string; brief_id: string; letter: string }[]) {
      famPorClave.set(claveFam(f.brief_id, f.letter), f.id);
    }
  }

  // ── 3. plan por fila (puro: nada se escribe aquí) ──
  const planes0: Omit<Plan, "briefId">[] = [];
  // Claves ya planeadas en ESTE run: dos filas con la misma clave natural sólo crean
  // una tarea (antes lo garantizaba el orden: la 2ª veía el staged de la 1ª).
  const vistas = new Set<string>();
  for (const row of filas) {
    // skip anything already imported — this is what makes re-sync safe.
    if (yaVivas.has(row.key) || vistas.has(row.key)) {
      res.skipped++;
      continue;
    }
    const v = (f: keyof SheetRow) => (row.edited?.[f] ?? row.data[f] ?? "").trim();

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
    if (faltan.length) {
      res.blocked.push({
        naming: v("Naming") || v("Concepto").slice(0, 40) || row.key,
        tab: row.tab,
        missing: faltan,
      });
      res.skipped++;
      continue;
    }

    const track = classifyTab(row.tab).track!; // no-null: filtrado en el paso 0
    vistas.add(row.key);
    planes0.push({
      row,
      track,
      letter: splitIdeaCode(v("# Idea")).letter, // idea family from "# Idea"
      // El lead con match inteligente ("Nils" → "Nils Vera"), dentro del track; null = sin lead.
      leadId: matchLead(v("Asignación"), track),
      v,
    });
  }

  // ── 3b. briefs nuevos: SÓLO para pestañas con al menos una fila que se va a crear ──
  // Así un run donde todo se bloquea (o una lectura falla y se aborta) no deja un
  // brief vacío atrás; la limpieza del final sólo queda para "los inserts de idea
  // fallaron todos".
  for (const tab of new Set(planes0.map((p) => p.row.tab))) {
    if (briefByTab.has(tab)) continue;
    const info = classifyTab(tab);
    const sample = filas.find((r) => r.tab === tab)!;
    const v = (f: keyof SheetRow) => sample.edited?.[f] ?? sample.data[f] ?? "";

    const { data: brief, error } = await db
      .from("briefs")
      .insert({
        client_id: clientId,
        code: `DIDI-${(info.dateLabel ?? "").replace("/", "")}-${(info.track ?? "").toUpperCase()}`,
        title: info.label,
        brief_name: v("Brief Name") || null,
        track: info.track,
        source_tab: tab,
        status: "active",
        created_by: actorId,
      })
      .select("id").single();

    if (error) {
      res.errors.push(`Brief "${tab}": ${error.message}`);
      continue;
    }
    briefByTab.set(tab, brief.id);
    nuevosBriefIds.add(brief.id);
  }

  const planes: Plan[] = planes0.flatMap((p) => {
    const briefId = briefByTab.get(p.row.tab);
    if (!briefId) {
      res.skipped++; // el brief no se pudo crear: ya quedó el error de arriba
      return [];
    }
    return [{ ...p, briefId }];
  });

  // ── 4. familias que faltan: UN insert (fila a fila si falla) ──
  const faltantes = new Map<string, { brief_id: string; letter: string; name: string | null }>();
  for (const p of planes) {
    const k = claveFam(p.briefId, p.letter);
    if (!famPorClave.has(k) && !faltantes.has(k)) {
      faltantes.set(k, { brief_id: p.briefId, letter: p.letter, name: p.v("Concepto").slice(0, 120) || null });
    }
  }
  const famFallo = new Map<string, string>();
  if (faltantes.size) {
    const filas = [...faltantes.values()];
    type Fam = { id: string; brief_id: string; letter: string };
    const { data, error } = await db
      .from("idea_families").insert(filas).select("id, brief_id, letter");
    if (!error) {
      for (const f of (data ?? []) as Fam[]) famPorClave.set(claveFam(f.brief_id, f.letter), f.id);
    } else {
      for (const f of filas) {
        const { data: c, error: e } = await db
          .from("idea_families").insert(f).select("id, brief_id, letter").single();
        if (e) famFallo.set(claveFam(f.brief_id, f.letter), e.message);
        else famPorClave.set(claveFam(f.brief_id, f.letter), (c as Fam).id);
      }
    }
  }

  // ── 5. variantes: variant_number must be unique per family; the sheet reuses
  // codes, so take the next free slot rather than trusting the number in "# Idea".
  // Se leen las variantes USADAS de las familias en juego (una vez) y se reparten
  // en memoria — cuenta también las de la papelera, porque el índice único no
  // distingue. Las familias recién creadas no tienen ninguna.
  const usados = new Map<string, Set<number>>();
  const famIdsEnJuego = [...new Set(
    planes.map((p) => famPorClave.get(claveFam(p.briefId, p.letter))).filter((x): x is string => !!x),
  )];
  for (const lote of enLotes(famIdsEnJuego, LOTE_IN)) {
    const { data, error } = await db
      .from("ideas").select("family_id, variant_number").in("family_id", lote);
    if (error) return fallo(res, `No se pudieron leer las variantes: ${error.message}`);
    for (const i of (data ?? []) as { family_id: string; variant_number: number }[]) {
      (usados.get(i.family_id) ?? usados.set(i.family_id, new Set()).get(i.family_id)!).add(i.variant_number);
    }
  }

  const creadas: Creada[] = [];
  for (const p of planes) {
    const k = claveFam(p.briefId, p.letter);
    const familyId = famPorClave.get(k);
    if (!familyId) {
      res.errors.push(`${nombre(p)}: familia ${p.letter}: ${famFallo.get(k) ?? "no se pudo crear"}`);
      continue;
    }
    const used = usados.get(familyId) ?? new Set<number>();
    usados.set(familyId, used);
    let variant = 1;
    while (used.has(variant)) variant++;
    used.add(variant);
    creadas.push({ ...p, ideaId: crypto.randomUUID(), familyId, variant });
  }

  const filaIdea = (c: Creada): Record<string, unknown>[] => {
    const { v, track } = c;
    const tipo = v("Tipo de Asset");
    return [{
      id: c.ideaId,
      family_id: c.familyId,
      brief_id: c.briefId,
      track,
      marca_id: resolveMarca(v("Marca")),
      variant_number: c.variant,
      naming_base: v("Naming") || null,
      naming_kind: tipo ? namingKindForTipo(tipo) : "real",
      genero_code: labelToCode(V, "genero", track, v("Género")) || null,
      formato_code: labelToCode(V, "formato", track, v("Formato")) || null,
      mes_code: v("Mes") ? `${v("Mes").toUpperCase()}26` : null,
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
      created_by: actorId,
    }];
  };

  // ── 6. ideas: UN insert. `code` (A1) lo pone el trigger set_idea_code. ──
  const { ok: vivas } = await escribirEnLote(db, "ideas", creadas, filaIdea, (c, msg) =>
    res.errors.push(`${nombre(c)}: idea: ${msg}`),
  );
  res.created = vivas.length;

  // ── 7. lead ── el sheet trae al LEAD → idea_assignments con es_lead=true. Si no
  // hubo match, la tarea queda SIN lead (se asigna a mano; luego el lead elige a
  // los especialistas dentro de la app, es_lead=false — Fase 2).
  await escribirEnLote(
    db, "idea_assignments",
    vivas.filter((c) => c.leadId),
    (c) => [{ idea_id: c.ideaId, member_id: c.leadId, es_lead: true, assigned_by: actorId }],
    (c, msg) => res.errors.push(`lead de ${nombre(c)}: ${msg}`),
  );

  // ── 8. assets: every Tamaño × Plataforma the row asks for ──
  // Un copy es texto: no tiene proporción ni archivo. El fallback de antes
  // ("9:16" × "FB" cuando la fila no traía Tamaño ni Plataforma) le inventó
  // a las 2 filas de Copies un entregable llamado
  // SINNAMING_9X16_TEXTO_STATIC_IDEAX1_GG_V1_SINMES_RN — cuatro valores
  // inventados apilados, camino a una entrega. Sin fallback: si un tipo que
  // sí entrega archivos llega sin Tamaño o Plataforma, el gate de arriba ya
  // lo bloqueó.
  // Dedupe igual que `durs`: una celda sucia ("9:16, 9:16" / "Meta, Meta")
  // generaría filas idénticas de asset → chocan con el índice único y tumban TODO
  // el insert → la idea queda con CERO archivos aunque se marcó importada. (reap 2026-08-26)
  const filasAsset = (c: Creada): Record<string, unknown>[] => {
    const { v, track } = c;
    const tipo = v("Tipo de Asset");
    const namingKind = tipo ? namingKindForTipo(tipo) : "real";
    const sizes = [...new Set(list(v("Tamaño")).map(cleanSize).filter(Boolean))];
    const plats = [...new Set(list(v("Plataforma")))];
    // Mismo valor que pone el trigger set_idea_code (letra + variante): el sheet
    // manda si trae "# Idea"; si no, el código de la idea.
    const ideaToken = v("# Idea") || `${c.letter}${c.variant}`;
    // Fan-out por duración: cada duración es su propio archivo (tamaño × plat ×
    // duración). Los estáticos no duran → una sola fila por tamaño×plat
    // (duracion_code null). Un video sin duración → también una fila (null).
    // Dedupe: una celda sucia ("15-30s, 15-30s") no debe crear dos filas
    // idénticas → chocarían con el índice único y tumbarían TODA la fila.
    const durs = [...new Set(list(v("Duración")))];
    const durCodes = namingKind === "static" ? [null] : durs.length ? durs : [null];
    const out: Record<string, unknown>[] = [];
    for (const size of generatesFiles(tipo) ? sizes : []) {
      for (const plat of plats) {
        for (const dur of durCodes) {
          out.push({
            idea_id: c.ideaId,
            brief_id: c.briefId,
            track,
            naming_kind: namingKind,
            naming_base: v("Naming") || "SINNAMING",
            tamano_code: size,
            plataforma_code: plat,
            duracion_code: dur,
            genero_code: labelToCode(V, "genero", track, v("Género")) || null,
            formato_code: labelToCode(V, "formato", track, v("Formato")) || null,
            idea_code: ideaToken,     // verbatim from the sheet, so filenames match
            mes_code: v("Mes") ? `${v("Mes").toUpperCase()}26` : "SINMES",
            version: 1,
            status: "todo",
          });
        }
      }
    }
    return out;
  };
  const assets = await escribirEnLote(db, "assets", vivas, filasAsset, (c, msg) =>
    res.errors.push(`assets de ${nombre(c)}: ${msg}`),
  );
  res.assets = assets.filas;

  // ── 9. remember it, so a future sync knows this row is done ──
  // Este upsert ES el marcador de dedup. Si falla en silencio, la próxima sync no
  // encuentra el registro y RE-IMPORTA la fila → tarea duplicada en prod. Se revisa
  // y se avisa para reconciliar a mano (reap).
  const ahora = new Date().toISOString();
  await escribirEnLote(
    db, "staged_rows", vivas,
    (c) => [{
      client_id: clientId,
      source_tab: c.row.tab,
      source_row: c.row.rowNumber,
      track: c.track,
      natural_key: c.row.key,
      row_hash: c.row.hash,
      diff: "new",
      status: "approved",
      data: c.row.data,
      edited: c.row.edited ?? null,
      idea_id: c.ideaId,
      reviewed_by: actorId,
      reviewed_at: ahora,
    }],
    (c, msg) => res.errors.push(
      `Se creó la tarea de «${nombre(c)}» pero no se pudo marcar como importada — re-sincronizar podría duplicarla. Revísalo: ${msg}`,
    ),
    { onConflict: "client_id,natural_key" },
  );

  // ── 10. limpieza: briefs creados ESTE run que quedaron SIN ideas ──
  // Sólo pasa si TODOS los inserts de idea de ese brief fallaron (los briefs se crean
  // sólo para pestañas con filas planeadas). Un brief vacío es basura que ensucia el
  // tablero y la tarjeta de cliente ("1 BRIEF" fantasma).
  const conIdeas = new Set(vivas.map((c) => c.briefId));
  const vacios = [...nuevosBriefIds].filter((id) => !conIdeas.has(id));
  if (vacios.length) {
    // Re-contar en la BASE antes de borrar: otro import a la vez pudo haber reusado
    // este brief (lo encuentra por source_tab) y colgado ideas — borrarlo en cascada
    // las destruiría. Sólo se borra el que sigue vacío DE VERDAD. (review 2026-09-02)
    const { data: conAlgo } = await db.from("ideas").select("brief_id").in("brief_id", vacios);
    const ocupados = new Set(((conAlgo ?? []) as { brief_id: string }[]).map((i) => i.brief_id));
    const borrar = vacios.filter((id) => !ocupados.has(id));
    if (borrar.length) await db.from("briefs").delete().in("id", borrar);
  }

  res.ok = res.errors.length === 0;
  return res;
}

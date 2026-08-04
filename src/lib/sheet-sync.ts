// Google Sheets → Greenlight import.
//
// Source adapters:
//   csv          — public CSV export. Zero setup, works while the sheet is
//                  link-shared. Used for the current DiDi sheet.
//   apps_script  — an Apps Script web app the team deploys on their own sheet.
//                  Works on PRIVATE sheets and can list tabs. Production path.
//
// SAFETY: Google silently returns the FIRST tab when you ask for a tab name
// that doesn't exist. We therefore validate the header row on every fetch and
// refuse to import anything whose columns don't match the expected schema.

export const SHEET_COLUMNS = [
  "# Entrega",
  "Asignación",
  "Comentarios Leads",
  "Peloteo",
  "Marca",
  "Plataforma",
  "Tipo de Asset",
  "Formato",
  "Concepto",
  "Selling Points",
  "Referencias",
  "Tamaño",
  "Duración",
  "# Idea",
  "Versión",
  "Género",
  "Naming",
  "Mes",
  "Brief Name",
  "Entrega final",
] as const;

export type SheetColumn = (typeof SHEET_COLUMNS)[number];
export type SheetRow = Partial<Record<SheetColumn, string>>;

/** RFC4180-ish CSV parser: handles quoted fields, embedded commas and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * Map a header row to column indexes. Returns null when the header clearly
 * isn't our schema (which is how we detect Google's silent wrong-tab fallback).
 */
export function mapHeader(header: string[]): Record<SheetColumn, number> | null {
  const index: Partial<Record<SheetColumn, number>> = {};
  const seen = header.map(norm);
  for (const col of SHEET_COLUMNS) {
    const at = seen.indexOf(norm(col));
    if (at !== -1) index[col] = at;
  }
  // Require the identifying columns; a different tab won't have these.
  const required: SheetColumn[] = ["# Entrega", "Asignación", "Marca", "Naming", "# Idea"];
  if (required.some((c) => index[c] === undefined)) return null;
  return index as Record<SheetColumn, number>;
}

export type ParsedSheet = {
  rows: { rowNumber: number; data: SheetRow }[];
  skippedEmpty: number;
};

/** Parse a whole CSV export into typed rows, dropping blank ones. */
export function parseSheetCsv(csv: string): ParsedSheet | { error: string } {
  return rowsFromGrid(parseCsv(csv));
}

/**
 * Shared by both adapters (CSV export and Apps Script) so the header guard and
 * blank-row handling can never drift between them.
 */
export function rowsFromGrid(grid: string[][]): ParsedSheet | { error: string } {
  if (!grid.length) return { error: "La hoja está vacía." };

  const index = mapHeader(grid[0]);
  if (!index) {
    return {
      error:
        "Las columnas no coinciden con el formato esperado. " +
        "Verifica que la pestaña exista y tenga el encabezado correcto.",
    };
  }

  const rows: ParsedSheet["rows"] = [];
  let skippedEmpty = 0;

  for (let r = 1; r < grid.length; r++) {
    const raw = grid[r];
    const data: SheetRow = {};
    for (const col of SHEET_COLUMNS) {
      const at = index[col];
      const v = at !== undefined ? (raw[at] ?? "").trim() : "";
      if (v) data[col] = v;
    }
    // A row counts only if it carries real content (not just a stray cell).
    const meaningful =
      (data["Naming"] || data["Concepto"] || data["# Idea"] || data["Tipo de Asset"]) ?? "";
    if (!meaningful) {
      skippedEmpty++;
      continue;
    }
    rows.push({ rowNumber: r + 1, data }); // 1-based, +1 for the header
  }

  return { rows, skippedEmpty };
}

/**
 * Stable identity for a sheet row. Row numbers shift when rows are inserted,
 * so identity is semantic: the fields that make a task unique.
 */
export function naturalKey(tab: string, data: SheetRow): string {
  const part = (v?: string) => norm(v ?? "");
  return [
    norm(tab),
    part(data["Marca"]),
    part(data["Naming"]),
    part(data["# Idea"]),
    part(data["Versión"]),
    part(data["Tipo de Asset"]),
  ].join("|");
}

/** Content fingerprint — detects edits to an already-imported row. */
export function rowHash(data: SheetRow): string {
  const s = SHEET_COLUMNS.map((c) => `${c}=${(data[c] ?? "").trim()}`).join("");
  // FNV-1a, 32-bit — enough to spot changes; not security-sensitive.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export type DiffStatus = "new" | "updated" | "unchanged";

/** Compare freshly-fetched rows against what we've already imported. */
export function diffRows(
  tab: string,
  rows: ParsedSheet["rows"],
  known: Map<string, string>, // naturalKey -> rowHash
): { rowNumber: number; data: SheetRow; key: string; hash: string; status: DiffStatus }[] {
  return rows.map((r) => {
    const key = naturalKey(tab, r.data);
    const hash = rowHash(r.data);
    const prev = known.get(key);
    const status: DiffStatus = prev === undefined ? "new" : prev === hash ? "unchanged" : "updated";
    return { rowNumber: r.rowNumber, data: r.data, key, hash, status };
  });
}

/** Public CSV export URL for one tab. */
export function csvUrl(spreadsheetId: string, tab: string): string {
  return (
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq` +
    `?tqx=out:csv&sheet=${encodeURIComponent(tab)}`
  );
}

/** Which track a tab belongs to, inferred from its name ("Real (…)" / "Normal (…)"). */
export function trackForTab(tab: string): "real" | "normal" | null {
  const n = norm(tab);
  if (n.startsWith("real")) return "real";
  if (n.startsWith("normal")) return "normal";
  return null;
}

// ─────────────────────────────────────────────────────────────
// Tab classification
//
// A PROJECT is one tab: a track (Real | Normal) plus a date.
// Canonical name:  Real (Card/Préstamos | Brief 24/07)
// Marca is per-ROW, not per-tab — a project can hold Card and Préstamos tasks.
//
// Tabs that don't match are surfaced as "unrecognized" rather than silently
// skipped: once the naming convention is the standard, a name that doesn't
// parse is a mistake someone should see.
// ─────────────────────────────────────────────────────────────

export type TabKind = "project" | "template" | "control" | "unrecognized";

export type TabInfo = {
  name: string;
  kind: TabKind;
  track: "real" | "normal" | null;
  /** As written in the tab name, e.g. "24/07". */
  dateLabel: string | null;
  /** Sortable YYYYMMDD; newest first. Null when undated. */
  dateSort: number | null;
  label: string;
};

// The word "Brief" is optional: older tabs are named "Real (Card/Préstamos | 10/07 )".
// Track, parentheses, pipe and a DD/MM date are still required, so this stays a
// real guard — it just accepts the same information written two ways.
const PROJECT_RE =
  /^(real|normal)\s*\(.*?\|\s*(?:brief\s*)?(\d{1,2})\s*\/\s*(\d{1,2})\s*\)\s*$/i;

/**
 * Turn "24/07" into a sortable number. The tab name carries no year, so we
 * assume the current one — unless that lands more than 2 months in the future,
 * which means it belongs to last year (December tabs read in January).
 */
function dateSortFrom(day: number, month: number, today = new Date()): number {
  const year = today.getFullYear();
  const candidate = new Date(year, month - 1, day);
  const twoMonthsOut = new Date(today.getTime() + 62 * 864e5);
  const y = candidate > twoMonthsOut ? year - 1 : year;
  return y * 10000 + month * 100 + day;
}

export function classifyTab(name: string, today?: Date): TabInfo {
  const trimmed = name.trim();
  const n = norm(trimmed);

  if (n.startsWith("template") || n.startsWith("plantilla")) {
    return {
      name: trimmed,
      kind: "template",
      track: trackForTab(trimmed.replace(/^template\s*/i, "")),
      dateLabel: null,
      dateSort: null,
      label: "Plantilla",
    };
  }

  if (n === "control") {
    return { name: trimmed, kind: "control", track: null, dateLabel: null, dateSort: null, label: "Control" };
  }

  const m = trimmed.match(PROJECT_RE);
  if (m) {
    const track = m[1].toLowerCase() as "real" | "normal";
    const day = Number(m[2]);
    const month = Number(m[3]);
    const dateLabel = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
    return {
      name: trimmed,
      kind: "project",
      track,
      dateLabel,
      dateSort: dateSortFrom(day, month, today),
      label: `Brief ${dateLabel}`,
    };
  }

  return {
    name: trimmed,
    kind: "unrecognized",
    track: trackForTab(trimmed),
    dateLabel: null,
    dateSort: null,
    label: trimmed,
  };
}

/** Classify every tab and sort projects newest-first. */
export function classifyTabs(names: string[], today?: Date): TabInfo[] {
  const all = names.map((n) => classifyTab(n, today));
  const rank: Record<TabKind, number> = { project: 0, unrecognized: 1, template: 2, control: 3 };
  return all.sort((a, b) => {
    if (rank[a.kind] !== rank[b.kind]) return rank[a.kind] - rank[b.kind];
    if (a.kind === "project" && b.kind === "project") {
      if ((b.dateSort ?? 0) !== (a.dateSort ?? 0)) return (b.dateSort ?? 0) - (a.dateSort ?? 0);
      return a.track === b.track ? 0 : a.track === "real" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

// ─────────────────────────────────────────────────────────────
// Apps Script adapter
// ─────────────────────────────────────────────────────────────

export type AppsScriptTab = { name: string; gid: number; position: number; rows: number; hidden: boolean };

function scriptUrl(base: string, secret: string, tab?: string): string {
  const u = new URL(base);
  u.searchParams.set("secret", secret);
  if (tab) u.searchParams.set("tab", tab);
  return u.toString();
}

/** List every tab in the spreadsheet (full names — this is what CSV can't do). */
export async function fetchTabsViaScript(base: string, secret: string): Promise<AppsScriptTab[]> {
  const res = await fetch(scriptUrl(base, secret), { cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`El script respondió HTTP ${res.status}.`);
  const body = await res.json();
  if (body.error) throw new Error(scriptError(body.error, body.hint));
  return body.tabs as AppsScriptTab[];
}

/** Fetch one tab's rows as typed SheetRows, applying the same header guard. */
export async function fetchRowsViaScript(
  base: string,
  secret: string,
  tab: string,
): Promise<ParsedSheet | { error: string }> {
  const res = await fetch(scriptUrl(base, secret, tab), { cache: "no-store", redirect: "follow" });
  if (!res.ok) return { error: `El script respondió HTTP ${res.status}.` };
  const body = await res.json();
  if (body.error) return { error: scriptError(body.error, body.hint) };
  return rowsFromGrid([body.header as string[], ...(body.rows as string[][])]);
}

function scriptError(code: string, hint?: string): string {
  if (code === "unauthorized") return "Contraseña incorrecta para el script de la hoja.";
  if (code === "tab_not_found") return "Esa pestaña ya no existe en la hoja.";
  if (code === "setup_incomplete") return hint ?? "Falta configurar el script en la hoja.";
  return hint ? `${code} — ${hint}` : code;
}

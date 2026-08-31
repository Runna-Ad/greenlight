"use server";

import {
  classifyTabs,
  csvUrl,
  diffRows,
  fetchRowsViaScript,
  fetchTabsViaScript,
  parseSheetCsv,
  type SheetRow,
  type TabInfo,
} from "@/lib/sheet-sync";
import { getCurrentUser } from "@/lib/identity";
import { canCreateBrief, tracksVisibles } from "@/lib/roles";
import type { Track } from "@/lib/vocab";

type SyncConfig =
  | { kind: "apps_script"; scriptUrl: string; secret: string }
  | { kind: "csv"; spreadsheetId: string; tabs: string[] };

/** What the CLIENT is allowed to know — never includes credentials. */
export type SyncMode = { kind: "apps_script" | "csv" };

// Fallback while a client has no Apps Script connected.
const DIDI_SHEET = "16QAbNy9sljgm610uTLwIIGDbZAv5_d0o4L0Iu3_JTjA";
const FALLBACK_TABS = [
  "Real (Card/Préstamos | Brief 24/07)",
  "Normal (Card/Préstamos | Brief 24/07)",
];

/**
 * Resolved SERVER-SIDE only. The secret must never be passed to a client
 * component — Next serializes client props into the RSC payload, which ships
 * in the HTML. (This shipped once; caught by a leak check against production.)
 */
function resolveConfig(): SyncConfig {
  const scriptUrl = process.env.SHEETS_SCRIPT_URL;
  const secret = process.env.SHEETS_SCRIPT_SECRET;
  if (scriptUrl && secret) return { kind: "apps_script", scriptUrl, secret };
  return { kind: "csv", spreadsheetId: DIDI_SHEET, tabs: FALLBACK_TABS };
}

/** Safe for the client: which mode we're in, and nothing else. */
export async function getSyncMode(): Promise<SyncMode> {
  return { kind: resolveConfig().kind };
}

/** One project = one tab. */
export type ProjectPreview = TabInfo & {
  nuevas: number;
  actualizadas: number;
  sinCambios: number;
  error?: string;
  rows: {
    rowNumber: number;
    key: string;
    hash: string;
    status: "new" | "updated" | "unchanged";
    data: SheetRow;
  }[];
};

/** Un lead DEPARTAMENTAL sólo ve/pre-visualiza las pestañas de su(s) track(s) otorgado(s)
 *  — igual que el IMPORT (import.ts) ya lo hace, y que crearBrief. `tracksVisibles` da null
 *  para admin/master (ven todas) y el grant del lead (1 o 2 tracks) para un lead; un lead de
 *  AMBOS tracks las ve todas, uno de un solo track sólo el suyo. Las pestañas sin track
 *  (control/plantillas) pasan siempre. (reap track-scope — paridad con import) */
function tabsVisibles(tabs: TabInfo[], tv: Track[] | null): TabInfo[] {
  if (tv === null) return tabs; // admin/master: todas
  return tabs.filter((t) => t.track === null || tv.includes(t.track));
}

/** Step 1 — list what's in the spreadsheet, classified. No row data yet. */
export async function listProjects(): Promise<{ tabs: TabInfo[]; error?: string }> {
  const u = await getCurrentUser();
  if (!u || !canCreateBrief(u.role)) return { tabs: [], error: "No autorizado." };
  const tv = tracksVisibles(u.role, u.member?.tracks ?? null);
  const config = resolveConfig();
  if (config.kind === "csv") {
    // CSV export can't enumerate tabs; we can only look at the configured ones.
    return { tabs: tabsVisibles(classifyTabs(config.tabs), tv) };
  }
  try {
    const tabs = await fetchTabsViaScript(config.scriptUrl, config.secret);
    // Hidden tabs are almost always scratch work — keep them out of the list.
    return { tabs: tabsVisibles(classifyTabs(tabs.filter((t) => !t.hidden).map((t) => t.name)), tv) };
  } catch (e) {
    return { tabs: [], error: e instanceof Error ? e.message : "Error desconocido." };
  }
}

/**
 * Step 2 — read the chosen projects and report what WOULD be imported.
 * Read-only: nothing is written until the lead approves.
 */
export async function previewProjects(
  tabs: TabInfo[],
  known: Record<string, string> = {},
): Promise<ProjectPreview[]> {
  const u = await getCurrentUser();
  if (!u || !canCreateBrief(u.role)) return [];
  // Mismo scope por track que listProjects/import: un lead sólo pre-visualiza sus tracks
  // (previewProjects recibe `tabs` del cliente → hay que re-filtrar, no confiar en la UI).
  const tv = tracksVisibles(u.role, u.member?.tracks ?? null);
  const config = resolveConfig();
  const knownMap = new Map(Object.entries(known));

  return Promise.all(
    tabsVisibles(tabs, tv).map(async (info): Promise<ProjectPreview> => {
      const base: ProjectPreview = { ...info, nuevas: 0, actualizadas: 0, sinCambios: 0, rows: [] };
      try {
        const parsed =
          config.kind === "apps_script"
            ? await fetchRowsViaScript(config.scriptUrl, config.secret, info.name)
            : await fetchCsv(config.spreadsheetId, info.name);

        if ("error" in parsed) return { ...base, error: parsed.error };

        const rows = diffRows(info.name, parsed.rows, knownMap);
        return {
          ...base,
          rows,
          nuevas: rows.filter((r) => r.status === "new").length,
          actualizadas: rows.filter((r) => r.status === "updated").length,
          sinCambios: rows.filter((r) => r.status === "unchanged").length,
        };
      } catch (e) {
        return { ...base, error: e instanceof Error ? e.message : "Error desconocido." };
      }
    }),
  );
}

async function fetchCsv(spreadsheetId: string, tab: string) {
  const res = await fetch(csvUrl(spreadsheetId, tab), { cache: "no-store" });
  if (!res.ok) return { error: `No se pudo leer la pestaña (HTTP ${res.status}).` };
  return parseSheetCsv(await res.text());
}

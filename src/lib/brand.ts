// Greenlight — domain vocabulary & labels (Spanish UI).
// Single source of truth for enum labels + presentation. DB stores codes; UI reads here.

export type AssetStatus =
  | "todo"
  | "in_progress"
  | "under_review"
  | "in_corrections"
  | "completed"
  | "published"
  | "delivered";

// El tablero muestra el ciclo COMPLETO: los 5 estados internos + "Con Cliente"
// (published) + "Greenlit" (delivered ≤7 días; los más viejos viven en Entregas-archivo).
export const KANBAN_STATUSES: AssetStatus[] = [
  "todo",
  "in_progress",
  "under_review",
  "in_corrections",
  "completed",
  "published",
  "delivered",
];

export const STATUS_LABEL: Record<AssetStatus, string> = {
  todo: "Por hacer",
  in_progress: "En progreso",
  under_review: "En revisión",
  in_corrections: "En correcciones",
  completed: "Completado",
  published: "Publicado",
  delivered: "Entregado",
};

/**
 * Mirror of produccion.transition_allowed(). The DB is authoritative — a
 * BEFORE UPDATE trigger raises on an illegal move — but the board needs to know
 * the legal targets BEFORE the drop, so it can dim the columns you can't reach
 * instead of letting you find out via an error toast.
 *
 * Duplicated logic across layers gets pinned with a contract test: test-db.mjs
 * checks all 49 pairs against the SQL function (same guarantee as buildFilename).
 */
export const ALLOWED_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  todo: ["in_progress"],
  in_progress: ["under_review"],
  under_review: ["in_corrections", "completed"],
  in_corrections: ["in_progress", "under_review"],
  completed: ["published", "delivered"],
  published: ["in_corrections", "delivered"],
  delivered: [],
};

export const canMove = (from: AssetStatus, to: AssetStatus): boolean =>
  from === to || ALLOWED_TRANSITIONS[from].includes(to);

// Maps to the --status-* CSS tokens (see globals.css).
export const STATUS_TOKEN: Record<AssetStatus, string> = {
  todo: "todo",
  in_progress: "progress",
  under_review: "review",
  in_corrections: "corrections",
  completed: "completed",
  published: "published",
  delivered: "delivered",
};

// Platforms — pleca color code (TikTok black, Facebook blue, Google green).
export type Platform = "TT" | "FB" | "GG";
export const PLATFORM_LABEL: Record<Platform, string> = {
  TT: "TikTok",
  FB: "Facebook",
  GG: "Google",
};

// Asset types — right-side card color (static light purple, normal dark purple, real person orange).
export type AssetType = "real" | "normal" | "static" | "copy";
export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  real: "Real Person",
  normal: "Normal Video",
  static: "Estático",
  copy: "Copies",
};

// The 5 named pods (tripletas).
export const PODS = [
  "Lorem Ipsum",
  "Champs",
  "4x4 Terrenator",
  "Beta Tester",
  "Neptunianos",
] as const;
export type Pod = (typeof PODS)[number];

// DiDi product lines (marcas) — each has its own deck template + legales.
export type Marca = "Card" | "Préstamos";

// Size↔platform validity: which platforms get a file for each size. Cada plataforma
// sigue siendo SU archivo (un código por nombre); esto sólo decide cuáles existen.
// Fuente: tablas "Formatos por red" de DiDi en Notion (2026-11-12). Los videos cambian
// por línea (Préstamos / Card); los estáticos son iguales para las dos. Un tamaño que
// la línea no lleva va con lista vacía (no "abierto"). EC no tiene regla: DiDi lo pide
// siempre por separado.
type TablaTamanos = Record<"video" | "static", Record<string, Platform[]>>;

const ESTATICOS: Record<string, Platform[]> = {
  "1:1": ["GG"],
  "9:16": ["FB"],
  "4:5": ["FB"],
  "1.91:1": ["GG"],
};

export const SIZE_PLATFORMS_POR_MARCA: Record<Marca, TablaTamanos> = {
  Préstamos: {
    video: { "1:1": ["GG"], "9:16": ["FB", "TT", "GG"], "4:5": ["FB"], "16:9": ["GG"] },
    static: ESTATICOS,
  },
  Card: {
    video: { "1:1": ["FB"], "9:16": ["FB", "TT", "GG"], "4:5": [], "16:9": ["GG"] },
    static: ESTATICOS,
  },
};

// Sin línea (tarea sin Marca): la suma de las dos, para no quitar un archivo que
// alguna de las dos sí lleva.
export const SIZE_PLATFORMS: TablaTamanos = {
  video: { "1:1": ["GG", "FB"], "9:16": ["FB", "TT", "GG"], "4:5": ["FB"], "16:9": ["GG"] },
  static: ESTATICOS,
};

/** La tabla de la línea ("Préstamos"/"Card", sin importar acentos ni mayúsculas). */
export function tablaTamanos(marca: string | null | undefined): TablaTamanos {
  const f = (marca ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (f === "prestamos" || f === "loans") return SIZE_PLATFORMS_POR_MARCA["Préstamos"];
  if (f === "card") return SIZE_PLATFORMS_POR_MARCA.Card;
  return SIZE_PLATFORMS;
}

export const APP_NAME = "Greenlight";

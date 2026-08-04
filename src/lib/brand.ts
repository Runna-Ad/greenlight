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

// The 5 internal kanban states (published/delivered live past the board).
export const KANBAN_STATUSES: AssetStatus[] = [
  "todo",
  "in_progress",
  "under_review",
  "in_corrections",
  "completed",
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
  in_corrections: ["in_progress"],
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

// Size↔platform validity matrix (Margaret's W2 note). Which platforms accept each size.
export const SIZE_PLATFORMS: Record<
  "video" | "static",
  Record<string, Platform[]>
> = {
  video: {
    "1:1": ["GG", "FB", "TT"],
    "9:16": ["FB", "TT", "GG"],
    "4:5": ["FB"],
    "16:9": ["GG"],
  },
  static: {
    "1:1": ["GG", "FB", "TT"],
    "9:16": ["FB", "TT"],
    "4:5": ["GG", "FB"],
    "1.91:1": ["GG", "TT"],
  },
};

export const APP_NAME = "Greenlight";

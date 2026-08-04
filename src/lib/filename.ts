// Filename builder — MUST mirror produccion.build_filename() in the DB exactly.
// The DB (trigger) is authoritative; this is for live preview in the intake UI.
// Pinned to the DB by the contract test in scripts/test-db.mjs.
import type { NamingKind } from "@/lib/database.types";

// Mirror of produccion.norm_token(): ':'→'x', drop spaces & slashes
// (so Género "N/A" becomes "NA" and is omitted), keep hyphens/dots because
// real filenames carry them (e.g. "20-30s", "1.91x1"). Uppercase.
export function normToken(t: string | null | undefined): string {
  return (t ?? "")
    .replace(/:/g, "x")
    .replace(/[^A-Za-z0-9.\-]/g, "")
    .toUpperCase();
}

export type FilenameTokens = {
  kind: NamingKind;
  base: string | null | undefined;
  tamano: string | null | undefined;
  duracion?: string | null;
  genero?: string | null;
  formato?: string | null;
  idea: string | null | undefined;
  plataforma: string | null | undefined;
  version: number;
  mes: string | null | undefined;
};

export function buildFilename(t: FilenameTokens): string {
  const parts: string[] = [];
  parts.push(normToken(t.base));
  parts.push(normToken(t.tamano));

  if (t.kind !== "static") parts.push(normToken(t.duracion));

  const g = normToken(t.genero);
  if (g !== "" && g !== "NA") parts.push(g);

  parts.push(t.kind === "real" ? "REAL" : normToken(t.formato));
  parts.push(t.kind === "static" ? "STATIC" : "VIDEO");
  parts.push("IDEA" + normToken(t.idea));
  parts.push(normToken(t.plataforma));
  parts.push("V" + (t.version ?? 1).toString());
  parts.push(normToken(t.mes));
  parts.push("RN"); // fixed Rünna signature

  // Never emit empty tokens — a missing field must not produce "A__B".
  return parts.filter((p) => p !== "").join("_");
}

// Validate a manual override against the general token shape (matches the DB CHECK).
export function isValidOverride(name: string): boolean {
  return /^[A-Z0-9.\-]+(_[A-Z0-9.\-]+)+$/.test(name);
}

// Tipo de Asset (sheet vocabulary) → which naming formula applies.
export function namingKindForTipo(tipo: string): "real" | "normal" | "static" {
  if (tipo === "RP Video") return "real";
  if (tipo === "Images" || tipo === "Copies") return "static";
  return "normal"; // Normal Video, AIGC video, GIF
}

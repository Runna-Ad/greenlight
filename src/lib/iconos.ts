// Íconos del intake: Content Type y Channels (wireframe "banda de marca").
//
// Un solo lugar para el mapa tipo→ícono y plataforma→ícono/color, para que la
// banda y cualquier otra vista los pinten igual. Los colores de plataforma
// salen de los tokens --plat-* que ya usa la pleca (una sola fuente de color).

import { Image, Clapperboard, Video, FileText, type LucideIcon } from "lucide-react";
// Import relativo (no alias @/): estos módulos también los carga el harness de
// tests con node, que no resuelve el alias en imports de valor.
import { varianteGuion } from "./plantilla.ts";

export type ContentType = {
  label: string;
  icon: LucideIcon;
};

/**
 * Los tres tipos de contenido del wireframe:
 *   imagen estática · video animado · video persona real
 * Se derivan del Tipo de Asset del sheet (RP Video, Images, Normal Video…).
 */
export function contentType(tipoAsset: string | null | undefined): ContentType {
  const t = (tipoAsset ?? "").trim();
  if (t === "Images") return { label: "Imagen estática", icon: Image };
  if (t === "Copies") return { label: "Copies", icon: FileText };
  // RP Video → persona real; el resto de videos → animado/normal.
  return varianteGuion(t) === "real"
    ? { label: "Video persona real", icon: Video }
    : { label: "Video animado", icon: Clapperboard };
}

export type Canal = {
  code: string;
  label: string;
  color: string;
};

const CANAL_LABEL: Record<string, string> = {
  GG: "Google",
  FB: "Facebook",
  TT: "TikTok",
  EC: "Canal extra",
};

const CANAL_COLOR: Record<string, string> = {
  GG: "var(--plat-gg)",
  FB: "var(--plat-fb)",
  TT: "var(--plat-tt)",
};

/** Cada plataforma con su etiqueta y su color (para los badges de Channels). */
export function canales(plataformas: string[]): Canal[] {
  return plataformas.map((code) => ({
    code,
    label: CANAL_LABEL[code] ?? code,
    // EC y lo desconocido caen en neutro, como en la pleca.
    color: CANAL_COLOR[code] ?? "var(--muted-foreground)",
  }));
}

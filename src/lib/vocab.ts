// SOURCE OF TRUTH for intake vocabularies.
// Extracted verbatim from the DiDi sheet's data-validation rules
// (tabs "Real (Card/Préstamos | Brief 24/07)" and "Normal (…)", 2026-07-30).
// Do NOT rename these labels — the team reads them as-is.

export type Track = "real" | "normal";

export const TRACK_LABEL: Record<Track, string> = {
  real: "Real",
  normal: "Normal",
};

export const TRACK_HINT: Record<Track, string> = {
  real: "Real Person · equipo in-house / UGC",
  normal: "Ilustración, stock, 3D, AI · equipo normal",
};

// ── Shared across both tracks ──
export const ENTREGA = ["1ra entrega", "2da entrega"];
export const MARCA = ["Card", "Préstamos"];
export const PLATAFORMA = ["GG", "FB", "TT", "EC"]; // EC = extra channel
export const PLATAFORMA_LABEL: Record<string, string> = {
  GG: "Google",
  FB: "Facebook",
  TT: "TikTok",
  EC: "Extra channel",
};
export const GENERO = ["WOMANMAN", "WOMAN", "MAN", "N/A"];
export const TAMANO = ["1:1", "16:9", "9:16", "4:5", "2736 x 1260"];
// Buckets de duración (sugerencias). No limitan: se puede escribir cualquier
// rango. Cada duración es una pastilla y genera su propio juego de archivos.
export const DURACION = ["10-15s", "15-30s", "20-30s", "30-40s", "40-50s", "50-60s"];

// ── Track-specific ──
// Note: the Real tab carries TWO Tipo de Asset validations (rows 2–6 use the
// short list, 7+ the long one) — sheet drift. We use the fuller list for Real.
export const TIPO_ASSET: Record<Track, string[]> = {
  real: ["RP Video", "Normal Video", "Images", "Copies", "AIGC video", "GIF"],
  normal: ["RP Video", "Normal Video", "Images", "Copies", "AIGC video", "GIF"],
};

export const FORMATO: Record<Track, string[]> = {
  real: ["IN-HOUSE", "UGC"],
  normal: [
    "Ilustración",
    "Stock",
    "Creador",
    "Ilustración 3D",
    "Stock + Ilustración",
    "Stock + 3D",
    "Creador + ilustración",
    "Creador + Stock",
    "Texto",
    "AI",
  ],
};

// Asignación differs per track — these are the actual people in each pool.
export type Person = { name: string; color: string };
export const ASIGNACION: Record<Track, Person[]> = {
  real: [
    { name: "Vero", color: "#fce8b2" },
    { name: "Flor", color: "#c9daf8" },
    { name: "Clau J", color: "#f4cccc" },
    { name: "Galie", color: "#d9ead3" },
    { name: "Mony", color: "#8e7cc3" },
    { name: "Sebas", color: "#666666" },
    { name: "Mike", color: "#e06666" },
    { name: "Javi", color: "#3c78d8" },
    { name: "Diego", color: "#6aa84f" },
    { name: "Lupita", color: "#e69138" },
  ],
  normal: [
    { name: "Viri", color: "#d9ead3" },
    { name: "Karla", color: "#f9cb9c" },
    { name: "Dany", color: "#3c78d8" },
    { name: "Clau T", color: "#a64d9e" },
  ],
};

// Free-text columns keep real examples as placeholders (from the sheet).
export const PLACEHOLDER = {
  concepto: "Recrear este asset toma por toma, actualizar selling points",
  selling_points: "Hasta 6% de CASHBACK*\nLímite de crédito de hasta $60,000",
  referencias: "https://vt.tiktok.com/…\nhttps://drive.google.com/…",
  duracion: "15s-30s  ·  10-40s  ·  20-30s",
  idea: "A4",
  version: "V1",
  naming: "SPAPVOYTOURISM",
  mes: "AUG",
  brief_name: "Voyager Recreation Local - August",
  entrega_final: "AGOSTO 7",
  peloteo: "Notas libres, contexto, ideas sueltas…",
};

// Dark text is unreadable on the darker chips — pick per luminance.
export function chipTextColor(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1f1f1f" : "#ffffff";
}

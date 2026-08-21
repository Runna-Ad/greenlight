import { fold } from "./intake-crear";

// Phase B — regla DETERMINISTA de "qué legal aplica a este guión". Los triggers
// (CASHBACK / MSI / promo) viven en los TÍTULOS de los legales (que vienen de
// Notion), así que clasificamos por título — una sola fuente, nada que mantener
// aparte. Determinista a propósito: la selección de un legal debe ser confiable,
// no adivinada por IA. Sugiere; el humano confirma (Adjuntar).

export type LegalLite = { id: string; title: string; body: string };
type Categoria = "general" | "promo" | "cashback" | "msi";

/**
 * Clasifica un legal por su título. OJO al ORDEN: MSI se checa ANTES que CASHBACK
 * porque el título del legal de MSI también menciona CASHBACK ("…sin mencionar
 * CASHBACK…"); y "general" primero porque el título del general de Card menciona
 * ambos ("…ni de CASHBACK* ni de MSI…"). Verificado contra los 5 legales reales.
 */
function categoria(title: string): Categoria | null {
  const t = fold(title);
  if (t.startsWith("legales generales")) return "general";
  if (t.includes("promo")) return "promo";
  if (t.includes("msi")) return "msi";
  if (t.includes("cashback")) return "cashback";
  return null;
}

export type Sugerencia = {
  principalId: string | null;
  alternativaIds: string[];
  motivo: string;
};

/**
 * Dado el guión + la marca, qué legal aplica:
 *  · Card: menciona CASHBACK → legal CASHBACK; menciona MSI (sin CASHBACK) → legal
 *    MSI; si no → general. (Determinista, confiable.)
 *  · Préstamos: general por defecto; Promociones como ALTERNATIVA (detectar una
 *    promo por texto daría falsos positivos → lo decide el humano).
 */
export function legalSugerido(
  marcaSlug: string | null,
  guion: string,
  legales: LegalLite[],
): Sugerencia {
  const porCat = new Map<Categoria, LegalLite>();
  for (const l of legales) {
    const c = categoria(l.title);
    if (c && !porCat.has(c)) porCat.set(c, l);
  }
  const id = (c: Categoria) => porCat.get(c)?.id ?? null;
  const g = fold(guion);

  if (marcaSlug === "card") {
    if (g.includes("cashback")) {
      return { principalId: id("cashback"), alternativaIds: [], motivo: "El guión menciona CASHBACK." };
    }
    if (/\bmsi\b/.test(g)) {
      return { principalId: id("msi"), alternativaIds: [], motivo: "El guión menciona MSI (sin CASHBACK)." };
    }
    return { principalId: id("general"), alternativaIds: [], motivo: "No menciona CASHBACK ni MSI." };
  }
  if (marcaSlug === "prestamos") {
    const promo = id("promo");
    return {
      principalId: id("general"),
      alternativaIds: promo ? [promo] : [],
      motivo: "General por defecto — usa Promociones si es una promo.",
    };
  }
  return { principalId: null, alternativaIds: [], motivo: "" };
}

/**
 * Paso 2 — cuánto cuesta lo que H.Ü.E recomienda, dicho antes de generar. Los créditos por modelo viven en el
 * catálogo (Hub › Herramientas); aquí se vuelven un estimado legible: por intento, por pieza (una toma usable
 * lleva 3–5 intentos según el blog de Higgsfield) y en dólares (US$0.04 por crédito: 223.38 / 5,584.48 del
 * resumen de uso de Pedro, 2026-09-16). Módulo puro.
 */
import { t, type Par } from "./copy.ts";
import { precioEn, type CostoModelo } from "./catalogo.ts";
import type { Tool } from "./spec.ts";

export const USD_POR_CREDITO = 0.04;
/** "A usable clip typically takes 3-5 generations" (higgsfield.ai/blog/ai-video-credits-explained). */
export const INTENTOS_TIPICOS: [number, number] = [3, 5];

/** El número que se usa para comparar: ilimitado = 0; sin dato = null (no gana ni pierde). */
export const creditosDe = (c: CostoModelo | null | undefined): number | null => (!c ? null : c.ilimitado ? 0 : c.tipico);

const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(n < 10 ? 2 : 1).replace(/\.?0+$/, ""));
const usd = (n: number): string => `US$${(n * USD_POR_CREDITO).toFixed(2)}`;

/** Lo que cambia el precio según la resolución, cuando la herramienta no sigue la regla general (720p → 1080p ≈ ×2).
 *  Veo 3.1 (Pedro, 2026-09-16): 720p y 1080p cuestan lo mismo — 8 s = 58, 6 s = 44, 4 s = 29 — y 4K ≈ ×1.5 (88 / 66 / 44). */
const RESOLUCION: Partial<Record<string, { es: string; en: string }>> = {
  veo: { es: " 720p y 1080p cuestan lo mismo; 4K cuesta 1.5× (8 s: 58 → 88). Más corto cuesta menos (4 s: 29).", en: " 720p and 1080p cost the same; 4K costs 1.5× (8 s: 58 → 88). Shorter costs less (4 s: 29)." },
};

/** Una línea para el diseñador: "Ilimitado en nuestro plan", "≈ 6 créditos por intento (3.75–12) · US$0.24" o "sin dato". */
export function textoCosto(c: CostoModelo | null | undefined, video: boolean, tool?: Tool, duracion?: number | null): Par {
  if (!c) return t("Costo: sin dato; Higgsfield lo muestra en el botón Generate.", "Cost: no data; Higgsfield shows it on the Generate button.");
  if (c.ilimitado) return t("Ilimitado en nuestro plan: 0 créditos por intento.", "Unlimited on our plan: 0 credits per try.");
  const exacto = video ? precioEn(c, duracion) : null;
  if (exacto) {
    // Precio exacto del botón Generate a esa duración: 1080p (la final) y las otras resoluciones al lado.
    const [a, b] = INTENTOS_TIPICOS;
    const p = exacto.p1080;
    const otras = [exacto.p480 != null ? `480p: ${num(exacto.p480)}` : null, exacto.p720 !== p ? `720p: ${num(exacto.p720)}` : null, exacto.p4k !== null ? `4K: ${num(exacto.p4k)}` : null].filter(Boolean).join(" · ");
    const igual = exacto.p720 === p ? { es: " (720p cuesta lo mismo)", en: " (720p costs the same)" } : { es: "", en: "" };
    return t(
      `${num(p)} créditos por intento a ${exacto.s} s en 1080p${igual.es}${otras ? ` · ${otras}` : ""} · ${usd(p)}. Una pieza lista suele tomar ${a}–${b} intentos: ≈ ${num(p * a)}–${num(p * b)} créditos. Más corto cuesta menos.`,
      `${num(p)} credits per try at ${exacto.s} s in 1080p${igual.en}${otras ? ` · ${otras}` : ""} · ${usd(p)}. A finished piece usually takes ${a}–${b} tries: ≈ ${num(p * a)}–${num(p * b)} credits. Shorter costs less.`,
    );
  }
  if (c.tipico === null) return t("Consume créditos (sin dato del costo exacto; Higgsfield lo muestra en el botón Generate).", "Uses credits (no exact cost on file; Higgsfield shows it on the Generate button).");
  const rango = c.min !== null && c.max !== null && (c.min !== c.tipico || c.max !== c.tipico) ? ` (${num(c.min)}–${num(c.max)})` : c.max !== null && c.max !== c.tipico ? ` (hasta ${num(c.max)})` : "";
  const rangoEn = rango.replace("hasta", "up to");
  const [a, b] = INTENTOS_TIPICOS;
  const pieza = { es: ` Una pieza lista suele tomar ${a}–${b} intentos: ≈ ${num(c.tipico * a)}–${num(c.tipico * b)} créditos.`, en: ` A finished piece usually takes ${a}–${b} tries: ≈ ${num(c.tipico * a)}–${num(c.tipico * b)} credits.` };
  const res = !video ? { es: "", en: "" } : RESOLUCION[tool ?? ""] ?? { es: " A 1080p cuesta cerca del doble que a 720p.", en: " 1080p costs about twice as much as 720p." };
  return t(
    `≈ ${num(c.tipico)} créditos por intento${rango} · ${usd(c.tipico)}.${pieza.es}${res.es}`,
    `≈ ${num(c.tipico)} credits per try${rangoEn} · ${usd(c.tipico)}.${pieza.en}${res.en}`,
  );
}

/** Etiqueta corta para un botón o chip: "ilimitado", "≈54 cr" o "" (sin dato). */
export function costoCorto(c: CostoModelo | null | undefined): Par {
  if (!c) return t("", "");
  if (c.ilimitado) return t("ilimitado", "unlimited");
  return c.tipico === null ? t("con créditos", "uses credits") : t(`≈${num(c.tipico)} cr`, `≈${num(c.tipico)} cr`);
}

/**
 * Paso 2 — cuánto cuesta lo que H.Ü.E recomienda, dicho antes de generar. Los créditos por modelo viven en el
 * catálogo (Hub › Herramientas); aquí se vuelven un estimado legible: por intento, por pieza (una toma usable
 * lleva 3–5 intentos según el blog de Higgsfield) y en dólares (US$0.04 por crédito: 223.38 / 5,584.48 del
 * resumen de uso de Pedro, 2026-09-16). Módulo puro.
 */
import { t, type Par } from "./copy.ts";
import type { CostoModelo } from "./catalogo.ts";

export const USD_POR_CREDITO = 0.04;
/** "A usable clip typically takes 3-5 generations" (higgsfield.ai/blog/ai-video-credits-explained). */
export const INTENTOS_TIPICOS: [number, number] = [3, 5];

/** El número que se usa para comparar: ilimitado = 0; sin dato = null (no gana ni pierde). */
export const creditosDe = (c: CostoModelo | null | undefined): number | null => (!c ? null : c.ilimitado ? 0 : c.tipico);

const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(n < 10 ? 2 : 1).replace(/\.?0+$/, ""));
const usd = (n: number): string => `US$${(n * USD_POR_CREDITO).toFixed(2)}`;

/** Una línea para el diseñador: "Ilimitado en nuestro plan", "≈ 6 créditos por intento (3.75–12) · US$0.24" o "sin dato". */
export function textoCosto(c: CostoModelo | null | undefined, video: boolean): Par {
  if (!c) return t("Costo: sin dato; Higgsfield lo muestra en el botón Generate.", "Cost: no data; Higgsfield shows it on the Generate button.");
  if (c.ilimitado) return t("Ilimitado en nuestro plan: 0 créditos por intento.", "Unlimited on our plan: 0 credits per try.");
  if (c.tipico === null) return t("Consume créditos (sin dato del costo exacto; Higgsfield lo muestra en el botón Generate).", "Uses credits (no exact cost on file; Higgsfield shows it on the Generate button).");
  const rango = c.min !== null && c.max !== null && (c.min !== c.tipico || c.max !== c.tipico) ? ` (${num(c.min)}–${num(c.max)})` : c.max !== null && c.max !== c.tipico ? ` (hasta ${num(c.max)})` : "";
  const rangoEn = rango.replace("hasta", "up to");
  const [a, b] = INTENTOS_TIPICOS;
  const pieza = { es: ` Una pieza lista suele tomar ${a}–${b} intentos: ≈ ${num(c.tipico * a)}–${num(c.tipico * b)} créditos.`, en: ` A finished piece usually takes ${a}–${b} tries: ≈ ${num(c.tipico * a)}–${num(c.tipico * b)} credits.` };
  const res = video ? { es: " A 1080p cuesta cerca del doble que a 720p.", en: " 1080p costs about twice as much as 720p." } : { es: "", en: "" };
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

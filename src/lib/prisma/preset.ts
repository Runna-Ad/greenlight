import { ASPECTS, type Aspect, type MarcaPreset } from "./spec.ts";
import { plano } from "./texto.ts";

/**
 * HÜE Prisma — el PRESET de marca (marcas.prisma_presets): lo que la marca del cliente
 * aporta a TODO prompt (paleta, tono, qué evitar, formato por default).
 *
 * Módulo puro y ÚNICA definición de la forma. Lo usan los dos lados: el que LEE
 * (`presetDeMarca`, camino del writer, lib/prisma/data.ts) y el que ESCRIBE
 * (`guardarPrismaPreset`, Admin › Marcas). Si cada lado tuviera su propia idea de qué
 * es válido, el Admin guardaría algo que el writer ignoraría en silencio.
 */
export type PresetGuardado = {
  /** SÓLO hex #rrggbb (normalizados a minúsculas): la misma regla que impone el editor de
   *  Admin. Los colores "con nombre" van en `tono` si hacen falta. */
  paleta: string[];
  /** "premium, cálido, directo" */
  tono: string;
  /** ["texto en pantalla", "fondos morados"] */
  evitar: string[];
  aspect_default: Aspect | null;
};

export const PRESET_LIMITES = { paleta: 8, evitar: 10, tono: 200, item: 60 } as const;

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const esHex = (s: string): boolean => HEX.test(s.trim());

/** "#F0A" → "#ff00aa"; un hex de 6 sólo baja a minúsculas; lo que no es hex vuelve igual (recortado). */
export function normalizarColor(s: string): string {
  const t = s.trim();
  if (!HEX.test(t)) return t;
  const h = t.slice(1).toLowerCase();
  return `#${h.length === 3 ? h.split("").map((c) => c + c).join("") : h}`;
}

/** Lista de textos: sólo strings, recortados, sin vacíos, sin repetidos, con tope. */
function lista(v: unknown, max: number, norm: (s: string) => string = (s) => s): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    // plano: el texto del Admin entra a los prompts (writer y compilados): una línea, sin control chars.
    const s = norm(plano(x).slice(0, PRESET_LIMITES.item)).trim();
    if (!s || out.includes(s)) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** Cualquier cosa (el jsonb libre de la BD o lo que manda el formulario) → la forma segura. */
export function normalizarPreset(raw: unknown): PresetGuardado {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const aspect = typeof o.aspect_default === "string" && (ASPECTS as string[]).includes(o.aspect_default) ? (o.aspect_default as Aspect) : null;
  return {
    paleta: lista(o.paleta, PRESET_LIMITES.paleta, normalizarColor).filter(esHex),
    tono: typeof o.tono === "string" ? plano(o.tono).slice(0, PRESET_LIMITES.tono) : "",
    evitar: lista(o.evitar, PRESET_LIMITES.evitar),
    aspect_default: aspect,
  };
}

/**
 * Para GUARDAR (Admin): ESTRICTO. Lo que no cabe se RECHAZA con un motivo, no se recorta en
 * silencio (regla de la casa: nada de defaults silenciosos en el write-path). La lectura
 * (`normalizarPreset`) sigue siendo tolerante porque el jsonb viejo no se puede rechazar.
 */
export function validarPreset(raw: unknown): { ok: true; preset: PresetGuardado } | { ok: false; error: string } {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null) as Record<string, unknown> | null;
  if (!o) return { ok: false, error: "Preset inválido." };
  const paleta = o.paleta === undefined ? [] : o.paleta;
  if (!Array.isArray(paleta) || paleta.length > PRESET_LIMITES.paleta) return { ok: false, error: `Máximo ${PRESET_LIMITES.paleta} colores.` };
  for (const c of paleta) if (typeof c !== "string" || !esHex(c)) return { ok: false, error: "Cada color debe ser hex, p. ej. #ff6b1a." };
  const evitar = o.evitar === undefined ? [] : o.evitar;
  if (!Array.isArray(evitar) || evitar.length > PRESET_LIMITES.evitar) return { ok: false, error: `Máximo ${PRESET_LIMITES.evitar} cosas a evitar.` };
  for (const e of evitar) if (typeof e !== "string" || !e.trim() || e.trim().length > PRESET_LIMITES.item) return { ok: false, error: `Cada cosa a evitar: texto de hasta ${PRESET_LIMITES.item} letras.` };
  const tono = o.tono === undefined ? "" : o.tono;
  if (typeof tono !== "string" || tono.trim().length > PRESET_LIMITES.tono) return { ok: false, error: `El tono: texto de hasta ${PRESET_LIMITES.tono} letras.` };
  const a = o.aspect_default;
  if (a !== null && a !== undefined && !(typeof a === "string" && (ASPECTS as string[]).includes(a))) return { ok: false, error: "Formato no válido." };
  return { ok: true, preset: normalizarPreset({ paleta, evitar, tono, aspect_default: a ?? null }) };
}

export const presetVacio = (p: PresetGuardado): boolean =>
  p.paleta.length === 0 && !p.tono && p.evitar.length === 0 && p.aspect_default === null;

/** Lo que ve el writer: el preset guardado con su nombre y, sin paleta propia, el color
 *  de marca del cliente — mejor un mínimo real que nada. */
export function presetDeMarca(nombre: string, raw: unknown, brandColor: string | null): MarcaPreset {
  const g = normalizarPreset(raw);
  return {
    nombre,
    paleta: g.paleta.length ? g.paleta : brandColor ? [normalizarColor(brandColor)] : [],
    tono: g.tono,
    evitar: g.evitar,
    aspect_default: g.aspect_default,
  };
}

import { TOOLS, type Tool } from "./spec.ts";
import { cercado } from "./texto.ts";

/**
 * HÜE Prisma — el conocimiento VIVO por herramienta (tabla prisma_reglas, 0067).
 * Módulo puro: la forma de una fila, la validación ESTRICTA para guardar (rechaza, no
 * recorta), y cómo las notas se vuelven el bloque TOOL NOTES del writer. Lo usan el Admin
 * (guardar), data.ts (leer) y prompts/writer.ts (inyectar). Las reglas deterministas
 * (clase 'regla') las ejecuta el diagnóstico (F2); aquí sólo se valida su forma.
 */

export const CLASES = ["regla", "nota"] as const;
export const NIVELES = ["bloquea", "advierte", "sugiere"] as const;
export const KINDS = ["imagen", "video", "edicion"] as const;
export const FUENTE_TIPOS = ["oficial", "comunidad"] as const;
/** Qué mira una regla determinista. */
export const CAMPOS = ["idea", "texto", "refs", "duracion", "aspect", "dialogo.idioma", "accion", "camara", "destino", "salida"] as const;

export type ReglaClase = (typeof CLASES)[number];
export type ReglaNivel = (typeof NIVELES)[number];
export type ReglaCampo = (typeof CAMPOS)[number];
export type FuenteTipo = (typeof FUENTE_TIPOS)[number];

/** Una fila tal como viaja entre Admin, BD y writer (sin id/fechas). */
export type ReglaInput = {
  codigo: string;
  clase: ReglaClase;
  tool: Tool | null;
  kind: (typeof KINDS)[number] | null;
  nivel: ReglaNivel;
  campo: ReglaCampo | null;
  patron: string | null;
  umbral: number | null;
  que_es: string | null;
  que_en: string | null;
  porque_es: string | null;
  porque_en: string | null;
  arreglo_es: string | null;
  arreglo_en: string | null;
  accion: Record<string, unknown> | null;
  nota_en: string | null;
  fuente_url: string | null;
  fuente_fecha: string | null; // YYYY-MM-DD
  fuente_tipo: FuenteTipo;
  activa: boolean;
  orden: number;
};

export const LIMITES = { codigo: 60, patron: 200, nota: 700, texto: 300, url: 300 } as const;

/** Una nota que intenta hablarle al modelo como si fuera el sistema no es conocimiento: es
 *  una instrucción. Se rechaza al guardar (la nota entra al bloque cacheado de TODAS las
 *  generaciones de TODAS las marcas; el tope de daño se pone aquí). */
const PARECE_INSTRUCCION = /(OUTPUT CONTRACT|ABSOLUTE RULES|TOOL NOTES|emitir_spec|ignore (all |the |any )?(previous|above|prior)|disregard (all |the |any )?(previous|above|prior))/i;

/** Entradas de prueba para el ensayo de tiempo. CORTAS a propósito (22 letras): un patrón
 *  exponencial tarda 2^22 pasos (decenas de ms, medible) y no 2^200 (colgaría el servidor
 *  que lo está validando — el ensayo corre en el mismo proceso). Terminan en "!" porque el
 *  backtracking explota cuando NO hay match. */
const ENSAYO = ["a".repeat(22) + "!", "ab".repeat(11) + "!", "x y ".repeat(6) + "!", "a".repeat(22)];
const ENSAYO_MAX_MS = 5;

/** ¿Es una regex que podemos correr sin riesgo? Corta las formas que explotan (lookbehind,
 *  cuantificadores anidados sobre grupos, repeticiones enormes) y, como la lista de formas
 *  malas nunca está completa, ENSAYA el patrón contra entradas hostiles y rechaza si tarda. */
export function regexSegura(patron: string): { ok: true; re: RegExp } | { ok: false; error: string } {
  const p = patron.trim();
  if (!p) return { ok: false, error: "El patrón está vacío." };
  if (p.length > LIMITES.patron) return { ok: false, error: `El patrón pasa de ${LIMITES.patron} caracteres.` };
  if (/[\p{Cc}\p{Cf}]/u.test(p)) return { ok: false, error: "El patrón trae caracteres de control o saltos de línea." };
  if (/\(\?<[=!]/.test(p)) return { ok: false, error: "Sin lookbehind (?<= / (?<!) en los patrones." };
  const reps = [...p.matchAll(/\{\s*(\d+)\s*,?\s*(\d*)\s*\}/g)];
  if (reps.some((m) => Number(m[1]) > 50 || Number(m[2] || 0) > 50)) return { ok: false, error: "Repeticiones {n,m} de más de 50 no se permiten." };
  if (reps.length > 2) return { ok: false, error: "Más de dos repeticiones {n,m} en un patrón no se permiten." };
  if (/\([^)]*[+*][^)]*\)[+*]/.test(p)) return { ok: false, error: "Cuantificador sobre un grupo que ya repite (catastrophic backtracking)." };
  let re: RegExp;
  try {
    re = new RegExp(p, "iu");
  } catch (e) {
    return { ok: false, error: `Patrón inválido: ${e instanceof Error ? e.message : "regex"}` };
  }
  const t0 = performance.now();
  for (const s of ENSAYO) re.test(s);
  if (performance.now() - t0 > ENSAYO_MAX_MS) return { ok: false, error: "El patrón tarda demasiado contra entradas largas: simplifícalo." };
  return { ok: true, re };
}

class Rechazo extends Error {}
/** Texto opcional en UNA línea, sin < >. Si pasa el tope se RECHAZA (una nota cortada a la
 *  mitad se vuelve un "hecho verificado" falso; mejor que no entre). */
function texto(v: unknown, max: number, nombre: string): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = cercado(v);
  if (t.length > max) throw new Rechazo(`${nombre} pasa de ${max} caracteres (tiene ${t.length}).`);
  return t || null;
}

/** ESTRICTO (write-path): lo que no cabe o no cuadra se RECHAZA con motivo. */
export function validarRegla(raw: unknown): { ok: true; row: ReglaInput } | { ok: false; error: string } {
  try {
    return validar(raw);
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, error: e.message };
    throw e;
  }
}

function validar(raw: unknown): { ok: true; row: ReglaInput } | { ok: false; error: string } {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null) as Record<string, unknown> | null;
  if (!o) return { ok: false, error: "Regla inválida." };
  const codigo = typeof o.codigo === "string" ? o.codigo.trim().toLowerCase() : "";
  if (!new RegExp(`^[a-z0-9_]{3,${LIMITES.codigo}}$`).test(codigo)) return { ok: false, error: `El código: 3 a ${LIMITES.codigo} caracteres, minúsculas, números y guion bajo.` };
  const clase = o.clase;
  if (!(CLASES as readonly unknown[]).includes(clase)) return { ok: false, error: "La clase debe ser regla o nota." };
  const tool = o.tool === null || o.tool === undefined || o.tool === "" ? null : o.tool;
  if (tool !== null && !(TOOLS as string[]).includes(tool as string)) return { ok: false, error: "Herramienta desconocida." };
  const kind = o.kind === null || o.kind === undefined || o.kind === "" ? null : o.kind;
  if (kind !== null && !(KINDS as readonly unknown[]).includes(kind)) return { ok: false, error: "Tipo de trabajo desconocido." };
  const nivel = o.nivel ?? "advierte";
  if (!(NIVELES as readonly unknown[]).includes(nivel)) return { ok: false, error: "Nivel desconocido." };
  const fuente_url = texto(o.fuente_url, LIMITES.url, "La liga de la fuente");
  if (fuente_url && !/^https?:\/\//.test(fuente_url)) return { ok: false, error: "La fuente debe ser una liga http(s)." };
  const fuente_fecha = texto(o.fuente_fecha, 10, "La fecha");
  if (fuente_fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fuente_fecha)) return { ok: false, error: "La fecha de la fuente va como AAAA-MM-DD." };
  const fuente_tipo = o.fuente_tipo === undefined || o.fuente_tipo === null || o.fuente_tipo === "" ? "oficial" : o.fuente_tipo;
  if (!(FUENTE_TIPOS as readonly unknown[]).includes(fuente_tipo)) return { ok: false, error: "El tipo de fuente es oficial o comunidad." };
  const orden = Number.isFinite(Number(o.orden)) ? Math.max(-32768, Math.min(32767, Math.round(Number(o.orden)))) : 0;
  const activa = o.activa === undefined ? true : !!o.activa;
  const base = { codigo, tool: tool as Tool | null, kind: kind as ReglaInput["kind"], fuente_url, fuente_fecha, fuente_tipo: fuente_tipo as FuenteTipo, activa, orden };

  if (clase === "nota") {
    const nota_en = texto(o.nota_en, LIMITES.nota, "La nota");
    if (!nota_en) return { ok: false, error: "Una nota necesita su texto en inglés." };
    if (PARECE_INSTRUCCION.test(nota_en)) return { ok: false, error: "La nota parece una instrucción al modelo, no un hecho sobre la herramienta. Reescríbela como dato." };
    if (!fuente_url || !fuente_fecha) return { ok: false, error: "Una nota necesita fuente y fecha: es lo que la hace verificable." };
    return { ok: true, row: { ...base, clase: "nota", nivel: "sugiere", campo: null, patron: null, umbral: null, que_es: null, que_en: null, porque_es: null, porque_en: null, arreglo_es: null, arreglo_en: null, accion: null, nota_en } };
  }

  const campo = o.campo;
  if (!(CAMPOS as readonly unknown[]).includes(campo)) return { ok: false, error: "Una regla necesita un campo válido (idea, texto, refs…)." };
  // El patrón NO pasa por cercado/plano: reescribirlo cambiaría su significado. Se toma tal
  // cual y regexSegura lo rechaza si trae control chars o es peligroso.
  const patron = typeof o.patron === "string" && o.patron.trim() ? o.patron.trim() : null;
  const umbral = o.umbral === null || o.umbral === undefined || o.umbral === "" ? null : Number(o.umbral);
  if (umbral !== null && !Number.isFinite(umbral)) return { ok: false, error: "El umbral debe ser un número." };
  if (!patron && umbral === null) return { ok: false, error: "Una regla necesita un patrón o un umbral." };
  if (patron) {
    const r = regexSegura(patron);
    if (!r.ok) return r;
  }
  const que_es = texto(o.que_es, LIMITES.texto, "El aviso (ES)");
  const que_en = texto(o.que_en, LIMITES.texto, "El aviso (EN)");
  if (!que_es || !que_en) return { ok: false, error: "Una regla necesita el aviso en español y en inglés." };
  let accion: Record<string, unknown> | null = null;
  if (o.accion !== null && o.accion !== undefined && o.accion !== "") {
    const a = typeof o.accion === "string" ? (() => { try { return JSON.parse(o.accion as string) as unknown; } catch { return undefined; } })() : o.accion;
    if (!a || typeof a !== "object" || Array.isArray(a) || typeof (a as Record<string, unknown>).tipo !== "string") return { ok: false, error: 'La acción va como JSON con "tipo" (p. ej. {"tipo":"tool","tool":"veo"}).' };
    if (JSON.stringify(a).length > LIMITES.texto) return { ok: false, error: `La acción pasa de ${LIMITES.texto} caracteres.` };
    accion = a as Record<string, unknown>;
  }
  return {
    ok: true,
    row: {
      ...base, clase: "regla", nivel: nivel as ReglaNivel, campo: campo as ReglaCampo, patron, umbral,
      que_es, que_en, porque_es: texto(o.porque_es, LIMITES.texto, "El porqué (ES)"), porque_en: texto(o.porque_en, LIMITES.texto, "El porqué (EN)"),
      arreglo_es: texto(o.arreglo_es, LIMITES.texto, "El arreglo (ES)"), arreglo_en: texto(o.arreglo_en, LIMITES.texto, "El arreglo (EN)"),
      accion, nota_en: null,
    },
  };
}

/** Lo mínimo que el writer necesita de una nota. */
export type NotaTool = { tool: Tool | null; texto: string; fecha: string | null };

/** De las filas activas de clase 'nota' → notas listas para TOOL NOTES (orden estable).
 *  Una nota de una herramienta que ya no existe se DESCARTA (no se vuelve "para todas": una
 *  nota de Kling repartida a Nano Banana y Veo estropearía cada prompt). */
export function notasDe(filas: { clase: string; tool: string | null; nota_en: string | null; fuente_fecha: string | null; activa: boolean; orden: number }[]): NotaTool[] {
  return filas
    .filter((f) => f.clase === "nota" && f.activa && !!f.nota_en?.trim() && (f.tool === null || (TOOLS as string[]).includes(f.tool)))
    .sort((a, b) => a.orden - b.orden)
    .map((f) => ({ tool: f.tool as Tool | null, texto: cercado(f.nota_en as string), fecha: f.fuente_fecha }));
}

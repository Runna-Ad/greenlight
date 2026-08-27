// Qué plantilla de trabajo le toca a una tarea, y las piezas puras que la
// alimentan. Sin React, sin base — para poder probarlo todo sin navegador.

import type { AssetStatus } from "./brand";

export type Plantilla = "guion" | "estatico" | "copies";

/**
 * ⚠️ Mapa PROPIO, deliberadamente separado de tipoGroup() en required.ts.
 *
 * Hoy coinciden, y hay un test que lo verifica. Pero acoplarlos haría que el
 * día que GIF necesite obligatorios distintos, la plantilla cambie EN SILENCIO.
 * Son dos decisiones que pueden separarse legítimamente: una dice qué campos
 * son obligatorios para crear, la otra con qué pantalla se trabaja.
 *
 * (Mismo razonamiento por el que required.ts avisa de no derivarse de
 * namingKindForTipo(), que agrupa Images y Copies juntas.)
 */
const PLANTILLA_POR_TIPO: Record<string, Plantilla> = {
  "RP Video": "guion",
  "Normal Video": "guion",
  "AIGC video": "guion",
  GIF: "guion",
  Images: "estatico",
  Copies: "copies",
};

/** Un tipo desconocido cae en "guion", el cuerpo más estructurado. */
export function plantillaPara(tipo: string | undefined | null): Plantilla {
  return PLANTILLA_POR_TIPO[(tipo ?? "").trim()] ?? "guion";
}

/** Las plantillas construidas (la página sólo trabaja estas). */
export const PLANTILLAS_LISTAS: Plantilla[] = ["guion", "estatico", "copies"];

/** Placeholders del copy (instrucción, no dato). */
export const PLACEHOLDER_COPY = {
  headline: "Titular / gancho",
  descripcion: "El cuerpo del copy (beneficio + CTA)",
} as const;

// ─────────────────────────────────────────────────────────────
// Read-time
// ─────────────────────────────────────────────────────────────

/**
 * Espejo EXACTO de produccion.set_plano_read_time (migración 0002):
 * ceil(palabras / 2.5), y 0 cuando no hay diálogo. ~2.5 palabras por segundo
 * de locución en es-MX. Fijado con contract test contra el trigger.
 */
export function readTimeS(dialogo: string | null | undefined): number {
  const t = (dialogo ?? "").trim();
  if (!t) return 0;
  return Math.ceil(t.split(/\s+/).length / 2.5);
}

/**
 * La cortinilla legal SIEMPRE dura 2 segundos en pantalla — regla dura (Pedro),
 * sin importar cuánto texto tenga el legal. El total de lectura suma exactamente
 * estos 2s cuando la tarea lleva legal (0 si no), y el writer los RESERVA del
 * presupuesto de diálogo. Nunca medir el read-time del texto legal: inflaba el total
 * (un legal largo saltaba a +12s en vez de +2s).
 */
export const LEGAL_SECONDS = 2;

/**
 * Colchón MÍNIMO en segundos entre la duración objetivo del guión y el TOPE del rango
 * (Pedro, 2026-08-27). Para un valor único ("30") el rango es de 0, así que este mínimo
 * es lo único que separa el objetivo del tope: "30" → objetivo 26, y el 30 nunca se
 * rebasa. Para un rango ancho, la mitad del rango ya supera este mínimo y manda ella.
 */
export const COLCHON_MIN_S = 4;

export type Rango = { min: number; max: number };

/**
 * "15-30s" → {min:15,max:30} · "30s" → {min:30,max:30} · "10-40s" → 10..40
 * "-" y lo que no se pueda leer → null (misma convención que required.ts).
 */
export function parseDuracion(texto: string | null | undefined): Rango | null {
  const t = (texto ?? "").trim();
  if (!t || t === "-") return null;
  const nums = t.match(/\d+/g);
  if (!nums?.length) return null;
  const n = nums.map(Number);
  return { min: n[0], max: n.length > 1 ? n[n.length - 1] : n[0] };
}

/**
 * Presupuesto de DIÁLOGO en segundos para el writer: la duración OBJETIVO MENOS la
 * cortinilla legal fija ({@link LEGAL_SECONDS}). El diálogo total del guión debe caber
 * aquí; el legal se agrega aparte y ocupa esos 2s reservados, de modo que
 * (diálogo + legal) ≤ duración. `null` si no hay duración legible (entonces no se
 * enforcea tope). Piso de 1s para no dar un tope ≤0.
 *
 * La duración objetivo NUNCA se sienta pegada al tope (Pedro, 2026-08-27): apuntar al
 * máximo dejaba el video en el borde superior y los guiones fallaban por tiempo. La
 * regla es una sola: OBJETIVO = tope − colchón, donde el colchón es la mitad del rango
 * PERO al menos {@link COLCHON_MIN_S}s. Así:
 *   · rango ancho "30-40" → colchón 5 → objetivo 35 (el centro, "no more than 35").
 *   · valor único "30" (rango de 0) → colchón mínimo 4 → objetivo 26; el 30 es un TOPE
 *     DURO que nunca se debe rebasar, y el colchón garantiza aterrizar ≥4s por debajo.
 *   · rango angosto "30-35" → medio colchón 2.5 < 4 → se fuerza a 4 → objetivo 31.
 * El máx del rango es siempre el límite crítico; el colchón deja aire para el redondeo y
 * la locución real. Fan-out: se toma el objetivo más largo (el guión maestro cabe en
 * todas). Floor para sesgar apenas por debajo, nunca por encima.
 */
export function presupuestoDialogoS(duracion: string[] | null | undefined): number | null {
  const objetivos = (duracion ?? [])
    .map((d) => parseDuracion(d))
    .filter((r): r is Rango => r !== null)
    .map((r) => r.max - Math.max(COLCHON_MIN_S, (r.max - r.min) / 2));
  if (!objetivos.length) return null;
  return Math.max(1, Math.floor(Math.max(...objetivos)) - LEGAL_SECONDS);
}

// Aquí vivía compararDuracion(): juzgaba el diálogo contra la Duración y pintaba
// el read-time de verde/rojo. Se quitó a petición de Pedro — "no lo adaptes
// basado en cuánto escrito está en el diálogo, no hay necesidad". La Duración se
// escribe a mano en la cabecera y es la que manda sobre el nombre del archivo;
// el read-time se queda como dato, sin veredicto.
// parseDuracion SÍ se conserva: las reglas contextuales la usan (DUR30_MIN5_BENEF).

// ─────────────────────────────────────────────────────────────
// Placeholders
// ─────────────────────────────────────────────────────────────
// Lo escrito en el deck son INSTRUCCIONES de qué llenar, no contenido (Pedro).
// Por eso van como placeholder y nunca como valor inicial — hay un test que
// afirma que ninguno de estos strings aparece jamás como dato.

/**
 * Real Person y Normal NO son la misma plantilla.
 *
 * Diferencias que salen del deck del cliente:
 *   Real Person  → "Plano N - int. locación - MS", Hook narrativo + Hook visual
 *                  con viñetas, y habla una "Actriz / Actor". Nota global:
 *                  "1 actriz / 1 actor en todo el video / # outfits."
 *   Normal       → "Plano N - fondo", guía entre corchetes (Informativo /
 *                  Conversaciones / Testimoniales / Formato innovador), y habla
 *                  una voz en off: "Mujer/Hombre (V.O)".
 */
export type VarianteGuion = "real" | "normal";

const VARIANTE_POR_TIPO: Record<string, VarianteGuion> = {
  "RP Video": "real",
  "Normal Video": "normal",
  "AIGC video": "normal",
  GIF: "normal",
};

export function varianteGuion(tipo: string | undefined | null): VarianteGuion {
  return VARIANTE_POR_TIPO[(tipo ?? "").trim()] ?? "normal";
}

const GUION_REAL = {
  titulo: "Plano 1 - int. locación - MS",
  hook_narrativo:
    "Problema urgente y cómo se resolvió · Recompensa inmediata en 1ra persona (ya me aprobaron, ya la tengo) · Tendencia · Curiosidad o morbo",
  hook_visual:
    "Tomas experimentales (ángulos creativos, cenitales, manos haciendo algo random, copy en objetos) · Tema o estilo visual (sketch, canciones, personajes, testimonios)",
  accion: "Cambio de fondo y/o acción",
  copy_in: "Texto que aparece en pantalla",
  sfx: "Música / sonidos",
  gfx: "Imágenes / emojis",
  edicion: "Reencuadre / B-roll / insert / transición",
  dialogo: "Lo que dice la actriz o el actor",
} as const;

const GUION_NORMAL = {
  titulo: "Plano 1 - fondo",
  hook_narrativo:
    "Informativo: hablar directo al usuario e iniciar con pregunta · Conversaciones entre personajes · Testimoniales con problema al iniciar · Información práctica: qué es y cómo pedirlo",
  hook_visual: "Formato innovador: DIY, collage, stickers…",
  accion: "Cambio de fondo / acción",
  copy_in: "Texto que aparece en pantalla",
  sfx: "Música / sonidos",
  gfx: "Imágenes / emojis",
  edicion: "Reencuadre / B-roll / insert / transición",
  dialogo: "1 o 2 selling points · máx. 5 seg de diálogo",
} as const;

export function placeholdersGuion(tipo: string | undefined | null) {
  return varianteGuion(tipo) === "real" ? GUION_REAL : GUION_NORMAL;
}

/** Quién habla, según la variante. Sale literal del deck. */
export function voz(tipo: string | undefined | null): string {
  return varianteGuion(tipo) === "real" ? "Actriz / Actor" : "Mujer/Hombre (V.O)";
}

/** Nota que en el deck va sobre el Plano 1 de Real Person, y sólo ahí. */
export function notaGlobal(tipo: string | undefined | null): string | null {
  return varianteGuion(tipo) === "real"
    ? "1 actriz / 1 actor en todo el video · # outfits"
    : null;
}

/** Se conserva para los tests que ya lo usan (es la variante Real). */
export const PLACEHOLDER_GUION = GUION_REAL;

export const PLACEHOLDER_ESTATICO = {
  copy_titulo: "Beneficio principal",
  copy_subtitulo: "Dos o tres beneficios secundarios",
  copy_cta: "Texto del botón",
  legales_extra: "Sólo si hace falta algo además del legal de la biblioteca",
  referencia_url: "https://…",
  referencia_nota: "Tarjeta protagonista, look limpio, foco en 1.91:1",
} as const;

/** Un plano nuevo llega VACÍO. Las instrucciones son placeholder, no dato. */
export function nuevoPlano(orden: number) {
  return {
    orden,
    titulo: null,
    hook_narrativo: null,
    hook_visual: null,
    accion: null,
    copy_in: null,
    sfx: null,
    gfx: null,
    edicion: null,
    dialogo: null,
    es_cierre: false,
  };
}

export function nuevoEstatico(orden: number) {
  return {
    orden,
    copy_titulo: null,
    copy_subtitulo: null,
    copy_cta: null,
    legales_extra: null,
    referencia_url: null,
    referencia_nota: null,
    notas: null,
  };
}

/** Estados en los que el cuerpo se congela para quien no es lead. */
export const ESTADOS_CERRADOS: AssetStatus[] = ["completed", "published", "delivered"];

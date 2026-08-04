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

/** Copies todavía no se construye — la página lo dice en vez de fingir. */
export const PLANTILLAS_LISTAS: Plantilla[] = ["guion", "estatico"];

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

export type Veredicto =
  | { estado: "dentro"; mensaje: string }
  | { estado: "excede"; mensaje: string }
  | { estado: "corto"; mensaje: string }
  | { estado: "sin-referencia"; mensaje: string };

/**
 * Tres estados, nunca dos. Cuando la Duración no se puede leer NO se dice que
 * todo está bien: un ✓ por defecto sería un falso verde, y el equipo aprendería
 * a ignorarlo.
 */
export function compararDuracion(totalS: number, duracion: string | null | undefined): Veredicto {
  const r = parseDuracion(duracion);
  if (!r) {
    return {
      estado: "sin-referencia",
      mensaje: `${totalS}s de lectura · sin duración con la cual comparar`,
    };
  }
  if (totalS > r.max) {
    return { estado: "excede", mensaje: `${totalS}s · se pasa ${totalS - r.max}s de ${r.max}s` };
  }
  if (totalS > 0 && totalS < r.min) {
    return { estado: "corto", mensaje: `${totalS}s · faltan ${r.min - totalS}s para ${r.min}s` };
  }
  return { estado: "dentro", mensaje: `${totalS}s · dentro de ${r.min}-${r.max}s` };
}

// ─────────────────────────────────────────────────────────────
// Placeholders
// ─────────────────────────────────────────────────────────────
// Lo escrito en el deck son INSTRUCCIONES de qué llenar, no contenido (Pedro).
// Por eso van como placeholder y nunca como valor inicial — hay un test que
// afirma que ninguno de estos strings aparece jamás como dato.

export const PLACEHOLDER_GUION = {
  titulo: "Plano 1 - int. locación - MS",
  hook_narrativo:
    "Compra aspiracional o solución a un problema · Recompensa inmediata en 1ra persona · Tendencia · Curiosidad",
  hook_visual:
    "Tomas experimentales (ángulos, cenitales, manos, copy en objetos) · Tema o estilo visual",
  accion: "Cambio de fondo y/o acción",
  copy_in: "Texto que aparece en pantalla",
  sfx: "Música / sonidos",
  gfx: "Imágenes / emojis",
  edicion: "Reencuadre / B-roll / insert / transición",
  dialogo: "Lo que dice la actriz o el actor",
} as const;

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

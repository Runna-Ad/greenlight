// Diff PURO borrador→publicado, para el loop "H.Ü.E aprende de tus ediciones".
// Sin imports de servidor ni de red: se computa determinísticamente y se prueba
// con el harness de node. LA IA NUNCA calcula el diff — sólo narra patrones sobre
// los diffs YA computados aquí (lección: el código computa, la IA redacta).

import type { PlanoParsed, EstaticoParsed } from "@/lib/guion";

/** Un campo que cambió entre el borrador de H.Ü.E y lo que se publicó. */
export type CambioCampo = {
  /** Índice 1-based del plano; 0 para el copy de un estático. */
  plano: number;
  /** Etiqueta legible del campo: "Acción" | "Copy" | "Diálogo" | … */
  campo: string;
  antes: string;
  despues: string;
};

export type DiffGuion = {
  cambios: CambioCampo[];
  /** 0..1 — fracción de campos NO vacíos comparados que cambiaron. */
  editRate: number;
  planosBorrador: number;
  planosPublicado: number;
};

// Campos "de escritura" de un plano (lo que H.Ü.E redacta y el humano corrige).
// sfx/gfx/edición/título son más de producción; el aprendizaje mira la prosa.
const CAMPOS_PLANO: { key: keyof PlanoParsed; label: string }[] = [
  { key: "accion", label: "Acción" },
  { key: "copy_in", label: "Copy" },
  { key: "dialogo", label: "Diálogo" },
];

const CAMPOS_COPY: { key: keyof EstaticoParsed; label: string }[] = [
  { key: "copy_titulo", label: "Título" },
  { key: "copy_subtitulo", label: "Subtítulo" },
  { key: "copy_cta", label: "CTA" },
];

const norm = (v: string | null | undefined): string => (v ?? "").trim();

function armar(cambios: CambioCampo[], comparados: number, cambiados: number, nB: number, nP: number): DiffGuion {
  return { cambios, editRate: comparados ? cambiados / comparados : 0, planosBorrador: nB, planosPublicado: nP };
}

/**
 * Diff campo-a-campo de un GUIÓN (borrador vs publicado), alineado por índice de
 * plano. Nota: la alineación por índice es una aproximación — si el humano INSERTA
 * o REORDENA planos, todo lo de después se ve "cambiado" (editRate alto → lo filtra
 * `esEdicionUtil`). Una alineación por título/LCS es una mejora futura.
 */
export function diffGuion(borrador: PlanoParsed[], publicado: PlanoParsed[]): DiffGuion {
  const cambios: CambioCampo[] = [];
  let comparados = 0;
  let cambiados = 0;
  const n = Math.max(borrador.length, publicado.length);
  for (let i = 0; i < n; i++) {
    const b = borrador[i];
    const p = publicado[i];
    for (const { key, label } of CAMPOS_PLANO) {
      const antes = norm(b?.[key]);
      const despues = norm(p?.[key]);
      if (!antes && !despues) continue; // ambos vacíos → no es un campo comparable
      comparados++;
      if (antes !== despues) {
        cambiados++;
        cambios.push({ plano: i + 1, campo: label, antes, despues });
      }
    }
  }
  return armar(cambios, comparados, cambiados, borrador.length, publicado.length);
}

/** Diff de un COPY estático (mismo shape; plano = 0). */
export function diffCopy(borrador: EstaticoParsed, publicado: EstaticoParsed): DiffGuion {
  const cambios: CambioCampo[] = [];
  let comparados = 0;
  let cambiados = 0;
  for (const { key, label } of CAMPOS_COPY) {
    const antes = norm(borrador?.[key]);
    const despues = norm(publicado?.[key]);
    if (!antes && !despues) continue;
    comparados++;
    if (antes !== despues) {
      cambiados++;
      cambios.push({ plano: 0, campo: label, antes, despues });
    }
  }
  return armar(cambios, comparados, cambiados, 1, 1);
}

/**
 * ¿Vale la pena APRENDER de este diff? Sí cuando el borrador fue la BASE de lo
 * publicado y el humano lo EDITÓ — NO cuando no lo tocó (editRate 0: nada que
 * aprender) ni cuando lo descartó y escribió otra cosa (editRate ~1: reemplazo,
 * no corrección). La ventana (0, 0.7) deja fuera ambos extremos.
 */
export function esEdicionUtil(diff: DiffGuion): boolean {
  return diff.cambios.length > 0 && diff.editRate > 0 && diff.editRate < 0.7;
}

// Reduce un texto a su "forma de estilo": sin dígitos ni signos legales/monetarios
// (%, $, *) — para detectar si un cambio fue SÓLO de cifras.
const soloEstilo = (s: string): string =>
  s.replace(/[\d.,%$*]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * ¿Este cambio es de REDACCIÓN (estilo/estructura/fraseo) y no de un HECHO? Un
 * cambio de precio/porcentaje/monto/plazo es corrección de dato específico de la
 * tarea — NO se generaliza a una lección. Guard determinista que acompaña a la
 * regla del prompt (lección: cuando el modelo tiene un prior de romper la regla,
 * refuérzala también en código). Si al quitar cifras/signos ambos textos quedan
 * iguales, el único cambio fue numérico → NO es aprendizaje de estilo.
 */
export function esCambioDeEstilo(c: CambioCampo): boolean {
  return soloEstilo(c.antes) !== soloEstilo(c.despues);
}

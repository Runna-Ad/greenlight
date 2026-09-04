/**
 * HÜE Prisma — elegir la herramienta por el diseñador. Reglas simples y explicables:
 * cada elección devuelve un `porque` en una línea que la UI enseña tal cual.
 * Módulo puro.
 */
import type { JobType, PromptSpec, Tool, Destino } from "./spec.ts";
import { TOOLS_POR_JOB } from "./tools.ts";

export type Eleccion = { tool: Tool; porque: string };

export type PistasRuta = {
  job: JobType;
  destino: Destino;
  tieneDialogo: boolean;
  tieneRefs: boolean;
  /** El diseñador pidió un movimiento de cámara concreto (órbita, crash zoom…). */
  movimientoMarcado: boolean;
};

export function elegirHerramienta(p: PistasRuta): Eleccion {
  const opciones = TOOLS_POR_JOB[p.job];
  const primera = opciones[0];

  // Imagen y edición: sólo hay una herramienta de imagen en v1.
  if (opciones.length === 1) {
    return { tool: primera, porque: "Es la herramienta de imagen de la agencia y entiende referencias." };
  }

  if (p.job === "transicion") {
    return { tool: "kling", porque: "Kling recibe imagen de inicio y de fin y hace la transición sin cortes." };
  }

  if (p.job === "escena_sora") {
    return { tool: "sora", porque: "Sora 2 sigue mejor una escena por bloques de tiempo con sonido." };
  }

  // Video con diálogo: Veo genera voz y sonido nativos.
  if (p.tieneDialogo) {
    return { tool: "veo", porque: "Hay diálogo: Veo 3.1 genera la voz y el sonido en el mismo video." };
  }

  // Movimiento de cámara marcado sobre una foto: Higgsfield tiene presets de cámara.
  if (p.job === "animar_foto" && p.movimientoMarcado) {
    return { tool: "higgsfield", porque: "Pediste un movimiento de cámara específico: Higgsfield lo tiene como preset." };
  }

  // Redes verticales cortas sin diálogo: Kling es rápido y barato.
  if (p.job === "animar_foto" && (p.destino === "ig_story" || p.destino === "tiktok")) {
    return { tool: "kling", porque: "Para un clip vertical corto sin voz, Kling anima la foto con buen movimiento." };
  }

  return { tool: primera, porque: "Veo 3.1 da el mejor balance de calidad y control para este video." };
}

/** Pistas desde un spec ya llenado (para re-elegir al cambiar algo). */
export function pistasDe(spec: PromptSpec, destino: Destino): PistasRuta {
  return {
    job: spec.job,
    destino,
    tieneDialogo: !!spec.dialogo?.texto.trim(),
    tieneRefs: spec.refs.length > 0,
    movimientoMarcado: !!spec.camara.movimiento?.trim(),
  };
}

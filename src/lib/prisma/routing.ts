/**
 * HÜE Prisma — elegir la herramienta por el diseñador. Reglas simples y explicables:
 * cada elección devuelve un `porque` en una línea que la UI enseña tal cual.
 * Módulo puro.
 */
import { JOB_KIND, textoDe, type JobType, type PromptSpec, type Tool, type Destino } from "./spec.ts";
import { TOOLS_POR_JOB } from "./tools.ts";
import { t, type Par } from "./copy.ts";

export type Eleccion = { tool: Tool; porque: Par };

export type PistasRuta = {
  job: JobType;
  destino: Destino;
  tieneDialogo: boolean;
  tieneRefs: boolean;
  /** El diseñador pidió un movimiento de cámara concreto (órbita, crash zoom…). */
  movimientoMarcado: boolean;
  /** El diseñador escribió texto que debe verse en la pieza. */
  tieneTexto: boolean;
};

export function elegirHerramienta(p: PistasRuta): Eleccion {
  const opciones = TOOLS_POR_JOB[p.job];
  const primera = opciones[0];

  // Imagen y edición: dos herramientas. Con texto pedido gana ChatGPT (pinta letras
  // exactas con mucha más fiabilidad); si no, Nano Banana (identidad y referencias).
  if (JOB_KIND[p.job] !== "video") {
    if (p.tieneTexto) {
      return { tool: "chatgpt", porque: t("Pediste texto en la imagen y ChatGPT es la que mejor escribe letras exactas.", "You asked for text in the image and ChatGPT is the best at rendering exact lettering.") };
    }
    return { tool: "nanobanana", porque: t("Nano Banana es la que mejor respeta caras, productos y referencias.", "Nano Banana is the best at keeping faces, products and references faithful.") };
  }

  if (opciones.length === 1) {
    return { tool: primera, porque: t("Es la única herramienta para este trabajo.", "It is the only tool for this job.") };
  }

  if (p.job === "transicion") {
    return { tool: "kling", porque: t("Kling toma la toma inicial y la final y hace la transición sin cortes.", "Kling takes the start and end shots and makes the transition with no cuts.") };
  }

  if (p.job === "escena_sora") {
    return { tool: "sora", porque: t("Sora 2 es la que mejor sigue una escena por bloques de tiempo y con sonido.", "Sora 2 is the best at following a scene in timed blocks, with sound.") };
  }

  // Video con diálogo: Veo genera voz y sonido nativos.
  if (p.tieneDialogo) {
    return { tool: "veo", porque: t("Como hay diálogo, Veo 3.1 genera la voz y el sonido en el mismo video.", "Since there is dialogue, Veo 3.1 generates the voice and sound in the same video.") };
  }

  // Movimiento de cámara marcado sobre una foto: Higgsfield tiene presets de cámara.
  if (p.job === "animar_foto" && p.movimientoMarcado) {
    return { tool: "higgsfield", porque: t("Pediste un movimiento de cámara específico y Higgsfield lo trae como preset.", "You asked for a specific camera move and Higgsfield has it as a preset.") };
  }

  // Redes verticales cortas sin diálogo: Kling es rápido y barato.
  if (p.job === "animar_foto" && (p.destino === "ig_story" || p.destino === "tiktok")) {
    return { tool: "kling", porque: t("Para un clip vertical corto y sin voz, Kling le da buen movimiento a la foto.", "For a short vertical clip with no voice, Kling animates the photo with good motion.") };
  }

  return { tool: primera, porque: t("Veo 3.1 es el mejor balance entre calidad y control para este video.", "Veo 3.1 is the best balance of quality and control for this video.") };
}

/** Pistas desde un spec ya llenado (para re-elegir al cambiar algo). */
export function pistasDe(spec: PromptSpec, destino: Destino): PistasRuta {
  return {
    job: spec.job,
    destino,
    tieneDialogo: !!spec.dialogo?.texto.trim(),
    tieneRefs: spec.refs.length > 0,
    movimientoMarcado: !!spec.camara.movimiento?.trim(),
    tieneTexto: !!textoDe(spec),
  };
}

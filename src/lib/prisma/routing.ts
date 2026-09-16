/**
 * HÜE Prisma — elegir la herramienta por el diseñador. Reglas simples y explicables:
 * cada elección devuelve un `porque` en una línea que la UI enseña tal cual.
 * Módulo puro.
 */
import { JOB_KIND, textoDe, type JobType, type PromptSpec, type Tool, type Destino } from "./spec.ts";
import { TOOL_INFO, TOOLS_POR_JOB } from "./tools.ts";
import { CATALOGO_BASE, mejorEn, type Catalogo } from "./catalogo.ts";
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
  /** Paso 2 — capacidad: cuántas referencias subió y cuántos segundos pidió (opcionales: sin dato no se filtra). */
  refs?: number;
  duracion?: number | null;
};

/** ¿La herramienta acepta lo que la pieza trae? Referencias y duración son límites duros (el catálogo los dice).
 *  La duración se descarta sólo si la herramienta NO LLEGA (más larga que su máximo): dentro del rango, la
 *  duración se ajusta a la más cercana que ofrece (Kling y Seedance aceptan cualquier segundo; Omni 4/6/8/10). */
function cabe(cat: Catalogo, tool: Tool, p: PistasRuta): "refs" | "duracion" | null {
  const l = cat[tool].limites;
  if ((p.refs ?? 0) > l.refsMax) return "refs";
  if (TOOL_INFO[tool].video && p.duracion && l.duraciones.length && p.duracion > Math.max(...l.duraciones)) return "duracion";
  return null;
}

/** F6a: las reglas dicen QUÉ importa (texto, diálogo, movimiento, vertical corto); el catálogo dice
 *  QUIÉN es mejor en eso (fortalezas 0–5, Hub › Herramientas). Con el catálogo base, la elección es
 *  exactamente la de antes (test golden). Empate → la primera de TOOLS_POR_JOB. */
export function elegirHerramienta(p: PistasRuta, cat: Catalogo = CATALOGO_BASE): Eleccion {
  const todas = TOOLS_POR_JOB[p.job];
  const caben = todas.filter((x) => !cabe(cat, x, p));
  // Si ninguna cabe, se elige entre todas (el diagnóstico avisa); si todas caben, nada cambia.
  if (!caben.length || caben.length === todas.length) return elegirEntre(p, cat, todas);
  const elegida = elegirEntre(p, cat, caben);
  const sinFiltro = elegirEntre(p, cat, todas).tool;
  const motivo = cabe(cat, sinFiltro, p);
  if (!motivo || sinFiltro === elegida.tool) return elegida;
  const n = (x: Tool) => TOOL_INFO[x].nombre;
  const l = cat[sinFiltro].limites;
  const razon =
    motivo === "refs"
      ? t(`Subiste ${p.refs} referencias y ${n(sinFiltro)} acepta hasta ${l.refsMax}: va ${n(elegida.tool)}.`, `You uploaded ${p.refs} references and ${n(sinFiltro)} takes up to ${l.refsMax}: ${n(elegida.tool)} it is.`)
      : t(`Pides ${p.duracion} s y ${n(sinFiltro)} llega a ${Math.max(...l.duraciones)} s: va ${n(elegida.tool)}.`, `You want ${p.duracion} s and ${n(sinFiltro)} goes up to ${Math.max(...l.duraciones)} s: ${n(elegida.tool)} it is.`);
  return { tool: elegida.tool, porque: t(`${razon.es} ${elegida.porque.es}`, `${razon.en} ${elegida.porque.en}`) };
}

function elegirEntre(p: PistasRuta, cat: Catalogo, opciones: Tool[]): Eleccion {
  const primera = opciones[0];
  const n = (x: Tool) => TOOL_INFO[x].nombre;

  // Imagen y edición: con texto pedido, la mejor en letras exactas; si no, la mejor en caras,
  // productos y referencias.
  if (JOB_KIND[p.job] !== "video") {
    if (p.tieneTexto) {
      const x = mejorEn(cat, "texto_exacto", opciones);
      return { tool: x, porque: t(`Pediste texto en la imagen y ${n(x)} es la que mejor escribe letras exactas.`, `You asked for text in the image and ${n(x)} is the best at rendering exact lettering.`) };
    }
    const x = mejorEn(cat, "identidad", opciones);
    return { tool: x, porque: t(`${n(x)} es la que mejor respeta caras, productos y referencias.`, `${n(x)} is the best at keeping faces, products and references faithful.`) };
  }

  if (opciones.length === 1) {
    return { tool: primera, porque: t("Es la única herramienta para este trabajo.", "It is the only tool for this job.") };
  }

  // Capacidad, no fortaleza: Kling toma el cuadro inicial y el final.
  if (p.job === "transicion" && opciones.includes("kling")) {
    return { tool: "kling", porque: t("Kling toma la toma inicial y la final y hace la transición sin cortes.", "Kling takes the start and end shots and makes the transition with no cuts.") };
  }

  const vertical = p.destino === "ig_story" || p.destino === "tiktok";
  const conVoz = (): Eleccion => {
    const x = mejorEn(cat, "voz", opciones);
    return { tool: x, porque: t(`Como hay diálogo, ${n(x)} genera la voz y el sonido en el mismo video.`, `Since there is dialogue, ${n(x)} generates the voice and sound in the same video.`) };
  };

  // Escena por bloques de tiempo (nació con Sora 2, retirada): con voz, la mejor en voz; vertical
  // corta sin voz, la más rápida; si no, la primera (sigue los beats).
  if (p.job === "escena_sora") {
    if (p.tieneDialogo) return conVoz();
    if (vertical) {
      const x = mejorEn(cat, "rapidez", opciones);
      return { tool: x, porque: t(`Escena vertical corta y sin voz: ${n(x)} la hace rápido y barato.`, `A short vertical scene with no voice: ${n(x)} does it fast and cheap.`) };
    }
    return { tool: primera, porque: t(`${n(primera)} sigue los bloques de tiempo y genera la voz y el sonido en el mismo video.`, `${n(primera)} follows the timed beats and generates voice and sound in the same video.`) };
  }

  if (p.tieneDialogo) return conVoz();

  // Movimiento de cámara marcado sobre una foto: la mejor en movimientos de cámara.
  if (p.job === "animar_foto" && p.movimientoMarcado) {
    const x = mejorEn(cat, "movimiento", opciones);
    return { tool: x, porque: t(`Pediste un movimiento de cámara específico y ${n(x)} es la que mejor lo controla.`, `You asked for a specific camera move and ${n(x)} controls it best.`) };
  }

  // Redes verticales cortas sin diálogo: la más rápida y barata.
  if (p.job === "animar_foto" && vertical) {
    const x = mejorEn(cat, "rapidez", opciones);
    return { tool: x, porque: t(`Para un clip vertical corto y sin voz, ${n(x)} le da buen movimiento a la foto, rápido y barato.`, `For a short vertical clip with no voice, ${n(x)} animates the photo with good motion, fast and cheap.`) };
  }

  return { tool: primera, porque: t(`${n(primera)} es el mejor balance entre calidad y control para este video.`, `${n(primera)} is the best balance of quality and control for this video.`) };
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
    refs: spec.refs.length,
    duracion: spec.duracion,
  };
}

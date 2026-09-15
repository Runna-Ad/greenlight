/**
 * "Úsalo en…": qué modelo/nivel de la herramienta conviene para ESTE prompt, y cómo llegar
 * a él. El diseñador pega a mano, así que Prisma le dice dónde pegar y por qué, con el
 * conocimiento verificado el 2026-09-11 (ver TOOL NOTES en prisma_reglas). Módulo puro:
 * lo llaman el cliente (anticipo en el paso 3, chip en el resultado) y el servidor (se
 * guarda en prisma_prompts.modelo_sug y viaja al writer como TARGET MODEL).
 */
import { JOB_KIND, textoDe, type Destino, type JobType, type PromptSpec, type Tool } from "./spec.ts";
import { t, type Par } from "./copy.ts";
import { CATALOGO_BASE, modeloPorRol, type Catalogo, type ModeloHerramienta, type RolModelo } from "./catalogo.ts";
import type { CampoVeredicto } from "./resultado.ts";

export type PistasModelo = {
  job: JobType;
  tool: Tool;
  destino: Destino;
  refs: number;
  texto: boolean;
  dialogo: boolean;
  duracion: number | null;
  /** F4: lo que a ESTA marca le viene fallando en esta herramienta (de los resultados subidos). */
  fallos?: CampoVeredicto[];
};

export type Recomendacion = {
  /** Identificador estable (se guarda y se mide): gemini-3-pro-image, gpt-image-2.5-sunburst… */
  modelo: string;
  etiqueta: Par;
  porque: Par;
  comoLlegar: Par;
  /** F6a: el tier del modelo; el writer dimensiona el spec con esto, no con el nombre (que el catálogo cambia). */
  rol: RolModelo;
};

const SOCIAL: Destino[] = ["ig_story", "ig_feed", "tiktok", "fb_ad"];

/** F6a: el CÓDIGO decide el rol (rápido o fino) con las mismas condiciones de siempre; el
 *  catálogo dice qué modelo es cada rol hoy (id, nombre, cómo llegar) — "llegó ChatGPT 6" = cambiar
 *  una fila en Hub › Herramientas, sin deploy. Los porqués nombran los modelos del catálogo. */
export function recomendarModelo(p: PistasModelo, cat: Catalogo = CATALOGO_BASE): Recomendacion {
  const rapido = modeloPorRol(cat, p.tool, "rapido");
  const fino = modeloPorRol(cat, p.tool, "fino");
  const rec = (m: ModeloHerramienta, porque: Par): Recomendacion => ({ modelo: m.id, etiqueta: t(m.etiqueta, m.etiqueta), porque, comoLlegar: m.comoLlegar, rol: m.rol });
  switch (p.tool) {
    case "nanobanana": {
      // Lo que a esta marca le falló en los resultados que subió (texto, parecido) pide el fino.
      const porFallos = fallaFino(p.fallos);
      const pro = p.texto || p.job === "aplicar_logo" || p.job === "dos_personajes" || p.job === "correccion" || p.destino === "print" || p.refs >= 3 || porFallos;
      if (!pro) return rec(rapido, t(`Para iterar rápido y barato. Cuando tengas la versión buena, ciérrala en ${fino.etiqueta}.`, `Fast and cheap to iterate. Once you have the right version, finish it in ${fino.etiqueta}.`));
      return rec(
        fino,
        p.job === "correccion"
          ? t(`Corregir sin mover lo demás: ${fino.etiqueta} respeta mejor la imagen original.`, `Fixing without moving the rest: ${fino.etiqueta} respects the original image better.`)
          : porFallos
          ? t(`A esta marca le ha fallado el texto o el parecido en ${rapido.etiqueta}: ${fino.etiqueta} lo cuida mejor.`, `This brand's results kept missing the text or the likeness in ${rapido.etiqueta}: ${fino.etiqueta} handles them better.`)
          : t(`Texto exacto, logos, impresión o varias referencias: ${fino.etiqueta} los resuelve mejor.`, `Exact text, logos, print or several references: ${fino.etiqueta} handles them better.`),
      );
    }
    case "chatgpt": {
      const porFallos = fallaFino(p.fallos);
      const preciso = JOB_KIND[p.job] === "edicion" || p.texto || porFallos;
      if (!preciso) return rec(rapido, t(`Imagen nueva sin texto: ${rapido.etiqueta} es el modo rápido de todos los días.`, `A new image with no text: ${rapido.etiqueta} is the everyday fast mode.`));
      return rec(
        fino,
        porFallos
          ? t(`A esta marca le ha fallado el texto o el parecido en ${rapido.etiqueta}: ${fino.etiqueta} lo cuida mejor.`, `This brand's results kept missing the text or the likeness in ${rapido.etiqueta}: ${fino.etiqueta} handles them better.`)
          : t(`Ediciones precisas y texto exacto: ${fino.etiqueta} respeta mejor lo que no debe cambiar.`, `Precise edits and exact text: ${fino.etiqueta} is better at leaving the rest untouched.`),
      );
    }
    case "veo": {
      if (!p.dialogo && SOCIAL.includes(p.destino)) return rec(rapido, t(`Clip para redes sin voz: ${rapido.etiqueta} cuesta una fracción y se ve igual en el celular.`, `A social clip with no voice: ${rapido.etiqueta} costs a fraction and looks the same on a phone.`));
      return rec(fino, t(p.dialogo ? "Hay voz: la versión completa cuida el diálogo y el sonido." : "Pieza para pantalla grande: la versión completa rinde más detalle.", p.dialogo ? "There is voice: the full model takes care of dialogue and sound." : "A piece for a big screen: the full model renders more detail."));
    }
    case "kling": {
      if ((p.duracion ?? 5) <= 5 && !p.dialogo) return rec(rapido, t(`Clip corto sin voz: ${rapido.etiqueta} tarda y cuesta la mitad con casi la misma calidad.`, `A short clip with no voice: ${rapido.etiqueta} takes and costs half with almost the same quality.`));
      return rec(fino, t("Clip largo o con voz: el modelo completo mantiene mejor la coherencia.", "A long clip or one with voice: the full model keeps coherence better."));
    }
    case "higgsfield":
    default:
      return rec(fino, t("El preset de cámara que va al final del prompt es el que manda.", "The camera preset at the end of the prompt is what matters."));
  }
}

/** ¿Le falla lo "fino" (texto exacto, parecido)? Es lo que el nivel alto resuelve mejor. */
const fallaFino = (fallos: CampoVeredicto[] | undefined): boolean => !!fallos && (fallos.includes("texto") || fallos.includes("identidad"));

/** Pistas desde un spec ya compilado (resultado, refinar, cambiar de herramienta). */
export function pistasModelo(spec: PromptSpec, tool: Tool = spec.tool, fallos: CampoVeredicto[] = []): PistasModelo {
  return {
    job: spec.job,
    tool,
    destino: spec.destino ?? "libre",
    refs: spec.refs.length,
    texto: !!textoDe(spec),
    dialogo: !!spec.dialogo?.texto.trim(),
    duracion: spec.duracion,
    fallos,
  };
}

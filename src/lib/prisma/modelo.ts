/**
 * "Úsalo en…": qué modelo/nivel de la herramienta conviene para ESTE prompt, y cómo llegar
 * a él. El diseñador pega a mano, así que Prisma le dice dónde pegar y por qué, con el
 * conocimiento verificado el 2026-09-11 (ver TOOL NOTES en prisma_reglas). Módulo puro:
 * lo llaman el cliente (anticipo en el paso 3, chip en el resultado) y el servidor (se
 * guarda en prisma_prompts.modelo_sug y viaja al writer como TARGET MODEL).
 */
import { JOB_KIND, textoDe, type Destino, type JobType, type PromptSpec, type Tool } from "./spec.ts";
import { t, type Par } from "./copy.ts";
import { CATALOGO_BASE, modeloPorRol, type Catalogo, type CostoModelo, type ModeloHerramienta, type RolModelo } from "./catalogo.ts";
import { creditosDe } from "./costo.ts";
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
  /** La página de ese modelo en Higgsfield (null = la de la familia, TOOL_INFO.url). */
  url: string | null;
  /** Paso 2: lo que cuesta un intento (null = sin dato). */
  costo: CostoModelo | null;
};

const SOCIAL: Destino[] = ["ig_story", "ig_feed", "tiktok", "fb_ad"];

/** F6a: el CÓDIGO decide el rol (rápido o fino) con las mismas condiciones de siempre; el
 *  catálogo dice qué modelo es cada rol hoy (id, nombre, cómo llegar) — "llegó ChatGPT 6" = cambiar
 *  una fila en Hub › Herramientas, sin deploy. Los porqués nombran los modelos del catálogo. */
export function recomendarModelo(p: PistasModelo, cat: Catalogo = CATALOGO_BASE): Recomendacion {
  const r = porRol(p, cat);
  if (r.rol !== "rapido" || !(ROLES_POR_TOOL_CON_FINO(cat, p.tool))) return r;
  // Paso 2 (Pedro: "ahorrar sin sacrificar calidad"): la calidad decidió que basta el rápido. Si el FINO de la
  // misma herramienta es ILIMITADO o ESTRICTAMENTE más barato (p. ej. Nano Banana Pro es ilimitado y el 2 no),
  // el fino: mejor calidad sin gastar más. Al mismo precio pagado se queda el rápido (es el que itera más
  // rápido: Kling Turbo). Al revés nunca: si la pieza pidió el fino, se queda el fino aunque cueste.
  const fino = modeloPorRol(cat, p.tool, "fino");
  const cr = creditosDe(r.costo);
  const cf = creditosDe(fino.costo);
  if (cf === null || (cr !== null && cf > cr) || (cr === null && cf > 0)) return r;
  if (cr !== null && cf === cr && cf > 0) return r;
  const porque = cf === 0
    ? t(`${fino.etiqueta} es ilimitado en nuestro plan: la calidad alta sin gastar créditos.`, `${fino.etiqueta} is unlimited on our plan: top quality without spending credits.`)
    : t(`${fino.etiqueta} cuesta lo mismo o menos que ${r.etiqueta.es} y rinde más calidad.`, `${fino.etiqueta} costs the same or less than ${r.etiqueta.en} and delivers higher quality.`);
  return { modelo: fino.id, etiqueta: t(fino.etiqueta, fino.etiqueta), porque, comoLlegar: fino.comoLlegar, rol: fino.rol, url: fino.url, costo: fino.costo };
}

/** ¿La herramienta tiene un modelo fino distinto del rápido? (Higgsfield DoP, Seedream y Omni sólo tienen fino.) */
const ROLES_POR_TOOL_CON_FINO = (cat: Catalogo, tool: PistasModelo["tool"]): boolean => modeloPorRol(cat, tool, "fino").id !== modeloPorRol(cat, tool, "rapido").id;

/** F6a: el CÓDIGO decide el rol por lo que la pieza PIDE (calidad), con las condiciones de siempre. */
function porRol(p: PistasModelo, cat: Catalogo): Recomendacion {
  const rapido = modeloPorRol(cat, p.tool, "rapido");
  const fino = modeloPorRol(cat, p.tool, "fino");
  const rec = (m: ModeloHerramienta, porque: Par): Recomendacion => ({ modelo: m.id, etiqueta: t(m.etiqueta, m.etiqueta), porque, comoLlegar: m.comoLlegar, rol: m.rol, url: m.url, costo: m.costo });
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
    case "seedance": {
      // Mini llega hasta 720p y cuesta una fracción: de sobra para redes sin voz. Con voz o para pantalla
      // grande, el completo (Seedance es lo más caro del equipo: sólo cuando la pieza lo pide).
      if (!p.dialogo && SOCIAL.includes(p.destino)) return rec(rapido, t(`Clip para redes sin voz: ${rapido.etiqueta} (hasta 720p) cuesta una fracción y se ve igual en el celular.`, `A social clip with no voice: ${rapido.etiqueta} (up to 720p) costs a fraction and looks the same on a phone.`));
      return rec(fino, t(p.dialogo ? `Hay voz: ${fino.etiqueta} cuida el diálogo y el lip-sync.` : `Pieza para pantalla grande: ${fino.etiqueta} rinde 1080p (o 4K si la pieza lo pide).`, p.dialogo ? `There is voice: ${fino.etiqueta} takes care of dialogue and lip-sync.` : `A piece for a big screen: ${fino.etiqueta} renders 1080p (or 4K if the piece needs it).`));
    }
    case "seedream":
      return rec(fino, t(`${fino.etiqueta} sigue bien las referencias numeradas (Image 1, Image 2…).`, `${fino.etiqueta} follows numbered references well (Image 1, Image 2…).`));
    case "gemini_omni":
      return rec(fino, t(`${fino.etiqueta} sigue instrucciones en lenguaje natural y genera el sonido con el video (720p).`, `${fino.etiqueta} follows natural-language instructions and generates sound with the video (720p).`));
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

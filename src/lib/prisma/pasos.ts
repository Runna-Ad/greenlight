/**
 * "Paso a paso en Higgsfield": lo que el diseñador hace DENTRO de Higgsfield para ESTE prompt — qué
 * modelo abrir, qué imagen va en qué casilla y en qué orden, qué ajustes elegir, y cómo iterar sin
 * quemar créditos. Sale del spec + la herramienta + el modelo recomendado; el conocimiento viene del
 * Help Center y del blog de Higgsfield (tasks/higgsfield-helpcenter-2026-09-16.md y
 * tasks/higgsfield-blog-guias-2026-09-16.md). Módulo puro (cliente y servidor; se prueba en node).
 */
import { JOB_KIND, type PromptSpec, type Tool } from "./spec.ts";
import { t, REF_LABEL, type Par } from "./copy.ts";
import { duracionValida, duracionVeo, TOOL_INFO } from "./tools.ts";
import { CATALOGO_BASE, type Catalogo } from "./catalogo.ts";
import { ORDINAL } from "./compilers/chatgpt.ts";

/** Cómo se llama la imagen N dentro del prompt de cada herramienta (el diseñador sube en ESE orden). */
function etiquetaEnPrompt(tool: Tool, n: number): string {
  switch (tool) {
    case "nanobanana":
      return `[Imagen ${n}]`;
    case "chatgpt":
      return `the ${ORDINAL[n - 1] ?? `#${n}`} attached image`;
    case "seedream":
      return `Image ${n}`;
    default:
      return `@image${n}`;
  }
}

const lista = (spec: PromptSpec, tool: Tool): { es: string; en: string } => {
  const partes = spec.refs.map((r, i) => {
    const et = etiquetaEnPrompt(tool, i + 1);
    return { es: `${i + 1}) ${REF_LABEL[r.role].es} (${et})`, en: `${i + 1}) ${REF_LABEL[r.role].en} (${et})` };
  });
  return { es: partes.map((p) => p.es).join(" · "), en: partes.map((p) => p.en).join(" · ") };
};

/** Qué imagen va dónde. Cada herramienta tiene su casilla (Help Center: Kling toma la imagen como Start
 *  frame; Seedance/Omni por @; DoP como keyframe; las de imagen, adjuntas en orden). */
function pasoReferencias(spec: PromptSpec, tool: Tool, cat: Catalogo): Par | null {
  if (!spec.refs.length) return null;
  const hay = (role: string) => spec.refs.some((r) => r.role === role);
  if (tool === "kling") {
    if (hay("inicio") && hay("fin")) return t("Sube la toma inicial en «Start frame» y la final en «End frame».", "Upload the start shot to «Start frame» and the end shot to «End frame».");
    return t(
      "Sube la foto en «Start frame». Si el personaje o producto se repite en otras tomas, créalo como Element (Assets → ⋯ → Create Element) y llámalo con @ en el prompt.",
      "Upload the photo to «Start frame». If the character or product repeats in other shots, make it an Element (Assets → ⋯ → Create Element) and call it with @ in the prompt.",
    );
  }
  if (tool === "higgsfield") return t("Sube la foto como keyframe (imagen de inicio).", "Upload the photo as the keyframe (start image).");
  const max = cat[tool].limites.refsMax;
  if (tool === "veo") {
    if (hay("inicio") && hay("fin")) return t("Elige primer y último cuadro: la toma inicial como primer cuadro y la final como último (en ese orden).", "Choose first and last frame: the start shot as the first frame and the end shot as the last (in that order).");
    return t(`Sube las referencias (hasta ${max}). Con referencias Veo genera 8 s.`, `Upload the references (up to ${max}). With references Veo generates 8 s.`);
  }
  const l = lista(spec, tool);
  if (tool === "seedance" || tool === "gemini_omni") {
    return t(`Sube las referencias EN ESTE ORDEN (Higgsfield las nombra @image1, @image2… y el prompt ya las usa así): ${l.es}.`, `Upload the references IN THIS ORDER (Higgsfield names them @image1, @image2… and the prompt already uses those names): ${l.en}.`);
  }
  return t(`Adjunta las imágenes EN ESTE ORDEN (el prompt las nombra así): ${l.es}.`, `Attach the images IN THIS ORDER (the prompt names them this way): ${l.en}.`);
}

/** Resolución para iterar y para la final: la resolución es el mayor multiplicador del costo (blog
 *  "AI video credits explained"): se prueba barato y se paga alto sólo en la toma buena. */
function pasoAjustes(spec: PromptSpec, tool: Tool, cat: Catalogo): Par {
  const aspect = spec.aspect;
  if (JOB_KIND[spec.job] !== "video") {
    const alta = spec.destino === "print" || spec.destino === "web_banner";
    if (tool === "chatgpt") return t(`Ajustes: formato ${aspect} · calidad Medium y 1K para probar; High y ${alta ? "4K" : "2K"} para la final.`, `Settings: ${aspect} format · Medium quality and 1K to test; High and ${alta ? "4K" : "2K"} for the final.`);
    if (tool === "seedream") return t(`Ajustes: formato ${aspect} · calidad basic para probar; high para la final.`, `Settings: ${aspect} format · basic quality to test; high for the final.`);
    return t(`Ajustes: formato ${aspect} · 1K para probar; ${alta ? "4K" : "2K"} para la final.`, `Settings: ${aspect} format · 1K to test; ${alta ? "4K" : "2K"} for the final.`);
  }
  const opciones = cat[tool].limites.duraciones;
  const dur = tool === "veo" ? duracionVeo(spec.duracion, spec.refs.length, opciones) : duracionValida(tool, spec.duracion, opciones);
  const base = { es: `Ajustes: ${dur} s · ${aspect}`, en: `Settings: ${dur} s · ${aspect}` };
  if (tool === "gemini_omni") return t(`${base.es} · 720p (es la única en Omni).`, `${base.en} · 720p (Omni's only option).`);
  if (tool === "higgsfield") return t(`${base.es} (DoP genera 3 o 5 s).`, `${base.en} (DoP generates 3 or 5 s).`);
  const final = tool === "veo" ? "1080p" : "1080p (4K sólo si la pieza lo pide)";
  const finalEn = tool === "veo" ? "1080p" : "1080p (4K only if the piece needs it)";
  return t(`${base.es} · 720p para probar; ${final} para la final, con el MISMO prompt.`, `${base.en} · 720p to test; ${finalEn} for the final, with the SAME prompt.`);
}

function pasoSonido(spec: PromptSpec, tool: Tool, cat: Catalogo): Par | null {
  if (JOB_KIND[spec.job] !== "video" || !cat[tool].limites.audio) return null;
  return spec.dialogo?.texto.trim()
    ? t("Sonido encendido: el diálogo ya va en el prompt, tal cual.", "Sound on: the dialogue is already in the prompt, as written.")
    : t("Sonido: no hay diálogo; si no necesitas audio, apágalo.", "Sound: there is no dialogue; turn audio off if you don't need it.");
}

/** Un consejo por herramienta, del Help Center / blog de Higgsfield. */
function consejo(spec: PromptSpec, tool: Tool): Par | null {
  switch (tool) {
    case "seedance":
      return t("Seedance es el más caro del equipo: revisa el clip completo a 720p (los fallos suelen salir entre el segundo 5 y el 8) antes de subir la resolución.", "Seedance is the team's most expensive model: review the full clip at 720p (problems usually show between seconds 5 and 8) before raising the resolution.");
    case "kling":
      return t("Kling: una acción y un movimiento de cámara por toma. Si se queda corto, divide en tomas en vez de cargar una sola.", "Kling: one action and one camera move per shot. If it falls short, split into shots instead of overloading one.");
    case "higgsfield":
      return spec.preset ? t(`Elige el preset «${spec.preset}». Si el movimiento no sale, prueba otro de la misma categoría o activa Enhance.`, `Pick the «${spec.preset}» preset. If the move doesn't land, try another in the same category or turn on Enhance.`) : null;
    case "gemini_omni":
      return t("Omni corrige por turnos: si algo sale mal, pide SÓLO ese cambio en lenguaje natural en vez de regenerar todo.", "Omni edits turn by turn: if something is off, ask for ONLY that change in plain language instead of regenerating everything.");
    case "nanobanana":
    case "seedream":
    case "chatgpt":
      return spec.texto?.contenido?.trim() ? t("El texto va entre comillas en el prompt: revisa letra por letra antes de aprobar.", "The text is quoted in the prompt: check it letter by letter before approving.") : null;
    default:
      return null;
  }
}

export function pasosHiggsfield(spec: PromptSpec, tool: Tool, modelo: string, cat: Catalogo = CATALOGO_BASE): Par[] {
  const pasos: (Par | null)[] = [
    t(`Abre ${modelo} en Higgsfield (botón «Abrir»).`, `Open ${modelo} in Higgsfield («Open» button).`),
    pasoReferencias(spec, tool, cat),
    pasoAjustes(spec, tool, cat),
    pasoSonido(spec, tool, cat),
    t(`Copia el prompt completo y pégalo${TOOL_INFO[tool].formato === "json" ? " tal cual (es JSON)" : ""}; genera.`, `Copy the full prompt and paste it${TOOL_INFO[tool].formato === "json" ? " as is (it is JSON)" : ""}; generate.`),
    consejo(spec, tool),
    t("Si algo falla, cambia UNA sola cosa por intento (el prompt o una referencia, no las dos).", "If something is off, change ONE thing per try (the prompt or a reference, not both)."),
    t("Sube lo que salió en «¿Cómo salió?»: H.Ü.E lo revisa y cuenta la vuelta.", "Upload the result in «How did it turn out?»: H.Ü.E checks it and counts the round."),
  ];
  return pasos.filter((p): p is Par => !!p);
}

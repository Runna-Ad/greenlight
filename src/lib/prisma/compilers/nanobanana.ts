/**
 * Compiler → Nano Banana (Gemini image). Lenguaje natural, sin parámetros, nombrando
 * cada referencia por posición "[Imagen N]". Mejoras sobre las plantillas de Roco:
 * cláusula PRESERVAR siempre (identidad, manos, texto del empaque), igualar luz y
 * perspectiva desde el ADN visual, y paleta de marca en foto de producto.
 */
import { etiquetaRef, frases, negativosDe, textoDe, type PromptSpec, type RefRole } from "../spec.ts";
import type { Salida } from "./salida.ts";

/** Cómo se nombra una referencia dentro del prompt. Nano Banana entiende "[Imagen N]";
 *  ChatGPT prefiere "the first attached image". Cada compiler pasa la suya. */
export type Etiquetador = (spec: PromptSpec, role: RefRole) => string | null;

const etiquetaNB: Etiquetador = (spec, role) => etiquetaRef(spec, role);

/** La instrucción principal, por trabajo. Cada una es una frase completa en inglés.
 *  `sujeto`/`accion` del spec se anexan al final para que NADA que H.Ü.E escribió se
 *  pierda (antes foto_producto leía sólo `entorno` y tiraba el resto). */
function instruccion(spec: PromptSpec, etiqueta: Etiquetador): string {
  const s = spec;
  const ref = (sp: PromptSpec, role: RefRole): string => etiqueta(sp, role) ?? `[Imagen: ${role}]`;
  const idea = s.accion || s.idea;
  switch (s.job) {
    case "cambio_outfit":
      return `Take the subject from ${ref(s, "sujeto")} and dress them in the complete outfit and accessories from ${ref(s, "outfit")}. The clothing must fit the body naturally and follow the original pose and proportions`;
    case "cambio_fondo":
      return `Take the subject from ${ref(s, "sujeto")} and place them in this new setting: ${s.entorno || idea}. Match the subject's lighting, shadows and perspective to the new background so the result looks like one real photograph`;
    case "cambio_pose":
      return `Take the subject from ${ref(s, "sujeto")} and put them in the exact pose shown in ${ref(s, "pose")}, adapting body and clothing realistically to the new posture. Keep the original background from ${ref(s, "sujeto")}`;
    case "agregar_objeto":
      return `Integrate the object from ${ref(s, "objeto")} into the scene from ${ref(s, "escena")}: ${idea || "in the most natural and logical way"}. Match scale, perspective, lighting direction and shadows; if the object is transparent or reflective, show realistic refraction and reflections of the scene`;
    case "cambio_angulo":
      return `Re-imagine the scene from ${ref(s, "escena")} from a completely different camera angle: ${s.camara.angulo || idea}. Do not only rotate the subject: rebuild the environment that becomes visible from the new position, replacing what the original background showed`;
    case "restaurar_foto":
      return `Restore the old photograph from ${ref(s, "sujeto")}: remove stains, folds, scratches and damage, then colorize it realistically with natural warm skin tones${s.paleta.length ? ` and period-appropriate colors such as ${s.paleta.join(", ")}` : " and period-appropriate clothing colors"}. The result should look like a sharp, modern high-quality photo that keeps the original framing`;
    case "mejora_foto":
      return `Perform a professional photo enhancement on ${ref(s, "sujeto")}: ${idea || "balance white point, contrast, saturation and sharpness for an editorial-quality result"}. Apply subtle color grading; do not change the content of the image`;
    case "aplicar_logo":
      return `Apply the logo from ${ref(s, "logo")} onto the product or surface in ${ref(s, "producto")}. ${idea || "The logo must follow the curvature, texture and lighting of the surface like a real print"}. Keep the logo's proportions and every letter legible`;
    case "dos_personajes": {
      const pose = etiqueta(s, "pose");
      return `Create one photorealistic scene with the person from ${ref(s, "sujeto")} and the person from ${ref(s, "personaje2")} together${pose ? `, using the pose from ${pose}` : ""}. Scene and interaction: ${idea}. Lighting, shadows and perspective must match for both people`;
    }
    case "cambio_epoca":
      return `Transport the subject from ${ref(s, "sujeto")} to this era and style: ${idea}. Adapt clothing, hairstyle and environment to that period and apply a color treatment and grain that simulates photography of that time`;
    case "figura_coleccionable": {
      const emp = etiqueta(s, "empaque");
      return `Turn the subject from ${ref(s, "sujeto")} into a collectible figure${s.estilo ? ` in ${s.estilo} style` : " in detailed vinyl style"}, standing on a round base under clean studio lighting${emp ? `. Behind the figure, its product box, with a design inspired by ${emp}` : ". Next to it, a product box with a modern graphic design showing an illustration of the character"}`;
    }
    case "foto_producto":
      return `Turn the product photo from ${ref(s, "producto")} into a high-impact advertising photograph. Keep the product itself unchanged but optimize lighting, focus and color. ${s.entorno ? `Place it in this setting: ${s.entorno}` : "Place it in the best aspirational setting for its audience"}${s.accion ? `. Composition and action: ${s.accion}` : ""}. Avoid distortion, harsh shadows and busy backgrounds; textures and details must look natural and high resolution`;
    case "escena_persona":
      return `Take the person from ${ref(s, "sujeto")} and create a new photograph of them ${s.accion ? s.accion : "in a natural pose"}${s.entorno ? ` in ${s.entorno}` : ""}. Integrate lighting, shadows and perspective so it looks like one real shot`;
    case "imagen_libre":
    default: {
      const estilo = etiqueta(s, "estilo");
      return `Create an image of ${s.sujeto || idea}${s.accion ? ` ${s.accion}` : ""}${s.entorno ? `, in ${s.entorno}` : ""}${estilo ? `, in the visual style of ${estilo}` : ""}`;
    }
  }
}

/** Qué se conserva. Defaults por tipo de referencia + lo que el spec agregue. */
function preservar(spec: PromptSpec): string[] {
  const out = new Set<string>(spec.preservar);
  const roles = new Set(spec.refs.map((r) => r.role));
  if (roles.has("sujeto") || roles.has("personaje2")) {
    out.add("the exact facial identity, age and skin tone of each person");
    out.add("natural hands with five fingers");
  }
  if (roles.has("producto")) out.add("the product's shape, label and any text on it, fully legible");
  if (roles.has("logo")) out.add("the logo's exact letters and proportions");
  if (spec.job === "cambio_pose" || spec.job === "cambio_outfit") out.add("the original background");
  return [...out];
}

/** Luz y perspectiva a igualar, tomadas del ADN visual de la referencia principal. */
function igualarADN(spec: PromptSpec): string | null {
  const principal = spec.refs.find((r) => r.dna && (r.role === "sujeto" || r.role === "escena" || r.role === "producto"));
  const d = principal?.dna;
  if (!d) return null;
  const partes = [d.luz && `light: ${d.luz}`, d.lente && `lens feel: ${d.lente}`, d.textura && `texture: ${d.textura}`].filter(Boolean);
  return partes.length ? `Match the reference's ${partes.join("; ")}` : null;
}

function tecnicos(spec: PromptSpec): string | null {
  const c = spec.camara;
  const partes = [
    c.lente && `lens: ${c.lente}`,
    c.angulo && `camera angle: ${c.angulo}`,
    spec.luz && `lighting: ${spec.luz}`,
    spec.mood && `mood: ${spec.mood}`,
    spec.estilo && spec.job !== "figura_coleccionable" && `style: ${spec.estilo}`,
    spec.texturas.length && `textures: ${spec.texturas.join(", ")}`,
  ].filter(Boolean);
  return partes.length ? `Technical details: ${partes.join(", ")}` : null;
}

function marca(spec: PromptSpec): string | null {
  const m = spec.marca;
  if (!m) return null;
  const partes = [
    m.paleta.length && `brand palette ${m.paleta.join(", ")}`,
    m.tono && `tone ${m.tono}`,
  ].filter(Boolean);
  return partes.length ? `Brand: ${m.nombre}, ${partes.join(", ")}` : null;
}

/** La cláusula del texto en imagen: letra por letra, entre comillas, y nada más de texto.
 *  Es la misma para las dos herramientas de imagen (las dos pintan texto si se les pide
 *  claro). Si no hay texto, se prohíbe explícitamente. */
export function clausulaTexto(spec: PromptSpec): string {
  const t = textoDe(spec);
  if (!t) return "No text, letters, captions or watermarks anywhere in the image";
  return `Render this exact text, spelled letter by letter with no changes, as part of the image: "${t.contenido.trim()}"${t.posicion ? `, placed ${t.posicion}` : ""}${t.estilo ? `, ${t.estilo}` : ", in clean legible typography that suits the scene"}. No other text`;
}

/** El cuerpo compartido de un prompt de imagen (Nano Banana y ChatGPT usan el mismo
 *  orden: instrucción → igualar referencia → técnica → marca → texto → conservar → evitar). */
export function cuerpoImagen(spec: PromptSpec, etiqueta: Etiquetador): (string | null)[] {
  const evitar = negativosDe(spec);
  return [
    instruccion(spec, etiqueta),
    igualarADN(spec),
    tecnicos(spec),
    marca(spec),
    clausulaTexto(spec),
    spec.refs.length || spec.preservar.length ? `Keep unchanged: ${preservar(spec).join("; ")}` : null,
    evitar.length ? `Avoid: ${evitar.join(", ")}` : null,
  ];
}

export function compilarNanoBanana(spec: PromptSpec): Salida {
  const texto = frases(
    ...cuerpoImagen(spec, etiquetaNB),
    `Output format: ${spec.aspect}, photorealistic unless a style says otherwise`,
  );
  return { texto, formato: "texto" };
}

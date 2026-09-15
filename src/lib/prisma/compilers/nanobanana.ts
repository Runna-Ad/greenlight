/**
 * Compiler → Nano Banana (Gemini image). Lenguaje natural, sin parámetros, nombrando
 * cada referencia por posición "[Imagen N]". Mejoras sobre las plantillas de Roco:
 * cláusula PRESERVAR siempre (identidad, manos, texto del empaque), igualar luz y
 * perspectiva desde el ADN visual, y paleta de marca en foto de producto.
 */
import { etiquetaRef, frases, indiceRef, negativosDe, textoDe, type PromptSpec, type RefRole } from "../spec.ts";
import { positivar } from "../positivo.ts";
import { zonaSeguraImagen } from "./zonas.ts";
import type { Salida } from "./salida.ts";

/** Cómo se nombra una referencia dentro del prompt. Nano Banana entiende "[Imagen N]";
 *  ChatGPT prefiere "the first attached image". Cada compiler pasa la suya. */
export type Etiquetador = (spec: PromptSpec, role: RefRole, corto?: boolean) => string | null;

/** "[Imagen 1: caption]" la primera vez; "[Imagen 1]" en una segunda mención (cada palabra cuenta). */
const etiquetaNB: Etiquetador = (spec, role, corto = false) => {
  if (!corto) return etiquetaRef(spec, role);
  const n = indiceRef(spec, role);
  return n === null ? null : `[Imagen ${n}]`;
};

/** La instrucción principal, por trabajo. Cada una es una frase completa en inglés.
 *  `sujeto`/`accion` del spec se anexan al final para que NADA que H.Ü.E escribió se
 *  pierda (antes foto_producto leía sólo `entorno` y tiraba el resto). */
function instruccion(spec: PromptSpec, etiqueta: Etiquetador): string {
  const s = spec;
  const ref = (sp: PromptSpec, role: RefRole, corto = false): string => etiqueta(sp, role, corto) ?? `[Imagen: ${role}]`;
  const idea = s.accion || s.idea;
  switch (s.job) {
    case "cambio_outfit":
      return `Take the subject from ${ref(s, "sujeto")} and dress them in the complete outfit and accessories from ${ref(s, "outfit")}. The clothing must fit the body naturally and follow the original pose and proportions`;
    case "cambio_fondo":
      return `Take the subject from ${ref(s, "sujeto")} and place them in this new setting: ${s.entorno || idea}. Match the subject's lighting, shadows and perspective to the new background so the result looks like one real photograph`;
    case "cambio_pose":
      return `Take the subject from ${ref(s, "sujeto")} and put them in the exact pose shown in ${ref(s, "pose")}, adapting body and clothing realistically to the new posture. Keep the original background from ${ref(s, "sujeto", true)}`;
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
      return `Create one scene with the person from ${ref(s, "sujeto")} and the person from ${ref(s, "personaje2")} together${pose ? `, using the pose from ${pose}` : ""}. Scene and interaction: ${idea}. Matching light and perspective for both`;
    }
    case "cambio_epoca":
      return `Transport the subject from ${ref(s, "sujeto")} to this era and style: ${idea}. Adapt clothing, hairstyle and environment to that period and apply a color treatment and grain that simulates photography of that time`;
    case "figura_coleccionable": {
      const emp = etiqueta(s, "empaque");
      return `Turn the subject from ${ref(s, "sujeto")} into a collectible figure${s.estilo ? ` in ${s.estilo} style` : " in detailed vinyl style"}, standing on a round base under clean studio lighting${emp ? `. Behind the figure, its product box, with a design inspired by ${emp}` : ". Next to it, a product box with a modern graphic design showing an illustration of the character"}`;
    }
    case "correccion":
      // F4: la imagen que SALIÓ es la única referencia; `accion` es la edición que H.Ü.E dedujo al
      // comparar. Un cambio, dicho primero; lo demás lo protege "Keep unchanged" (Nano Banana) o
      // "Change ONLY this … Everything else stays" (ChatGPT): aquí no se repite.
      return `Edit ${ref(s, "resultado")}: ${s.accion || idea}`;
    case "foto_producto":
      return `Turn the product photo from ${ref(s, "producto")} into a high-impact advertising photograph: product unchanged, better light, focus and color. ${s.entorno ? `Setting: ${s.entorno}` : "Setting: the best aspirational scene for its audience"}${s.accion ? `. Composition: ${s.accion}` : ""}. Accurate proportions, soft shadows, natural high-resolution detail`;
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
    out.add("the exact face, age and skin tone of each person");
    out.add("natural hands with five fingers");
  }
  if (roles.has("producto")) out.add("the product's shape, label and text, legible");
  if (roles.has("logo")) out.add("the logo's exact letters and proportions");
  if (spec.job === "cambio_pose" || spec.job === "cambio_outfit") out.add("the original background");
  if (spec.job === "correccion") out.add("everything else in the image: subject, composition, colors and light");
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

/** Compacto a propósito: cada palabra de etiqueta cuenta contra el tope del prompt. */
function tecnicos(spec: PromptSpec): string | null {
  const c = spec.camara;
  const partes = [
    c.lente && `Lens ${c.lente}`,
    c.angulo && `angle ${c.angulo}`,
    spec.luz && `light ${spec.luz}`,
    spec.mood && `mood ${spec.mood}`,
    spec.estilo && spec.job !== "figura_coleccionable" && `style ${spec.estilo}`,
    spec.texturas.length && `textures ${spec.texturas.slice(0, 2).join(", ")}`,
  ].filter(Boolean);
  return partes.length ? partes.join("; ") : null;
}

function marca(spec: PromptSpec): string | null {
  const m = spec.marca;
  if (!m) return null;
  const partes = [
    m.paleta.length && `palette ${m.paleta.join(", ")}`,
    m.tono && `tone ${m.tono}`,
  ].filter(Boolean);
  return partes.length ? `Brand ${m.nombre}: ${partes.join("; ")}` : null;
}

/** La cláusula del texto en imagen: letra por letra, entre comillas, y nada más de texto.
 *  Es la misma para las dos herramientas de imagen (las dos pintan texto si se les pide
 *  claro). Si no hay texto, se prohíbe explícitamente. */
export function clausulaTexto(spec: PromptSpec): string | null {
  const t = textoDe(spec);
  // Una corrección sin texto que arreglar no dice nada del texto: la imagen puede traerlo y
  // "Keep unchanged" ya lo protege; prohibirlo lo borraría.
  if (!t) return spec.job === "correccion" ? null : "No text, letters, captions or watermarks anywhere in the image";
  // Sin estilo pedido se pide una TIPOGRAFÍA real: "clean typography" a secas produce letras
  // genéricas y espaciado raro; una familia concreta y contraste alto rinden mucho mejor.
  return `Render this exact text, letter by letter, no changes: "${t.contenido.trim()}"${t.posicion ? `, placed ${t.posicion}` : ""}${t.estilo ? `, ${t.estilo}` : ", bold geometric sans-serif, high contrast"}. No other text`;
}

/** La referencia de estilo (slot opcional): se toma prestado el LOOK, no el sujeto. En
 *  imagen_libre la instrucción ya la nombra; en los demás jobs va como frase propia. */
function estiloPrestado(spec: PromptSpec, etiqueta: Etiquetador): string | null {
  if (spec.job === "imagen_libre") return null;
  const e = etiqueta(spec, "estilo");
  return e ? `Borrow only the visual style of ${e} (color grading, light quality, composition); its subject is not part of this image` : null;
}

/** Salida de Nano Banana: formato + resolución cuando el destino la pide (impresión y
 *  banners salen a 2K; lo demás a la resolución por default, más barato). */
function salidaNB(spec: PromptSpec): string {
  const alta = spec.destino === "print" || spec.destino === "web_banner";
  // "photorealistic" sólo si no hay estilo: con estilo, repetirlo contradice o sobra.
  // …ni en una corrección: el look es el de la imagen que salió (una ilustración sigue siéndolo).
  return `Output format: ${spec.aspect}${alta ? ", 2K resolution" : ""}${spec.estilo || spec.job === "correccion" ? "" : ", photorealistic"}`;
}

/** El cuerpo compartido de un prompt de imagen (Nano Banana y ChatGPT usan el mismo
 *  orden: instrucción → estilo prestado → igualar referencia → técnica → marca → texto →
 *  conservar → lo que se quiere EN LUGAR de lo que se evita → un "Avoid" corto).
 *  Las dos herramientas carecen de campo negativo: "no busy background" produce justo eso. */
export function cuerpoImagen(spec: PromptSpec, etiqueta: Etiquetador): (string | null)[] {
  const { positivos, sinMapear } = positivar(negativosDe(spec));
  return [
    instruccion(spec, etiqueta),
    estiloPrestado(spec, etiqueta),
    igualarADN(spec),
    tecnicos(spec),
    marca(spec),
    clausulaTexto(spec),
    // F5a: story / TikTok → lo importante en el centro (la app tapa arriba y abajo).
    zonaSeguraImagen(spec),
    spec.refs.length || spec.preservar.length ? `Keep unchanged: ${preservar(spec).join("; ")}` : null,
    // Hasta 3 positivos: más repiten la misma idea con otras palabras y engordan el prompt.
    positivos.length ? `Keep the frame: ${positivos.slice(0, 3).join("; ")}` : null,
    sinMapear.length ? `Avoid: ${sinMapear.slice(0, 3).join(", ")}` : null,
  ];
}

/** Cuántos "qué evitar" quedaron sin convertir a positivo (el diagnóstico lo enseña; así el
 *  mapa de positivo.ts crece con datos). */
export function negativosSinMapear(spec: PromptSpec): number {
  return positivar(negativosDe(spec)).sinMapear.length;
}

export function compilarNanoBanana(spec: PromptSpec): Salida {
  const texto = frases(...cuerpoImagen(spec, etiquetaNB), salidaNB(spec));
  return { texto, formato: "texto" };
}

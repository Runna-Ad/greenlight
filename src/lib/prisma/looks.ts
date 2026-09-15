/**
 * HÜE Prisma — los LOOKS del paso 2. Un look es una receta completa (luz + lente + ángulo +
 * ambiente + estilo, y movimiento en video) que el diseñador elige de un vistazo, con foto, en
 * vez de armar el look fila por fila. Las filas siguen debajo, plegadas ("Ajustar"), para quien
 * quiere cambiar una sola cosa. Los valores son frases técnicas EN INGLÉS (las que el writer
 * copia tal cual al spec); los nombres van en palabras de todos los días (Pedro, 2026-09-14).
 *
 * `lookSugerido` pre-elige uno SIN modelo: palabras de la idea, el ADN de la referencia y el
 * destino. `habitosDe` cuenta lo que una marca ya usó para subirlo al frente. Módulo puro.
 * Hoy viven en código (el golden test prueba que cada look compila válido en cada
 * herramienta); en la Fase 6 (Vigía) ganan tabla y edición en el Hub sobre esta misma forma.
 */
import type { Destino, JobType, VisualDNA } from "./spec.ts";
import type { Par } from "./copy.ts";

export type Familia = "producto" | "persona" | "libre" | "video" | "edicion";

export const FAMILIA_DE_JOB: Record<JobType, Familia> = {
  foto_producto: "producto",
  aplicar_logo: "producto",
  agregar_objeto: "producto",
  escena_persona: "persona",
  cambio_fondo: "persona",
  cambio_pose: "persona",
  cambio_outfit: "persona",
  dos_personajes: "persona",
  cambio_epoca: "persona",
  cambio_angulo: "persona",
  imagen_libre: "libre",
  restaurar_foto: "edicion",
  mejora_foto: "edicion",
  figura_coleccionable: "edicion",
  correccion: "edicion",
  animar_foto: "video",
  texto_a_video: "video",
  transicion: "video",
  escena_sora: "video",
};

/** Lo que un look fija. null = no toca esa fila (el writer decide). */
export type CamposLook = {
  luz: string | null;
  lente: string | null;
  angulo: string | null;
  mood: string | null;
  estilo: string | null;
  /** Sólo video. */
  movimiento: string | null;
};

export type Look = {
  id: string;
  nombre: Par;
  descripcion: Par;
  familias: Familia[];
  campos: CamposLook;
  /** Palabras (es/en, minúsculas) que en la idea o en el ADN apuntan a este look. */
  pistas: string[];
  /** Miniatura estática (public/). Se genera una vez con Nano Banana (scripts/looks-thumbs.mjs). */
  thumb: string;
  /** Degradado de respaldo (de → a) e ícono: la tarjeta se ve bien aunque la foto aún no exista. */
  tono: [string, string];
  icono: string;
};

const t = (es: string, en: string): Par => ({ es, en });
const c = (p: Partial<CamposLook>): CamposLook => ({ luz: null, lente: null, angulo: null, mood: null, estilo: null, movimiento: null, ...p });
const thumb = (id: string) => `/prisma/looks/${id}.jpg`;

/** Sin fila tocada: "como la foto" — el look de las ediciones y de animar una foto. */
export const LOOK_ORIGINAL_ID = "original";
/** ¿Ya existen las miniaturas en public/prisma/looks? Mientras no (se generan con
 *  scripts/looks-thumbs.mjs), la tarjeta enseña sólo su degradado e ícono — sin pedir 33 imágenes
 *  que no existen (33 errores 404 por visita). Se pone en true al subirlas. */
export const FOTOS_LISTAS = false;

export const LOOKS: Look[] = [
  // ── Producto ──
  { id: "lifestyle_en_uso", nombre: t("En uso, de todos los días", "In use, everyday"), descripcion: t("El producto en su contexto real, con luz de ventana.", "The product in its real context, window light."), familias: ["producto"], campos: c({ luz: "soft window light, gentle shadows", lente: "35mm, natural perspective", angulo: "eye level", mood: "warm, everyday, real", estilo: "photorealistic lifestyle photo" }), pistas: ["en uso", "using", "casa", "home", "mesa", "table", "cocina", "kitchen", "lifestyle", "mano", "hand", "cotidiano", "everyday"], thumb: thumb("lifestyle_en_uso"), tono: ["#f6e7d3", "#d9b892"], icono: "coffee" },
  { id: "packshot_limpio", nombre: t("Packshot limpio", "Clean packshot"), descripcion: t("Fondo blanco, sombra suave, todo enfocado. Para catálogo.", "White background, soft shadow, all sharp. For catalog."), familias: ["producto"], campos: c({ luz: "clean studio light, white background, soft shadow", lente: "85mm, everything sharp", angulo: "straight-on, frontal", mood: "clean, minimal, modern", estilo: "product advertising, glossy" }), pistas: ["fondo blanco", "white background", "packshot", "catálogo", "catalogo", "catalog", "limpio", "clean", "e-commerce", "tienda"], thumb: thumb("packshot_limpio"), tono: ["#ffffff", "#e5e7eb"], icono: "box" },
  { id: "bodegon_premium", nombre: t("Bodegón premium", "Premium still life"), descripcion: t("Luz de lado, sombras ricas, fondo desenfocado. Se ve caro.", "Side light, rich shadows, blurred background. Looks expensive."), familias: ["producto"], campos: c({ luz: "soft directional light from one side, rich shadows", lente: "85mm portrait lens, blurred background", angulo: "eye level", mood: "premium, calm, elegant", estilo: "luxury still-life photography" }), pistas: ["premium", "lujo", "luxury", "elegante", "elegant", "mármol", "marmol", "marble", "caro"], thumb: thumb("bodegon_premium"), tono: ["#3b2f2a", "#a67c52"], icono: "gem" },
  { id: "flat_lay", nombre: t("Desde arriba, ordenado", "Flat lay"), descripcion: t("Cenital, luz pareja, composición curada.", "Top-down, even light, curated arrangement."), familias: ["producto"], campos: c({ luz: "overcast daylight, even and soft", lente: "50mm, everything sharp", angulo: "top-down flat lay", mood: "clean, curated, calm", estilo: "editorial flat lay photography" }), pistas: ["flat lay", "desde arriba", "top-down", "top down", "cenital", "ordenado", "arranged"], thumb: thumb("flat_lay"), tono: ["#eef2f3", "#c9d3d8"], icono: "grid" },
  { id: "hero_sombra_dura", nombre: t("Sol duro, sombra larga", "Hard sun, long shadow"), descripcion: t("Contraste alto, gráfico, con presencia.", "High contrast, graphic, with presence."), familias: ["producto"], campos: c({ luz: "hard direct sunlight, sharp long shadows", lente: "50mm, everything sharp", angulo: "low angle, looking up", mood: "bold, confident, graphic", estilo: "high-contrast advertising photo" }), pistas: ["sol", "sun", "sombra dura", "hard shadow", "hero", "contraste", "contrast", "verano", "summer"], thumb: thumb("hero_sombra_dura"), tono: ["#f9d976", "#f39f86"], icono: "sun" },
  { id: "macro_textura", nombre: t("Muy de cerca, la textura", "Macro, the texture"), descripcion: t("Cada detalle del material, luz de lado.", "Every detail of the material, side light."), familias: ["producto"], campos: c({ luz: "dramatic side light, deep shadows, high contrast", lente: "100mm macro, extreme detail", angulo: "45-degree angle from above", mood: "premium, tactile", estilo: "macro product photography" }), pistas: ["textura", "texture", "macro", "detalle", "detail", "de cerca", "close-up", "closeup", "material"], thumb: thumb("macro_textura"), tono: ["#2b2b2b", "#6b6b6b"], icono: "zoom" },
  { id: "pop_color", nombre: t("Pop de color", "Color pop"), descripcion: t("Fondo de color, luz pareja, alegre.", "Colored background, even light, cheerful."), familias: ["producto", "libre"], campos: c({ luz: "bright even light, solid colored background", lente: "50mm, everything sharp", angulo: "straight-on, frontal", mood: "playful, colorful, pop", estilo: "colorful pop advertising photo" }), pistas: ["color", "pop", "divertido", "fun", "brillante", "bright", "alegre", "colorido", "colorful"], thumb: thumb("pop_color"), tono: ["#ff6b6b", "#ffd166"], icono: "sparkles" },
  { id: "render_3d", nombre: t("Render 3D limpio", "Clean 3D render"), descripcion: t("Hecho en 3D: superficies perfectas, reflejos suaves.", "Made in 3D: perfect surfaces, soft reflections."), familias: ["producto", "libre"], campos: c({ luz: "studio HDRI light, soft reflections", lente: "50mm, everything sharp", angulo: "45-degree angle from above", mood: "clean, futuristic", estilo: "3D render, clean" }), pistas: ["3d", "render", "cgi"], thumb: thumb("render_3d"), tono: ["#dbeafe", "#93c5fd"], icono: "layers" },

  // ── Persona ──
  { id: "documental_natural", nombre: t("Natural, sin posar", "Natural, candid"), descripcion: t("Luz de ventana, como lo ve el ojo, momento real.", "Window light, as the eye sees it, a real moment."), familias: ["persona"], campos: c({ luz: "soft window light, gentle shadows", lente: "35mm, natural perspective", angulo: "eye level", mood: "natural, candid, real", estilo: "documentary photography" }), pistas: ["natural", "documental", "documentary", "candid", "real", "espontáneo", "sin posar"], thumb: thumb("documental_natural"), tono: ["#f3efe6", "#cbbfa8"], icono: "camera" },
  { id: "retrato_estudio", nombre: t("Retrato de estudio", "Studio portrait"), descripcion: t("Fondo limpio, luz suave de frente, fondo desenfocado.", "Clean background, soft front light, blurred background."), familias: ["persona"], campos: c({ luz: "clean studio light, soft key from the front", lente: "85mm portrait lens, blurred background", angulo: "eye level", mood: "confident, clean", estilo: "studio portrait photography" }), pistas: ["estudio", "studio", "retrato", "portrait", "headshot", "fondo limpio"], thumb: thumb("retrato_estudio"), tono: ["#f5f5f5", "#d4d4d4"], icono: "aperture" },
  { id: "editorial_moda", nombre: t("Editorial de moda", "Fashion editorial"), descripcion: t("Flash directo, actitud, revista.", "Direct flash, attitude, magazine."), familias: ["persona"], campos: c({ luz: "hard direct flash, bright, sharp shadows", lente: "35mm, natural perspective", angulo: "slightly low angle", mood: "bold, fashion, editorial", estilo: "editorial fashion photography" }), pistas: ["moda", "fashion", "editorial", "outfit", "revista", "magazine", "look book", "lookbook"], thumb: thumb("editorial_moda"), tono: ["#111827", "#f9fafb"], icono: "shirt" },
  { id: "street_noche", nombre: t("Calle de noche, neón", "Night street, neon"), descripcion: t("Ciudad de noche, reflejos de color, energía.", "City at night, colored reflections, energy."), familias: ["persona", "libre"], campos: c({ luz: "neon signs, colored reflections, night", lente: "35mm, natural perspective", angulo: "eye level", mood: "urban, energetic, moody", estilo: "cinematic street photography" }), pistas: ["noche", "night", "neón", "neon", "calle", "street", "ciudad", "city", "urbano", "urban"], thumb: thumb("street_noche"), tono: ["#0f172a", "#e11d74"], icono: "moon" },
  { id: "atardecer_calido", nombre: t("Atardecer cálido", "Warm sunset"), descripcion: t("Sol bajo y dorado, sombras largas, fondo suave.", "Low golden sun, long shadows, soft background."), familias: ["persona", "libre"], campos: c({ luz: "golden hour, warm low sun, long shadows", lente: "85mm portrait lens, blurred background", angulo: "eye level", mood: "nostalgic, warm, intimate", estilo: "photorealistic photo" }), pistas: ["atardecer", "sunset", "golden", "dorado", "playa", "beach", "tarde", "cálido", "calido", "warm"], thumb: thumb("atardecer_calido"), tono: ["#f59e0b", "#7c2d12"], icono: "sunset" },
  { id: "cine_dramatico", nombre: t("De película, dramático", "Cinematic, dramatic"), descripcion: t("Luz de lado, sombras profundas, destellos de cine.", "Side light, deep shadows, movie flares."), familias: ["persona", "libre"], campos: c({ luz: "dramatic side light, deep shadows, high contrast", lente: "anamorphic, horizontal flares", angulo: "eye level", mood: "dramatic, epic, cinematic", estilo: "cinematic film still" }), pistas: ["cine", "cinematic", "dramático", "dramatic", "película", "pelicula", "film", "épico", "epico", "epic"], thumb: thumb("cine_dramatico"), tono: ["#1f2937", "#0ea5e9"], icono: "film" },
  { id: "vintage_grano", nombre: t("Vintage con grano", "Vintage with grain"), descripcion: t("Como foto analógica de otra década.", "Like an analog photo from another decade."), familias: ["persona", "libre"], campos: c({ luz: "overcast daylight, even and soft", lente: "50mm, film look", angulo: "eye level", mood: "nostalgic, warm", estilo: "vintage film photo, grain" }), pistas: ["vintage", "retro", "grano", "grain", "antiguo", "analógico", "analogico", "analog", "90s", "80s", "70s"], thumb: thumb("vintage_grano"), tono: ["#e7d8c3", "#8b6f47"], icono: "camera" },
  { id: "lifestyle_luminoso", nombre: t("Luminoso y alegre", "Bright and cheerful"), descripcion: t("Luz de día, aire, sonrisa.", "Daylight, air, a smile."), familias: ["persona"], campos: c({ luz: "bright airy daylight, soft", lente: "35mm, natural perspective", angulo: "eye level", mood: "energetic, fun, bright", estilo: "bright lifestyle photography" }), pistas: ["alegre", "feliz", "happy", "luminoso", "bright", "risa", "sonrisa", "smile", "familia", "family", "amigos", "friends"], thumb: thumb("lifestyle_luminoso"), tono: ["#fef3c7", "#bae6fd"], icono: "smile" },

  // ── Imagen libre ──
  { id: "foto_realista", nombre: t("Foto realista", "Photorealistic"), descripcion: t("Como una foto de verdad, luz natural.", "Like a real photo, natural light."), familias: ["libre"], campos: c({ luz: "soft natural daylight", lente: "50mm, natural perspective", angulo: "eye level", mood: "natural, believable", estilo: "photorealistic photo" }), pistas: ["foto", "photo", "realista", "realistic", "real"], thumb: thumb("foto_realista"), tono: ["#e5e7eb", "#9ca3af"], icono: "camera" },
  { id: "ilustracion_plana", nombre: t("Ilustración plana", "Flat illustration"), descripcion: t("Colores planos, formas simples, sin foto.", "Flat colors, simple shapes, not a photo."), familias: ["libre"], campos: c({ luz: "flat, even, no shadows", lente: null, angulo: "straight-on, frontal", mood: "friendly, simple", estilo: "illustration, flat colors" }), pistas: ["ilustración", "ilustracion", "illustration", "dibujo", "drawing", "flat", "vector", "caricatura", "cartoon"], thumb: thumb("ilustracion_plana"), tono: ["#a7f3d0", "#60a5fa"], icono: "palette" },
  { id: "poster_grafico", nombre: t("Cartel gráfico", "Graphic poster"), descripcion: t("Composición fuerte, pocos elementos, tipografía protagonista.", "Strong composition, few elements, typography leads."), familias: ["libre"], campos: c({ luz: "flat, even, graphic", lente: null, angulo: "straight-on, frontal", mood: "bold, punchy, modern", estilo: "bold graphic poster design" }), pistas: ["cartel", "poster", "afiche", "gráfico", "grafico", "graphic", "tipografía", "tipografia", "typography"], thumb: thumb("poster_grafico"), tono: ["#111111", "#f97316"], icono: "type" },
  { id: "acuarela", nombre: t("Acuarela", "Watercolor"), descripcion: t("Manchas suaves, papel, bordes que se funden.", "Soft washes, paper, bleeding edges."), familias: ["libre"], campos: c({ luz: "soft, diffuse", lente: null, angulo: "straight-on, frontal", mood: "gentle, artistic", estilo: "watercolor illustration on paper" }), pistas: ["acuarela", "watercolor", "pintura", "painting", "artístico", "artistico", "artistic"], thumb: thumb("acuarela"), tono: ["#fce7f3", "#a5b4fc"], icono: "droplets" },
  { id: "minimal_moderno", nombre: t("Minimalista y moderno", "Minimal and modern"), descripcion: t("Mucho aire, un solo elemento, luz limpia.", "Lots of air, a single element, clean light."), familias: ["libre"], campos: c({ luz: "clean studio light, soft shadow", lente: "50mm, everything sharp", angulo: "straight-on, frontal", mood: "clean, minimal, modern", estilo: "minimalist photography" }), pistas: ["minimal", "minimalista", "moderno", "modern", "simple", "aire", "limpio"], thumb: thumb("minimal_moderno"), tono: ["#fafafa", "#e4e4e7"], icono: "circle" },

  // ── Video ──
  { id: "sutil_como_la_foto", nombre: t("Sutil, como la foto", "Subtle, like the photo"), descripcion: t("Se mueve poco; la luz y el encuadre se quedan como en la imagen.", "Little motion; light and framing stay as in the image."), familias: ["video"], campos: c({ luz: "as in the reference", lente: null, angulo: null, movimiento: "slow dolly in", mood: "calm, natural", estilo: "cinematic video" }), pistas: ["sutil", "subtle", "poco", "respire", "breathe", "parpade", "blink", "como la foto"], thumb: thumb("sutil_como_la_foto"), tono: ["#e0e7ff", "#c7d2fe"], icono: "video" },
  { id: "comercial_producto", nombre: t("Comercial de producto", "Product commercial"), descripcion: t("Estudio limpio, acercamiento lento, premium.", "Clean studio, slow push in, premium."), familias: ["video"], campos: c({ luz: "clean studio light, soft shadow", lente: "85mm portrait lens, blurred background", angulo: "eye level", movimiento: "slow dolly in", mood: "premium, calm", estilo: "product commercial" }), pistas: ["comercial", "commercial", "producto", "product", "anuncio", "ad", "spot"], thumb: thumb("comercial_producto"), tono: ["#f8fafc", "#cbd5e1"], icono: "clapperboard" },
  { id: "celular_natural", nombre: t("Como de celular", "Phone-shot"), descripcion: t("Cámara en mano, luz de día, real. Para redes.", "Handheld, daylight, real. For social."), familias: ["video"], campos: c({ luz: "natural daylight", lente: "phone camera, wide", angulo: "eye level", movimiento: "handheld, natural shake", mood: "authentic, casual", estilo: "smartphone UGC video" }), pistas: ["celular", "phone", "ugc", "tiktok", "reel", "story", "en mano", "handheld", "casual"], thumb: thumb("celular_natural"), tono: ["#fde68a", "#fca5a5"], icono: "smartphone" },
  { id: "cine_video", nombre: t("De película", "Cinematic"), descripcion: t("Luz dramática, destellos, movimiento lento.", "Dramatic light, flares, slow move."), familias: ["video"], campos: c({ luz: "dramatic side light, deep shadows, high contrast", lente: "anamorphic, horizontal flares", angulo: "eye level", movimiento: "slow dolly in", mood: "dramatic, epic, cinematic", estilo: "cinematic video" }), pistas: ["cine", "cinematic", "trailer", "épico", "epico", "epic", "película", "pelicula", "dramático", "dramatic"], thumb: thumb("cine_video"), tono: ["#0b1220", "#38bdf8"], icono: "film" },
  { id: "dron_epico", nombre: t("Dron, paisaje", "Drone, landscape"), descripcion: t("Desde el aire, atardecer, todo se ve.", "From the air, sunset, wide open."), familias: ["video"], campos: c({ luz: "golden hour, warm low sun, long shadows", lente: "24mm wide angle, more of the scene", angulo: "high angle from above", movimiento: "aerial drone shot", mood: "epic, expansive", estilo: "aerial cinematic video" }), pistas: ["dron", "drone", "aéreo", "aereo", "aerial", "paisaje", "landscape", "desde arriba", "ciudad desde"], thumb: thumb("dron_epico"), tono: ["#fbbf24", "#1e3a8a"], icono: "plane" },
  { id: "asmr_macro", nombre: t("ASMR, muy de cerca", "ASMR, very close"), descripcion: t("Cámara fija, macro, texturas y sonido.", "Locked camera, macro, textures and sound."), familias: ["video"], campos: c({ luz: "soft directional light, gentle shadows", lente: "100mm macro, extreme detail", angulo: "45-degree angle from above", movimiento: "static tripod, locked", mood: "calm, tactile", estilo: "ASMR macro video" }), pistas: ["asmr", "macro", "textura", "texture", "de cerca", "close-up", "unboxing"], thumb: thumb("asmr_macro"), tono: ["#3f3f46", "#a1a1aa"], icono: "mic" },
  { id: "selfie_vlog", nombre: t("Selfie, hablando a cámara", "Selfie vlog"), descripcion: t("Cámara frontal, cerca, luz de ventana.", "Front camera, close, window light."), familias: ["video"], campos: c({ luz: "soft window light, gentle shadows", lente: "front phone camera, wide", angulo: "slightly above eye level", movimiento: "handheld selfie, natural shake", mood: "friendly, direct", estilo: "selfie vlog" }), pistas: ["selfie", "vlog", "hablando", "talking", "a cámara", "a camara", "to camera", "testimonio", "testimonial"], thumb: thumb("selfie_vlog"), tono: ["#fdf2f8", "#f9a8d4"], icono: "user" },
  { id: "retro_vhs", nombre: t("Retro VHS", "Retro VHS"), descripcion: t("Cámara vieja, colores lavados, nostalgia.", "Old camcorder, washed colors, nostalgia."), familias: ["video"], campos: c({ luz: "warm tungsten light, slightly overexposed", lente: "old camcorder, soft", angulo: "eye level", movimiento: "handheld, natural shake", mood: "nostalgic, warm", estilo: "old VHS home video" }), pistas: ["vhs", "retro", "viejo", "old", "nostalgia", "90s", "80s", "casero", "home video"], thumb: thumb("retro_vhs"), tono: ["#7c3aed", "#f59e0b"], icono: "tv" },

  // ── Edición ──
  { id: LOOK_ORIGINAL_ID, nombre: t("Como la foto original", "Like the original photo"), descripcion: t("No cambia la luz ni el estilo: sólo lo que pediste.", "Light and style stay: only what you asked changes."), familias: ["edicion", "persona", "producto"], campos: c({}), pistas: ["igual", "same", "original", "como está", "como esta", "no cambies", "keep"], thumb: thumb("original"), tono: ["#e5e7eb", "#f3f4f6"], icono: "circle" },
  { id: "natural_calido", nombre: t("Natural y cálido", "Natural and warm"), descripcion: t("Luz de ventana suave y colores cálidos.", "Soft window light and warm colors."), familias: ["edicion"], campos: c({ luz: "soft window light, gentle shadows", lente: null, angulo: null, mood: "warm, natural", estilo: "photorealistic photo" }), pistas: ["cálido", "calido", "warm", "natural", "suave", "soft"], thumb: thumb("natural_calido"), tono: ["#fde68a", "#fdba74"], icono: "sun" },
  { id: "editorial_limpio", nombre: t("Editorial limpio", "Clean editorial"), descripcion: t("Luz de estudio, colores neutros, nítido.", "Studio light, neutral colors, crisp."), familias: ["edicion"], campos: c({ luz: "clean studio light, soft shadow", lente: null, angulo: null, mood: "clean, minimal, modern", estilo: "editorial photography" }), pistas: ["editorial", "limpio", "clean", "estudio", "studio", "nítido", "nitido", "sharp"], thumb: thumb("editorial_limpio"), tono: ["#ffffff", "#d1d5db"], icono: "aperture" },
  { id: "cine_edicion", nombre: t("De película", "Cinematic"), descripcion: t("Contraste, sombras profundas, color de cine.", "Contrast, deep shadows, movie color."), familias: ["edicion"], campos: c({ luz: "dramatic side light, deep shadows, high contrast", lente: null, angulo: null, mood: "dramatic, cinematic", estilo: "cinematic film still" }), pistas: ["cine", "cinematic", "dramático", "dramatic", "película", "pelicula", "film"], thumb: thumb("cine_edicion"), tono: ["#111827", "#6b7280"], icono: "film" },
];

/** Los looks que se ofrecen para un trabajo, en su orden base. */
export function looksPara(job: JobType): Look[] {
  const familia = FAMILIA_DE_JOB[job];
  return LOOKS.filter((l) => l.familias.includes(familia));
}

export type LookElegido = { luz: string | null; movimiento: string | null; lente: string | null; angulo: string | null; mood: string | null; estilo: string | null };

/** Aplica un look sobre el look actual: pisa las filas que el look fija; las que deja en null se
 *  LIMPIAN también (el look es una receta completa, no un parche) salvo el movimiento fuera de video. */
export function aplicarLook(look: Look, video: boolean): LookElegido {
  const f = look.campos;
  return { luz: f.luz, lente: f.lente, angulo: f.angulo, mood: f.mood, estilo: f.estilo, movimiento: video ? f.movimiento : null };
}

/** Qué look corresponde EXACTAMENTE a las filas actuales (para marcar la tarjeta), o null si el
 *  diseñador ajustó algo a mano ("personalizado"). "Como la foto original" = todo vacío. */
export function lookActivo(actual: LookElegido, looks: Look[], video: boolean): string | null {
  for (const l of looks) {
    const f = aplicarLook(l, video);
    if (f.luz === actual.luz && f.lente === actual.lente && f.angulo === actual.angulo && f.mood === actual.mood && f.estilo === actual.estilo && f.movimiento === actual.movimiento) return l.id;
  }
  return null;
}

const normalizar = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Defaults por familia cuando nada en la idea ni en el ADN apunta a un look. */
const DEFAULT_POR_FAMILIA: Record<Familia, string> = { producto: "lifestyle_en_uso", persona: "documental_natural", libre: "foto_realista", video: "comercial_producto", edicion: LOOK_ORIGINAL_ID };
/** Animar una foto sin decir más: que se mueva poco y se quede como está. */
const DEFAULT_POR_JOB: Partial<Record<JobType, string>> = { animar_foto: "sutil_como_la_foto" };

/** Palabras del ADN de una referencia → pistas (mismo vocabulario que las pistas de los looks). */
const PISTAS_ADN: [RegExp, string][] = [
  [/neon|night/i, "neon"],
  [/golden|warm low sun|sunset/i, "golden"],
  [/window|soft natural/i, "natural"],
  [/studio|white background|seamless/i, "studio"],
  [/hard|direct flash|harsh/i, "hard shadow"],
  [/overcast|even light/i, "overcast"],
  [/grain|film/i, "grain"],
  [/dramatic|high contrast|deep shadows/i, "dramatic"],
  [/macro|extreme detail/i, "macro"],
];

/**
 * El look que H.Ü.E pre-elige, SIN modelo: +2 por cada pista en la idea, +1 por cada pista del
 * ADN de la referencia, +1 para "bodegón / editorial" cuando va a impresión. Empate → el primero
 * de la familia. Sin pistas → el default de la familia (o del trabajo). Devuelve también la
 * palabra que decidió, para decírselo al diseñador ("por «noche»").
 */
export function lookSugerido(p: { job: JobType; idea: string; dna: VisualDNA | null; destino: Destino | null }): { look: Look; porque: string | null } {
  const looks = looksPara(p.job);
  const idea = normalizar(p.idea);
  const adn = p.dna ? normalizar([p.dna.luz, p.dna.mood, p.dna.textura, p.dna.lente].join(" ")) : "";
  const pistasAdn = PISTAS_ADN.filter(([re]) => re.test(adn)).map(([, k]) => k);
  let mejor: { look: Look; puntos: number; porque: string | null } | null = null;
  for (const l of looks) {
    let puntos = 0;
    let porque: string | null = null;
    for (const pista of l.pistas) {
      const n = normalizar(pista);
      if (idea && new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(idea)) {
        puntos += 2;
        porque ??= pista;
      }
      if (pistasAdn.some((k) => n.includes(k) || k.includes(n))) puntos += 1;
    }
    if (p.destino === "print" && (l.id === "bodegon_premium" || l.id === "editorial_moda" || l.id === "poster_grafico")) puntos += 1;
    if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { look: l, puntos, porque };
  }
  if (mejor) return { look: mejor.look, porque: mejor.porque };
  const id = DEFAULT_POR_JOB[p.job] ?? DEFAULT_POR_FAMILIA[FAMILIA_DE_JOB[p.job]];
  return { look: looks.find((l) => l.id === id) ?? looks[0], porque: null };
}

/** Un spec guardado, reducido a sus filas de look (lo que data.ts trae de prisma_specs). */
export type FilaHabito = { luz: string | null; lente: string | null; angulo: string | null; mood: string | null; estilo: string | null; movimiento: string | null };

export type Habitos = {
  /** Ids de look que la marca ya usó ≥ 2 veces, del más usado al menos. */
  looks: string[];
  /** Los valores de cada fila que más repite (para subirlos al frente en "Ajustar"). */
  valores: Record<keyof FilaHabito, string[]>;
};

export const HABITO_MIN = 2;

/** Lo que una marca ya usó: cuenta looks exactos y valores por fila en sus specs recientes. */
export function habitosDe(filas: FilaHabito[], looks: Look[] = LOOKS): Habitos {
  const porLook = new Map<string, number>();
  const porValor: Record<keyof FilaHabito, Map<string, number>> = { luz: new Map(), lente: new Map(), angulo: new Map(), mood: new Map(), estilo: new Map(), movimiento: new Map() };
  for (const f of filas) {
    for (const k of Object.keys(porValor) as (keyof FilaHabito)[]) {
      const v = f[k]?.trim();
      if (v) porValor[k].set(v, (porValor[k].get(v) ?? 0) + 1);
    }
    const id = lookActivo({ luz: f.luz, lente: f.lente, angulo: f.angulo, mood: f.mood, estilo: f.estilo, movimiento: f.movimiento }, looks.filter((l) => l.id !== LOOK_ORIGINAL_ID), !!f.movimiento);
    if (id) porLook.set(id, (porLook.get(id) ?? 0) + 1);
  }
  const top = (m: Map<string, number>) => [...m.entries()].filter(([, n]) => n >= HABITO_MIN).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v]) => v);
  return {
    looks: [...porLook.entries()].filter(([, n]) => n >= HABITO_MIN).sort((a, b) => b[1] - a[1]).map(([id]) => id),
    valores: { luz: top(porValor.luz), lente: top(porValor.lente), angulo: top(porValor.angulo), mood: top(porValor.mood), estilo: top(porValor.estilo), movimiento: top(porValor.movimiento) },
  };
}

/** Los looks de un trabajo con los habituales de la marca al frente (orden estable en el resto). */
export function ordenarPorHabitos(looks: Look[], habitos: Habitos | null): Look[] {
  if (!habitos?.looks.length) return looks;
  const rango = (l: Look) => { const i = habitos.looks.indexOf(l.id); return i === -1 ? Number.MAX_SAFE_INTEGER : i; };
  return [...looks].sort((a, b) => rango(a) - rango(b));
}

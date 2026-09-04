/**
 * HÜE Prisma — copy de la interfaz en español e inglés. Diccionario LOCAL al módulo:
 * el resto de Greenlight es español a secas; aquí los diseñadores pueden alternar.
 * Las claves son estables; sólo cambia el texto. Módulo puro.
 */
import type { JobType, JobKind, RefRole, Destino, Tool } from "./spec.ts";
import { TOOL_INFO } from "./tools.ts";

export type Lang = "es" | "en";
export const LANGS: Lang[] = ["es", "en"];

type Par = { es: string; en: string };
const t = (es: string, en: string): Par => ({ es, en });

export const KIND_LABEL: Record<JobKind, Par> = {
  imagen: t("Crear imagen", "Create an image"),
  video: t("Crear video", "Create a video"),
  edicion: t("Editar imagen", "Edit an image"),
};

export const KIND_HINT: Record<JobKind, Par> = {
  imagen: t("Una foto nueva desde una idea o una referencia.", "A new photo from an idea or a reference."),
  video: t("Animar una foto, crear un clip o una transición.", "Animate a photo, create a clip or a transition."),
  edicion: t("Cambiar algo de una foto que ya tienes.", "Change something in a photo you already have."),
};

export const JOB_LABEL: Record<JobType, Par> = {
  foto_producto: t("Foto de producto", "Product photo"),
  escena_persona: t("Persona en otro lugar", "Person in a new place"),
  imagen_libre: t("Imagen desde cero", "Image from scratch"),
  cambio_outfit: t("Cambiar outfit", "Change outfit"),
  cambio_fondo: t("Cambiar fondo", "Change background"),
  cambio_pose: t("Cambiar pose", "Change pose"),
  agregar_objeto: t("Agregar un objeto", "Add an object"),
  cambio_angulo: t("Cambiar ángulo de cámara", "Change camera angle"),
  restaurar_foto: t("Restaurar foto antigua", "Restore old photo"),
  mejora_foto: t("Mejorar la foto", "Enhance photo"),
  aplicar_logo: t("Poner un logo (mockup)", "Apply a logo (mockup)"),
  dos_personajes: t("Dos personas en una escena", "Two people in one scene"),
  cambio_epoca: t("Cambiar de época", "Change era"),
  figura_coleccionable: t("Figura coleccionable", "Collectible figure"),
  animar_foto: t("Animar esta foto", "Animate this photo"),
  texto_a_video: t("Video desde una idea", "Video from an idea"),
  transicion: t("Transición entre dos tomas", "Transition between two shots"),
  escena_sora: t("Escena de 10–15 s (Sora)", "10–15 s scene (Sora)"),
};

export const JOB_HINT: Record<JobType, Par> = {
  foto_producto: t("Sube el producto; HÜE lo pone en un escenario publicitario.", "Upload the product; HÜE places it in an advertising setting."),
  escena_persona: t("Sube a la persona; describe dónde y haciendo qué.", "Upload the person; describe where and doing what."),
  imagen_libre: t("Describe la imagen. Una referencia de estilo es opcional.", "Describe the image. A style reference is optional."),
  cambio_outfit: t("Foto de la persona + foto del outfit.", "Photo of the person + photo of the outfit."),
  cambio_fondo: t("Foto de la persona; describe el fondo nuevo.", "Photo of the person; describe the new background."),
  cambio_pose: t("Foto de la persona + foto de la pose.", "Photo of the person + photo of the pose."),
  agregar_objeto: t("Foto de la escena + foto del objeto.", "Photo of the scene + photo of the object."),
  cambio_angulo: t("Una foto; elige el ángulo nuevo.", "One photo; pick the new angle."),
  restaurar_foto: t("Una foto vieja o dañada.", "An old or damaged photo."),
  mejora_foto: t("Una foto; di qué mejorar o deja que HÜE decida.", "One photo; say what to improve or let HÜE decide."),
  aplicar_logo: t("Foto del producto o superficie + el logo.", "Photo of the product or surface + the logo."),
  dos_personajes: t("Dos fotos; describe la escena. Pose opcional.", "Two photos; describe the scene. Pose optional."),
  cambio_epoca: t("Una foto; di la época (años 20, 80s…).", "One photo; name the era (1920s, 80s…)."),
  figura_coleccionable: t("Foto de la persona; empaque opcional.", "Photo of the person; packaging optional."),
  animar_foto: t("Una foto; di qué se mueve.", "One photo; say what moves."),
  texto_a_video: t("Sin fotos: describe el clip.", "No photos: describe the clip."),
  transicion: t("Foto de inicio + foto de fin.", "Start photo + end photo."),
  escena_sora: t("Una escena con tipo de video y duración.", "A scene with a video type and duration."),
};

export const REF_LABEL: Record<RefRole, Par> = {
  sujeto: t("La persona", "The person"),
  producto: t("El producto", "The product"),
  outfit: t("El outfit", "The outfit"),
  pose: t("La pose", "The pose"),
  escena: t("La escena", "The scene"),
  objeto: t("El objeto", "The object"),
  logo: t("El logo", "The logo"),
  estilo: t("Referencia de estilo", "Style reference"),
  empaque: t("El empaque", "The packaging"),
  personaje2: t("La segunda persona", "The second person"),
  inicio: t("Toma de inicio", "Start shot"),
  fin: t("Toma de fin", "End shot"),
};

export const DESTINO_LABEL: Record<Destino, Par> = {
  ig_story: t("Instagram Story / Reel (9:16)", "Instagram Story / Reel (9:16)"),
  ig_feed: t("Instagram feed (4:5)", "Instagram feed (4:5)"),
  tiktok: t("TikTok (9:16)", "TikTok (9:16)"),
  fb_ad: t("Anuncio Facebook (1:1)", "Facebook ad (1:1)"),
  yt: t("YouTube (16:9)", "YouTube (16:9)"),
  web_banner: t("Banner web (16:9)", "Web banner (16:9)"),
  print: t("Impreso (4:3)", "Print (4:3)"),
  libre: t("Libre (16:9)", "Free (16:9)"),
};

/** Los nombres de herramienta viven en TOOL_INFO (una sola fuente); aquí sólo se
 *  envuelven como Par para que la UI los pida igual que el resto del copy. */
export const TOOL_LABEL: Record<Tool, Par> = Object.fromEntries(
  (Object.keys(TOOL_INFO) as Tool[]).map((k) => [k, t(TOOL_INFO[k].nombre, TOOL_INFO[k].nombre)]),
) as Record<Tool, Par>;

/** Textos sueltos de la interfaz. */
export const UI = {
  titulo: t("HÜE Prisma", "HÜE Prisma"),
  tagline: t("Una idea. Todos los prompts.", "One idea. Every prompt."),
  queQuieres: t("¿Qué quieres hacer?", "What do you want to make?"),
  paso1: t("Tu idea y tus referencias", "Your idea and references"),
  paso2: t("El look", "The look"),
  paso3: t("¿Dónde va?", "Where is it going?"),
  ideaLabel: t("Cuéntalo con tus palabras", "Say it in your own words"),
  ideaPlaceholder: t("Ej: la modelo con el abrigo negro caminando por un mercado de noche, luz cálida…", "e.g. the model in the black coat walking through a night market, warm light…"),
  subirRef: t("Arrastra o elige una imagen", "Drag or choose an image"),
  quitar: t("Quitar", "Remove"),
  siguiente: t("Siguiente", "Next"),
  atras: t("Atrás", "Back"),
  generar: t("Generar prompt", "Generate prompt"),
  generando: t("HÜE está escribiendo…", "HÜE is writing…"),
  copiar: t("Copiar", "Copy"),
  copiado: t("Copiado", "Copied"),
  abrirEn: t("Abrir en", "Open in"),
  explicar: t("Explícame este prompt", "Explain this prompt"),
  ocultarExplicacion: t("Ocultar explicación", "Hide explanation"),
  refinar: t("¿Quieres cambiar algo?", "Want to change something?"),
  refinarPlaceholder: t("Ej: que sea de día, más cerca del rostro…", "e.g. make it daytime, closer to the face…"),
  aplicarCambio: t("Aplicar cambio", "Apply change"),
  variantes: t("Variantes", "Variants"),
  varBase: t("Base", "Base"),
  varSegura: t("Segura", "Safe"),
  varAudaz: t("Audaz", "Bold"),
  varMinima: t("Mínima", "Minimal"),
  herramienta: t("Herramienta", "Tool"),
  porque: t("¿Por qué esta?", "Why this one?"),
  cambiarHerramienta: t("Usar otra herramienta", "Use another tool"),
  dialogo: t("¿Alguien habla?", "Does anyone speak?"),
  idiomaDialogo: t("Idioma del diálogo", "Dialogue language"),
  pasoDe: t("Paso", "Step"),
  de: t("de", "of"),
  dialogoPlaceholder: t("Lo que dice, tal cual (se conserva en su idioma)", "What they say, verbatim (kept in its language)"),
  duracion: t("Duración", "Duration"),
  tipoVideo: t("Tipo de video", "Video type"),
  marca: t("Marca", "Brand"),
  sinMarca: t("Sin marca", "No brand"),
  historial: t("Historial", "History"),
  sinHistorial: t("Todavía no hay prompts. El primero se guarda aquí.", "No prompts yet. The first one lands here."),
  guardado: t("Guardado", "Saved"),
  error: t("Algo salió mal. Intenta de nuevo.", "Something went wrong. Try again."),
  luz: t("Luz", "Light"),
  camara: t("Cámara", "Camera"),
  mood: t("Ambiente", "Mood"),
  estilo: t("Estilo", "Style"),
  sugeridoDeTusRefs: t("Sugerido desde tus referencias", "Suggested from your references"),
  gustó: t("Me sirvió", "This worked"),
  noGustó: t("No me sirvió", "Didn't work"),
  generarEnApp: t("Generar aquí (pronto)", "Generate here (soon)"),
  validado: t("Verificado para la herramienta", "Checked for the tool"),
  conObservaciones: t("Con observaciones", "With notes"),
} satisfies Record<string, Par>;

export type UiKey = keyof typeof UI;

/** Devuelve el texto en el idioma pedido. */
export const tx = (par: Par, lang: Lang): string => par[lang];

/** Opciones visuales del paso 2 ("el look"). Etiquetas llanas; el valor que va al
 *  spec es la frase técnica EN INGLÉS que los modelos entienden. */
export type Swatch = { valor: string; label: Par };

export const SWATCHES_LUZ: Swatch[] = [
  { valor: "soft window light, gentle shadows", label: t("Luz de ventana suave", "Soft window light") },
  { valor: "golden hour, warm low sun, long shadows", label: t("Atardecer dorado", "Golden hour") },
  { valor: "clean studio light, white background, soft shadow", label: t("Estudio limpio", "Clean studio") },
  { valor: "hard direct flash, bright, sharp shadows", label: t("Flash directo", "Direct flash") },
  { valor: "neon signs, colored reflections, night", label: t("Neón de noche", "Neon at night") },
  { valor: "dramatic side light, deep shadows, high contrast", label: t("Dramática de lado", "Dramatic side light") },
  { valor: "overcast daylight, even and soft", label: t("Día nublado", "Overcast day") },
  { valor: "candlelight, warm and dim", label: t("Velas", "Candlelight") },
];

export const SWATCHES_CAMARA: Swatch[] = [
  { valor: "slow dolly in", label: t("Acercarse despacio", "Slow push in") },
  { valor: "slow dolly out", label: t("Alejarse despacio", "Slow pull out") },
  { valor: "orbit around the subject", label: t("Girar alrededor", "Orbit around") },
  { valor: "handheld, natural shake", label: t("Cámara en mano", "Handheld") },
  { valor: "static tripod, locked", label: t("Fija", "Static") },
  { valor: "crane up revealing the scene", label: t("Subir y revelar", "Crane up reveal") },
  { valor: "tracking shot following from behind", label: t("Seguir por detrás", "Follow from behind") },
  { valor: "aerial drone shot", label: t("Dron", "Drone") },
];

export const SWATCHES_LENTE: Swatch[] = [
  { valor: "85mm portrait lens, blurred background", label: t("Retrato, fondo borroso", "Portrait, blurred background") },
  { valor: "35mm, natural perspective", label: t("Natural", "Natural") },
  { valor: "24mm wide angle, more of the scene", label: t("Gran angular", "Wide angle") },
  { valor: "100mm macro, extreme detail", label: t("Macro, mucho detalle", "Macro, extreme detail") },
  { valor: "anamorphic, horizontal flares", label: t("Cine anamórfico", "Anamorphic cinema") },
];

export const SWATCHES_MOOD: Swatch[] = [
  { valor: "premium, calm, elegant", label: t("Premium y calmado", "Premium and calm") },
  { valor: "energetic, fun, bright", label: t("Energético y alegre", "Energetic and fun") },
  { valor: "nostalgic, warm, intimate", label: t("Nostálgico e íntimo", "Nostalgic and intimate") },
  { valor: "dramatic, epic, cinematic", label: t("Épico y cinematográfico", "Epic and cinematic") },
  { valor: "clean, minimal, modern", label: t("Minimalista y moderno", "Minimal and modern") },
  { valor: "playful, colorful, pop", label: t("Colorido y pop", "Colorful and pop") },
  { valor: "mysterious, dark, moody", label: t("Misterioso y oscuro", "Mysterious and dark") },
];

export const SWATCHES_ESTILO: Swatch[] = [
  { valor: "photorealistic photo", label: t("Foto realista", "Photorealistic") },
  { valor: "cinematic film still", label: t("Fotograma de cine", "Cinematic film still") },
  { valor: "editorial fashion photography", label: t("Editorial de moda", "Editorial fashion") },
  { valor: "product advertising, glossy", label: t("Publicidad de producto", "Product advertising") },
  { valor: "vintage film photo, grain", label: t("Foto vintage con grano", "Vintage film, grain") },
  { valor: "3D render, clean", label: t("Render 3D", "3D render") },
  { valor: "illustration, flat colors", label: t("Ilustración plana", "Flat illustration") },
];

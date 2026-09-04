/**
 * HÜE Prisma — copy de la interfaz en español e inglés. Diccionario LOCAL al módulo:
 * el resto de Greenlight es español a secas; aquí los diseñadores pueden alternar.
 * Las claves son estables; sólo cambia el texto. Módulo puro.
 */
import type { JobType, JobKind, RefRole, Destino, Tool } from "./spec.ts";
import { TOOL_INFO } from "./tools.ts";

export type Lang = "es" | "en";
export const LANGS: Lang[] = ["es", "en"];

export type Par = { es: string; en: string };
export const t = (es: string, en: string): Par => ({ es, en });

export const KIND_LABEL: Record<JobKind, Par> = {
  imagen: t("Crear imagen", "Create an image"),
  video: t("Crear video", "Create a video"),
  edicion: t("Editar una foto", "Edit a photo"),
};

export const KIND_HINT: Record<JobKind, Par> = {
  imagen: t("Una imagen nueva a partir de tu idea o de una referencia.", "A new image from your idea or a reference."),
  video: t("Darle movimiento a una foto, hacer un clip o una transición.", "Animate a photo, make a clip or a transition."),
  edicion: t("Cambiarle algo a una foto que ya tienes.", "Change something in a photo you already have."),
};

export const JOB_LABEL: Record<JobType, Par> = {
  foto_producto: t("Foto de producto", "Product photo"),
  escena_persona: t("Poner a alguien en otro lugar", "Put someone in a new place"),
  imagen_libre: t("Imagen desde cero", "Image from scratch"),
  cambio_outfit: t("Cambiar el outfit", "Change the outfit"),
  cambio_fondo: t("Cambiar el fondo", "Change the background"),
  cambio_pose: t("Cambiar la pose", "Change the pose"),
  agregar_objeto: t("Agregar un objeto", "Add an object"),
  cambio_angulo: t("Cambiar el ángulo de cámara", "Change the camera angle"),
  restaurar_foto: t("Restaurar una foto vieja", "Restore an old photo"),
  mejora_foto: t("Mejorar la foto", "Enhance photo"),
  aplicar_logo: t("Ponerle un logo (mockup)", "Apply a logo (mockup)"),
  dos_personajes: t("Juntar a dos personas en una escena", "Put two people in one scene"),
  cambio_epoca: t("Cambiar de época", "Change era"),
  figura_coleccionable: t("Convertir en figura coleccionable", "Turn into a collectible figure"),
  animar_foto: t("Darle movimiento a una foto", "Animate a photo"),
  texto_a_video: t("Video a partir de una idea", "Video from an idea"),
  transicion: t("Transición entre dos tomas", "Transition between two shots"),
  escena_sora: t("Escena de 10 a 15 segundos (Sora)", "10 to 15 second scene (Sora)"),
};

export const JOB_HINT: Record<JobType, Par> = {
  foto_producto: t("Sube la foto del producto y HÜE lo mete en un escenario de anuncio.", "Upload the product photo and HÜE places it in an ad setting."),
  escena_persona: t("Sube la foto de la persona y cuéntanos dónde está y qué hace.", "Upload the person and tell us where they are and what they do."),
  imagen_libre: t("Describe lo que quieres ver. Si tienes una referencia de estilo, súbela.", "Describe what you want to see. Upload a style reference if you have one."),
  cambio_outfit: t("Una foto de la persona y otra del outfit.", "One photo of the person and one of the outfit."),
  cambio_fondo: t("Una foto de la persona y dinos cómo es el fondo nuevo.", "One photo of the person and a description of the new background."),
  cambio_pose: t("Una foto de la persona y otra con la pose.", "One photo of the person and one with the pose."),
  agregar_objeto: t("Una foto de la escena y otra del objeto.", "One photo of the scene and one of the object."),
  cambio_angulo: t("Una foto y el ángulo desde el que la quieres ver.", "One photo and the angle you want to see it from."),
  restaurar_foto: t("Una foto vieja o maltratada. HÜE la limpia y le pone color.", "An old or damaged photo. HÜE cleans it up and adds color."),
  mejora_foto: t("Una foto. Dinos qué mejorar o deja que HÜE lo decida.", "One photo. Tell us what to improve or let HÜE decide."),
  aplicar_logo: t("Una foto del producto o la superficie, y el logo.", "One photo of the product or surface, plus the logo."),
  dos_personajes: t("Dos fotos y cuéntanos la escena. La pose es opcional.", "Two photos and a description of the scene. Pose optional."),
  cambio_epoca: t("Una foto y la época a la que la quieres llevar (los 20, los 80…).", "One photo and the era you want to take it to (the 20s, the 80s…)."),
  figura_coleccionable: t("Una foto de la persona. Si quieres, también una del empaque.", "One photo of the person. Optionally, one of the packaging."),
  animar_foto: t("Una foto y qué quieres que se mueva.", "One photo and what you want to move."),
  texto_a_video: t("Sin fotos. Solo describe el clip.", "No photos. Just describe the clip."),
  transicion: t("La toma con la que empieza y la toma con la que termina.", "The shot it starts on and the shot it ends on."),
  escena_sora: t("Una escena completa: tipo de video y duración.", "A full scene: video type and duration."),
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
  personaje2: t("La otra persona", "The other person"),
  inicio: t("Toma inicial", "Start shot"),
  fin: t("Toma final", "End shot"),
};

export const DESTINO_LABEL: Record<Destino, Par> = {
  ig_story: t("Instagram Story / Reel (9:16)", "Instagram Story / Reel (9:16)"),
  ig_feed: t("Instagram feed (4:5)", "Instagram feed (4:5)"),
  tiktok: t("TikTok (9:16)", "TikTok (9:16)"),
  fb_ad: t("Anuncio de Facebook (1:1)", "Facebook ad (1:1)"),
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
  paso3: t("¿Dónde se va a publicar?", "Where will it be published?"),
  ideaLabel: t("Cuéntanos tu idea con tus palabras", "Tell us your idea in your own words"),
  ideaPlaceholder: t("Ej.: la modelo del abrigo negro caminando por un mercado de noche, con luz cálida…", "e.g. the model in the black coat walking through a night market, warm light…"),
  textoLabel: t("¿Lleva texto la pieza?", "Should the piece include text?"),
  textoPlaceholder: t("Opcional. Escribe las palabras exactas, ej.: Hasta 20% de cashback", "Optional. Type the exact words, e.g. Up to 20% cashback"),
  textoAyuda: t("Se pinta tal cual, letra por letra. Si no pones nada, la imagen sale sin texto.", "Rendered exactly as written, letter by letter. Leave it empty for no text."),
  subirRef: t("Arrastra una imagen o búscala en tu compu", "Drag an image here or browse your files"),
  quitar: t("Quitar", "Remove"),
  siguiente: t("Siguiente", "Next"),
  atras: t("Regresar", "Back"),
  generar: t("Generar prompt", "Generate prompt"),
  generando: t("HÜE está escribiendo…", "HÜE is writing…"),
  copiar: t("Copiar", "Copy"),
  copiado: t("Copiado", "Copied"),
  abrirEn: t("Abrir en", "Open in"),
  explicar: t("Explícame este prompt", "Explain this prompt"),
  ocultarExplicacion: t("Ocultar explicación", "Hide explanation"),
  refinar: t("¿Le cambiamos algo?", "Want to change something?"),
  refinarPlaceholder: t("Ej.: que sea de día, más cerca de la cara…", "e.g. make it daytime, closer to the face…"),
  aplicarCambio: t("Aplicar el cambio", "Apply the change"),
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
  dialogoPlaceholder: t("Escribe lo que dice, tal cual. Se queda en el idioma en que lo escribas.", "Write what they say, word for word. It stays in the language you write it in."),
  duracion: t("Duración", "Duration"),
  tipoVideo: t("Tipo de video", "Video type"),
  marca: t("Marca", "Brand"),
  sinMarca: t("Sin marca", "No brand"),
  historial: t("Historial", "History"),
  sinHistorial: t("Aún no tienes prompts. Cuando generes el primero, aquí lo vas a encontrar.", "No prompts yet. When you generate the first one, you will find it here."),
  guardado: t("Guardado", "Saved"),
  error: t("Algo falló. Inténtalo otra vez.", "Something went wrong. Try again."),
  luz: t("Luz", "Light"),
  camara: t("Cámara", "Camera"),
  mood: t("Ambiente", "Mood"),
  estilo: t("Estilo", "Style"),
  sugeridoDeTusRefs: t("Lo que HÜE vio en tu referencia", "What HÜE saw in your reference"),
  gustó: t("Me sirvió", "This worked"),
  noGustó: t("No me sirvió", "Didn't work"),
  generarEnApp: t("Pronto: generar la imagen aquí mismo", "Coming soon: generate the image right here"),
  validado: t("Listo para pegar en la herramienta", "Ready to paste into the tool"),
  conObservaciones: t("Con detalles por revisar", "Has details to review"),
} satisfies Record<string, Par>;

export type UiKey = keyof typeof UI;

/** Lo que dice el botón mientras H.Ü.E trabaja (rota cada ~1.8 s): progreso legible,
 *  no un spinner mudo. Son etapas reales del writer, en orden aproximado. */
export const MENSAJES_GENERANDO: Par[] = [
  t("Leyendo tus referencias…", "Reading your references…"),
  t("Eligiendo la luz y la cámara…", "Choosing light and camera…"),
  t("Escribiendo el prompt…", "Writing the prompt…"),
  t("Revisando que le sirva a la herramienta…", "Checking it fits the tool…"),
];

/** Devuelve el texto en el idioma pedido. */
export const tx = (par: Par, lang: Lang): string => par[lang];

/** Opciones visuales del paso 2 ("el look"). Etiquetas llanas; el valor que va al
 *  spec es la frase técnica EN INGLÉS que los modelos entienden. */
export type Swatch = { valor: string; label: Par };

export const SWATCHES_LUZ: Swatch[] = [
  { valor: "soft window light, gentle shadows", label: t("Luz de ventana suave", "Soft window light") },
  { valor: "golden hour, warm low sun, long shadows", label: t("Atardecer dorado", "Golden hour") },
  { valor: "clean studio light, white background, soft shadow", label: t("Estudio, fondo limpio", "Clean studio") },
  { valor: "hard direct flash, bright, sharp shadows", label: t("Flash directo", "Direct flash") },
  { valor: "neon signs, colored reflections, night", label: t("Neón de noche", "Neon at night") },
  { valor: "dramatic side light, deep shadows, high contrast", label: t("Luz dramática de lado", "Dramatic side light") },
  { valor: "overcast daylight, even and soft", label: t("Día nublado", "Overcast day") },
  { valor: "candlelight, warm and dim", label: t("Luz de velas", "Candlelight") },
];

export const SWATCHES_CAMARA: Swatch[] = [
  { valor: "slow dolly in", label: t("Acercarse despacio", "Slow push in") },
  { valor: "slow dolly out", label: t("Alejarse despacio", "Slow pull out") },
  { valor: "orbit around the subject", label: t("Dar la vuelta alrededor", "Orbit around") },
  { valor: "handheld, natural shake", label: t("Cámara en mano", "Handheld") },
  { valor: "static tripod, locked", label: t("Fija", "Static") },
  { valor: "crane up revealing the scene", label: t("Subir y descubrir la escena", "Crane up reveal") },
  { valor: "tracking shot following from behind", label: t("Seguir por detrás", "Follow from behind") },
  { valor: "aerial drone shot", label: t("Dron", "Drone") },
];

export const SWATCHES_LENTE: Swatch[] = [
  { valor: "85mm portrait lens, blurred background", label: t("Retrato con fondo desenfocado", "Portrait, blurred background") },
  { valor: "35mm, natural perspective", label: t("Natural", "Natural") },
  { valor: "24mm wide angle, more of the scene", label: t("Gran angular", "Wide angle") },
  { valor: "100mm macro, extreme detail", label: t("Macro, muchísimo detalle", "Macro, extreme detail") },
  { valor: "anamorphic, horizontal flares", label: t("Cine anamórfico", "Anamorphic cinema") },
];

export const SWATCHES_MOOD: Swatch[] = [
  { valor: "premium, calm, elegant", label: t("Premium y tranquilo", "Premium and calm") },
  { valor: "energetic, fun, bright", label: t("Energético y alegre", "Energetic and fun") },
  { valor: "nostalgic, warm, intimate", label: t("Nostálgico e íntimo", "Nostalgic and intimate") },
  { valor: "dramatic, epic, cinematic", label: t("Épico, de película", "Epic, cinematic") },
  { valor: "clean, minimal, modern", label: t("Minimalista y moderno", "Minimal and modern") },
  { valor: "playful, colorful, pop", label: t("Colorido y pop", "Colorful and pop") },
  { valor: "mysterious, dark, moody", label: t("Misterioso y oscuro", "Mysterious and dark") },
];

export const SWATCHES_ESTILO: Swatch[] = [
  { valor: "photorealistic photo", label: t("Foto realista", "Photorealistic") },
  { valor: "cinematic film still", label: t("Frame de película", "Cinematic film still") },
  { valor: "editorial fashion photography", label: t("Editorial de moda", "Editorial fashion") },
  { valor: "product advertising, glossy", label: t("Foto publicitaria de producto", "Product advertising") },
  { valor: "vintage film photo, grain", label: t("Foto vintage con grano", "Vintage film, grain") },
  { valor: "3D render, clean", label: t("Render 3D", "3D render") },
  { valor: "illustration, flat colors", label: t("Ilustración plana", "Flat illustration") },
];

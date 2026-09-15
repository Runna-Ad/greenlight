/**
 * HÜE Prisma — copy de la interfaz en español e inglés. Diccionario LOCAL al módulo:
 * el resto de Greenlight es español a secas; aquí los diseñadores pueden alternar.
 * Las claves son estables; sólo cambia el texto. Módulo puro.
 */
import type { ReglaNivel } from "./reglas.ts";
import type { PrismaVariante } from "../database.types.ts";
import type { JobType, JobKind, RefRole, Destino, Tool } from "./spec.ts";
import type { CampoVeredicto } from "./resultado.ts";
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
  correccion: t("Corrección de un resultado", "Correction of a result"),
  animar_foto: t("Darle movimiento a una foto", "Animate a photo"),
  texto_a_video: t("Video a partir de una idea", "Video from an idea"),
  transicion: t("Transición entre dos tomas", "Transition between two shots"),
  escena_sora: t("Escena por bloques de tiempo", "Timed-beat scene"),
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
  correccion: t("Edita lo que salió de la herramienta: arregla lo que falló y deja todo lo demás igual.", "Edits what came out of the tool: fixes what failed and leaves everything else the same."),
  animar_foto: t("Una foto y qué quieres que se mueva.", "One photo and what you want to move."),
  texto_a_video: t("Sin fotos. Solo describe el clip.", "No photos. Just describe the clip."),
  transicion: t("La toma con la que empieza y la toma con la que termina.", "The shot it starts on and the shot it ends on."),
  escena_sora: t("Una escena completa: tipo de video, duración y sonido.", "A full scene: video type, duration and sound."),
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
  resultado: t("Lo que salió", "The result"),
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
  pedirSegura: t("Más segura", "Safer"),
  pedirAudaz: t("Más audaz", "Bolder"),
  pedirMinima: t("Mínima", "Minimal"),
  otraVersion: t("¿Otra versión?", "Another version?"),
  otraVersionAyuda: t("Una llamada más a HÜE, sólo si la pides. Lo que elijas le enseña qué prefiere esta marca.", "One more call to HÜE, only when you ask. What you pick teaches it what this brand prefers."),
  version: t("Versión", "Version"),
  aprendioDe: t("HÜE se apoyó en {n} prompts que ya sirvieron para esta marca.", "HÜE drew on {n} prompts that already worked for this brand."),
  aprendioPref: t("HÜE tomó en cuenta lo que los diseñadores de esta marca suelen pedir.", "HÜE took into account what this brand's designers usually ask for."),
  herramienta: t("Herramienta", "Tool"),
  porque: t("¿Por qué esta?", "Why this one?"),
  cambiarHerramienta: t("Usar otra herramienta", "Use another tool"),
  dialogo: t("¿Alguien habla?", "Does anyone speak?"),
  idiomaDialogo: t("Idioma del diálogo", "Dialogue language"),
  pasoDe: t("Paso", "Step"),
  de: t("de", "of"),
  dialogoPlaceholder: t("Escribe lo que dice, tal cual. Se queda en el idioma en que lo escribas.", "Write what they say, word for word. It stays in the language you write it in."),
  duracion: t("Duración", "Duration"),
  duracionConRefs: t("Con imágenes de referencia, Veo sólo genera 8 s.", "With reference images, Veo only generates 8 s."),
  tipoVideo: t("Tipo de video", "Video type"),
  usaloEn: t("Úsalo en", "Use it in"),
  entrevistaTitulo: t("Unas preguntas rápidas", "A few quick questions"),
  entrevistaIntro: t("H.Ü.E tiene {n} pregunta(s) para afinar el prompt. Puedes saltarlas.", "H.Ü.E has {n} question(s) to sharpen the prompt. You can skip them."),
  entrevistando: t("H.Ü.E está viendo qué le falta…", "H.Ü.E is checking what is missing…"),
  saltar: t("Saltar", "Skip"),
  seguirConRespuestas: t("Seguir con {n} respuesta(s)", "Continue with {n} answer(s)"),
  sinPreguntas: t("Sin preguntas, sorpréndeme (en este navegador)", "No questions, surprise me (on this browser)"),
  conPreguntas: t("Volver a activar las preguntas de H.Ü.E", "Turn H.Ü.E's questions back on"),
  sinPreguntasEstaVez: t("H.Ü.E no necesitó preguntar nada: la idea ya lo dice.", "H.Ü.E did not need to ask anything: the idea already says it."),
  entrevistaFallo: t("H.Ü.E no pudo preguntar esta vez; seguimos sin preguntas.", "H.Ü.E could not ask this time; moving on without questions."),
  profundizar: t("Profundizar (3 más)", "Go deeper (3 more)"),
  profundizando: t("H.Ü.E piensa más preguntas…", "H.Ü.E is thinking of more questions…"),
  entrevistaIntroRonda: t("Ronda {n} de {m}: H.Ü.E afina más. Todas son opcionales.", "Round {n} of {m}: H.Ü.E digs deeper. All optional."),
  yaContestaste: t("Ya contestaste:", "Already answered:"),
  yaTieneTodo: t("H.Ü.E ya tiene lo que necesita: sigue cuando quieras.", "H.Ü.E has what it needs: continue whenever you like."),
  profundizarFallo: t("H.Ü.E no pudo profundizar esta vez; sigue con lo que ya contestaste.", "H.Ü.E could not go deeper this time; continue with what you answered."),
  avisosTitulo: t("Antes de generar", "Before generating"),
  avisosResultado: t("Lo que conviene revisar", "Worth checking"),
  arreglarlo: t("Arreglarlo", "Fix it"),
  arreglarConHue: t("Arreglarlo con H.Ü.E", "Fix it with H.Ü.E"),
  queHueLoArregle: t("Que H.Ü.E lo arregle", "Let H.Ü.E fix it"),
  hueLoArreglara: t("H.Ü.E lo arreglará al generar", "H.Ü.E will fix it when generating"),
  entendido: t("Entendido", "Got it"),
  avisosOcultos: t("Mostrar {n} aviso(s) ocultos", "Show {n} hidden warning(s)"),
  fuenteOficial: t("fuente oficial", "official source"),
  fuenteComunidad: t("fuente de la comunidad", "community source"),
  bloqueadoPor: t("No se puede generar hasta arreglar esto.", "Cannot generate until this is fixed."),
  revisando: t("H.Ü.E revisa la ortografía…", "H.Ü.E is checking the spelling…"),
  sugiere: t("H.Ü.E sugiere:", "H.Ü.E suggests:"),
  usarSugerencia: t("Usar la sugerencia", "Use the suggestion"),
  dejarAsi: t("Dejar como está", "Leave as is"),
  revisaloBien: t("Revísalo bien", "Check it thoroughly"),
  revisaloBienAyuda: t("Una mirada extra de H.Ü.E a lo que una regla no ve (manos, reflejos, claims…).", "An extra look from H.Ü.E at what a rule cannot see (hands, reflections, claims…)."),
  sinAvisosJuicio: t("H.Ü.E no ve nada más que revisar.", "H.Ü.E sees nothing else to check."),
  aplicado: t("Aplicado.", "Applied."),
  fusionTitulo: t("Prompt para fundir dos referencias en una (Nano Banana)", "Prompt to merge two references into one (Nano Banana)"),
  fusionAyuda: t("Genera esta imagen, súbela como referencia única y quita las dos originales.", "Generate this image, upload it as the single reference and remove the two originals."),
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
  // F4: "sube lo que salió"
  comoSalio: t("¿Cómo salió?", "How did it turn out?"),
  comoSalioAyuda: t("Sube la imagen que te dio la herramienta. H.Ü.E la compara con lo que pediste y te dice qué falló.", "Upload the image the tool gave you. H.Ü.E compares it with what you asked for and tells you what missed."),
  comoSalioVideo: t("Para un video, sube una captura (un cuadro): H.Ü.E revisa ese cuadro.", "For a video, upload a screenshot (one frame): H.Ü.E checks that frame."),
  modeloUsado: t("¿En qué modelo lo generaste?", "Which model did you generate it with?"),
  modeloOtro: t("Otro", "Other"),
  subirResultado: t("Arrastra la imagen que salió o búscala en tu compu", "Drag the image that came out or browse your files"),
  comparando: t("H.Ü.E está comparando…", "H.Ü.E is comparing…"),
  veredictoTitulo: t("Lo que H.Ü.E vio", "What H.Ü.E saw"),
  veredictoTodoBien: t("Cumple todo lo que pediste.", "It meets everything you asked for."),
  veredictoPuntos: t("{ok} de {n} puntos bien", "{ok} of {n} points right"),
  cumple: t("Bien", "Right"),
  noCumple: t("Falló", "Missed"),
  corregirResultado: t("Corregir este resultado", "Fix this result"),
  corregirAyuda: t("Un prompt nuevo que edita esta misma imagen: arregla lo que falló y deja lo demás igual.", "A new prompt that edits this same image: fixes what missed and leaves the rest as is."),
  corrigiendo: t("H.Ü.E arma la corrección…", "H.Ü.E is preparing the fix…"),
  refinarOriginal: t("Refinar el original", "Refine the original"),
  refinarOriginalAyuda: t("Vuelve a generar desde el prompt original con este cambio.", "Generate again from the original prompt with this change."),
  aceptarFinal: t("Marcar como resultado final", "Mark as final result"),
  aceptado: t("Resultado final aceptado", "Final result accepted"),
  quitarAceptado: t("Quitar la marca", "Unmark"),
  subirOtro: t("Subir otro", "Upload another"),
  correccion: t("Corrección", "Correction"),
  correccionDe: t("Corrige el resultado que subiste; pégalo con esa imagen adjunta.", "It corrects the result you uploaded; paste it with that image attached."),
  resultadoGuardado: t("Resultado guardado.", "Result saved."),
  resultadoPesado: t("Para compararla, la imagen debe pesar menos de 3.5 MB.", "To compare it, the image must be under 3.5 MB."),
  personajeTitulo: t("Personaje o producto guardado", "Saved character or product"),
  personajeNinguno: t("Ninguno", "None"),
  personajeVacio: t("Todavía no hay ninguno guardado para este cliente.", "Nothing saved for this client yet."),
  personajeCargando: t("Buscando los guardados…", "Loading saved ones…"),
  personajeNuevo: t("Guardar uno nuevo", "Save a new one"),
  personajeQueEs: t("Guarda a la persona, el producto o la mascota que se repite, para que salga igual en cada prompt.", "Save the person, product or mascot that keeps coming back, so it looks the same in every prompt."),
  personajeNombre: t("¿Cómo le llamamos?", "What do we call it?"),
  personajeNombrePh: t("Ej.: Tarjeta DiDi Card, mascota Nanook, Vero (modelo)", "e.g. DiDi Card, Nanook mascot, Vero (model)"),
  personajeFoto: t("Su foto", "Its photo"),
  personajeNotas: t("¿Qué no puede cambiar?", "What must never change?"),
  personajeNotasPh: t("Ej.: tarjeta naranja con el logo abajo a la derecha, esquinas redondeadas, sin chip visible…", "e.g. orange card with the logo bottom right, rounded corners, no visible chip…"),
  personajeDescribir: t("Que HÜE lo describa", "Let HÜE describe it"),
  personajeDescribiendo: t("HÜE lo está mirando…", "HÜE is looking at it…"),
  personajeOtraPropuesta: t("Otra propuesta", "Try again"),
  personajeDesfasada: t("Cambiaste las notas después de la propuesta: pide otra si quieres que se reflejen.", "You changed the notes after the proposal: ask for another one if you want them reflected."),
  personajeDescripcion: t("Así lo va a describir HÜE en cada prompt", "This is how HÜE will describe it in every prompt"),
  personajeDescripcionAyuda: t("En inglés, porque así lo leen las herramientas. Puedes corregirlo antes de guardar.", "In English, because that is what the tools read. You can fix it before saving."),
  personajeGuardar: t("Guardar", "Save"),
  personajeGuardado: t("Guardado. Ya lo puedes usar en cualquier prompt de esta marca.", "Saved. You can now use it in any prompt for this brand."),
  personajeRetirar: t("Retirar", "Retire"),
  personajeRetirado: t("Retirado. Ya no aparece para nadie.", "Retired. It no longer shows for anyone."),
  personajeFotoComoRef: t("Su foto entró como referencia de este prompt.", "Its photo is now a reference for this prompt."),
  cancelar: t("Cancelar", "Cancel"),
  validado: t("Listo para pegar en la herramienta", "Ready to paste into the tool"),
  conObservaciones: t("Con detalles por revisar", "Has details to review"),
  // F5a: el Look rehecho
  lookTitulo: t("Elige un look", "Pick a look"),
  lookAyuda: t("Una receta completa: luz, lente, ángulo, ambiente y estilo. Abajo puedes ajustar una sola cosa.", "A complete recipe: light, lens, angle, mood and style. Below you can adjust a single thing."),
  lookSugiere: t("H.Ü.E sugiere", "H.Ü.E suggests"),
  lookPor: t("por «{p}»", "because of “{p}”"),
  lookHabitual: t("Esta marca lo usa", "This brand uses it"),
  lookElegido: t("Elegido", "Chosen"),
  ajustar: t("Ajustar", "Adjust"),
  ajustarAyuda: t("Cambia una sola cosa sin perder el resto.", "Change one thing without losing the rest."),
  lookPersonalizado: t("Personalizado", "Custom"),
  angulo: t("Ángulo", "Angle"),
  lente: t("Lente", "Lens"),
  adaptarTitulo: t("Adaptar a otros formatos", "Adapt to other formats"),
  adaptarAyuda: t("El mismo prompt, recompilado para otro destino (formato y zona segura), sin volver a llamar a H.Ü.E.", "The same prompt, recompiled for another destination (format and safe zone), without calling H.Ü.E again."),
  adaptando: t("Adaptando…", "Adapting…"),
  adaptado: t("Listo para {d}.", "Ready for {d}."),
  formato: t("Formato", "Format"),
  revisandoJuicio: t("H.Ü.E está revisando el prompt…", "H.Ü.E is reviewing the prompt…"),
} satisfies Record<string, Par>;

export type UiKey = keyof typeof UI;

/** Etiqueta de cada versión (chip del resultado, historial). */
export const VARIANTE_LABEL: Record<PrismaVariante, Par> = { base: UI.varBase, segura: UI.varSegura, audaz: UI.varAudaz, minima: UI.varMinima };
/** Lo que dice el botón para PEDIR esa versión. */
export const PEDIR_VERSION_LABEL: Record<Exclude<PrismaVariante, "base">, Par> = { segura: UI.pedirSegura, audaz: UI.pedirAudaz, minima: UI.pedirMinima };

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
  { valor: "85mm portrait lens, blurred background", label: t("De cerca, fondo desenfocado", "Close, blurred background") },
  { valor: "35mm, natural perspective", label: t("Como lo ve el ojo", "As the eye sees it") },
  { valor: "24mm wide angle, more of the scene", label: t("Abierto, se ve más escena", "Wide, more of the scene") },
  { valor: "100mm macro, extreme detail", label: t("Muy de cerca, cada detalle", "Very close, every detail") },
  { valor: "anamorphic, horizontal flares", label: t("De película, con destellos", "Movie look, with flares") },
];

/** El ángulo de cámara, en palabras llanas (Pedro, 2026-09-14: "Desde arriba", no "Cenital"). */
export const SWATCHES_ANGULO: Swatch[] = [
  { valor: "eye level", label: t("Al nivel de los ojos", "Eye level") },
  { valor: "top-down flat lay", label: t("Desde arriba", "From above") },
  { valor: "45-degree angle from above", label: t("En ángulo, desde arriba", "Angled, from above") },
  { valor: "low angle, looking up", label: t("Desde abajo", "From below") },
  { valor: "straight-on, frontal", label: t("De frente", "Straight on") },
];

/** Valores que fijan los looks y que no están en las listas de arriba: su etiqueta llana, para
 *  que una fila de "Ajustar" nunca enseñe la frase técnica en inglés. */
export const ETIQUETA_VALOR: Record<string, Par> = {
  "soft directional light from one side, rich shadows": t("Luz de lado suave, sombras ricas", "Soft side light, rich shadows"),
  "hard direct sunlight, sharp long shadows": t("Sol duro, sombras largas", "Hard sun, long shadows"),
  "bright even light, solid colored background": t("Luz pareja, fondo de color", "Even light, colored background"),
  "studio HDRI light, soft reflections": t("Estudio 3D, reflejos suaves", "3D studio, soft reflections"),
  "clean studio light, soft key from the front": t("Estudio, luz de frente", "Studio, front light"),
  "bright airy daylight, soft": t("Día luminoso", "Bright daylight"),
  "soft natural daylight": t("Luz natural de día", "Natural daylight"),
  "flat, even, no shadows": t("Plana, sin sombras", "Flat, no shadows"),
  "flat, even, graphic": t("Plana y gráfica", "Flat and graphic"),
  "soft, diffuse": t("Suave y difusa", "Soft and diffuse"),
  "clean studio light, soft shadow": t("Estudio, sombra suave", "Studio, soft shadow"),
  "as in the reference": t("Como en la foto", "As in the photo"),
  "natural daylight": t("Luz de día", "Daylight"),
  "soft directional light, gentle shadows": t("Luz suave de un lado", "Soft light from one side"),
  "warm tungsten light, slightly overexposed": t("Cálida de foco, un poco quemada", "Warm bulb light, a bit blown out"),
  "85mm, everything sharp": t("De cerca, todo enfocado", "Close, all sharp"),
  "50mm, natural perspective": t("Normal, como lo ve el ojo", "Normal, as the eye sees it"),
  "50mm, everything sharp": t("Normal, todo enfocado", "Normal, all sharp"),
  "50mm, film look": t("Normal, look analógico", "Normal, film look"),
  "phone camera, wide": t("Cámara de celular", "Phone camera"),
  "front phone camera, wide": t("Cámara frontal del celular", "Front phone camera"),
  "old camcorder, soft": t("Cámara de video vieja", "Old camcorder"),
  "slightly low angle": t("Un poco desde abajo", "Slightly from below"),
  "high angle from above": t("Desde muy arriba", "From high above"),
  "slightly above eye level": t("Un poco por encima de los ojos", "Slightly above the eyes"),
  "warm, everyday, real": t("Cálido y cotidiano", "Warm and everyday"),
  "clean, curated, calm": t("Limpio y ordenado", "Clean and curated"),
  "bold, confident, graphic": t("Con presencia, gráfico", "Bold and graphic"),
  "premium, tactile": t("Premium, se siente el material", "Premium, tactile"),
  "clean, futuristic": t("Limpio y futurista", "Clean and futuristic"),
  "natural, candid, real": t("Natural y real", "Natural and real"),
  "confident, clean": t("Seguro y limpio", "Confident and clean"),
  "bold, fashion, editorial": t("Con actitud, de revista", "Bold, editorial"),
  "urban, energetic, moody": t("Urbano y con energía", "Urban and energetic"),
  "nostalgic, warm": t("Nostálgico y cálido", "Nostalgic and warm"),
  "natural, believable": t("Natural y creíble", "Natural and believable"),
  "friendly, simple": t("Amable y simple", "Friendly and simple"),
  "bold, punchy, modern": t("Fuerte y moderno", "Bold and modern"),
  "gentle, artistic": t("Suave y artístico", "Gentle and artistic"),
  "calm, natural": t("Tranquilo y natural", "Calm and natural"),
  "premium, calm": t("Premium y tranquilo", "Premium and calm"),
  "authentic, casual": t("Auténtico y casual", "Authentic and casual"),
  "epic, expansive": t("Épico y abierto", "Epic and wide"),
  "calm, tactile": t("Tranquilo, se siente la textura", "Calm and tactile"),
  "friendly, direct": t("Cercano y directo", "Friendly and direct"),
  "warm, natural": t("Cálido y natural", "Warm and natural"),
  "dramatic, cinematic": t("Dramático, de película", "Dramatic, cinematic"),
  "photorealistic lifestyle photo": t("Foto real, de estilo de vida", "Real lifestyle photo"),
  "luxury still-life photography": t("Bodegón de lujo", "Luxury still life"),
  "editorial flat lay photography": t("Flat lay editorial", "Editorial flat lay"),
  "high-contrast advertising photo": t("Foto publicitaria de alto contraste", "High-contrast ad photo"),
  "macro product photography": t("Foto macro de producto", "Macro product photo"),
  "colorful pop advertising photo": t("Foto publicitaria pop", "Pop ad photo"),
  "documentary photography": t("Foto documental", "Documentary photo"),
  "studio portrait photography": t("Retrato de estudio", "Studio portrait"),
  "cinematic street photography": t("Foto de calle, de cine", "Cinematic street photo"),
  "bright lifestyle photography": t("Foto luminosa de estilo de vida", "Bright lifestyle photo"),
  "bold graphic poster design": t("Cartel gráfico", "Graphic poster"),
  "watercolor illustration on paper": t("Acuarela sobre papel", "Watercolor on paper"),
  "minimalist photography": t("Foto minimalista", "Minimalist photo"),
  "editorial photography": t("Foto editorial", "Editorial photo"),
  "cinematic video": t("Video de cine", "Cinematic video"),
  "product commercial": t("Comercial de producto", "Product commercial"),
  "smartphone UGC video": t("Video de celular, real", "Phone-shot UGC video"),
  "aerial cinematic video": t("Video aéreo de cine", "Aerial cinematic video"),
  "ASMR macro video": t("Video ASMR macro", "ASMR macro video"),
  "selfie vlog": t("Vlog selfie", "Selfie vlog"),
  "old VHS home video": t("Video casero VHS", "VHS home video"),
  "handheld selfie, natural shake": t("Selfie en mano", "Handheld selfie"),
};

/** La etiqueta llana de un valor técnico (swatch, valor de look o respuesta de la entrevista); si no
 *  hay ninguna, el valor tal cual. */
export function etiquetaValor(valor: string, lang: Lang, extra: Record<string, Par> = {}): string {
  const swatch = [...SWATCHES_LUZ, ...SWATCHES_CAMARA, ...SWATCHES_LENTE, ...SWATCHES_ANGULO, ...SWATCHES_MOOD, ...SWATCHES_ESTILO].find((s) => s.valor === valor);
  // hasOwn: un valor como "constructor" no debe traer una función del prototipo.
  const par = swatch?.label ?? (Object.hasOwn(ETIQUETA_VALOR, valor) ? ETIQUETA_VALOR[valor] : undefined) ?? (Object.hasOwn(extra, valor) ? extra[valor] : undefined);
  return par ? par[lang] : valor;
}

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

/** Nivel de un aviso del diagnóstico (F2), para el lector de pantalla y las etiquetas. */
/** F4: los puntos que H.Ü.E revisa en lo que salió, en palabras de todos los días. */
export const CAMPO_VEREDICTO_LABEL: Record<CampoVeredicto, Par> = {
  sujeto: t("Lo que se ve", "What is shown"),
  texto: t("El texto", "The text"),
  encuadre: t("Encuadre y formato", "Framing and format"),
  luz: t("La luz", "The light"),
  estilo: t("Estilo y colores", "Style and colors"),
  identidad: t("Parecido con la referencia", "Likeness to the reference"),
  marca: t("La marca", "The brand"),
};

export const NIVEL_LABEL: Record<ReglaNivel, Par> = { bloquea: t("Bloquea", "Blocks"), advierte: t("Aviso", "Warning"), sugiere: t("Sugerencia", "Suggestion") };

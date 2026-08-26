// Importador de guión — lógica pura (sin React, sin Supabase, sin imports de
// servidor ni alias `@/`) para probarse con el harness de node. Convierte el
// TEXTO de un guión pegado (el formato del deck) en planos/estático
// estructurados. Quien pega SIEMPRE revisa y confirma el resultado antes de
// escribir: un campo que no aparece queda en `null` (no se inventa nada).
//
// CONTRATO: el texto viene CON saltos de línea (como sale de un <textarea> o de
// pegar desde el deck). Un pegado SIN saltos se detecta (contarPlanos ≫ los
// planos que salen) y se arregla antes con el normalizador structure-only, no
// aquí. Aquí nunca se adivina un límite que el texto no marca.
//
// El campo `dialogo` sale en el formato "(Quien) texto" que espera parseDialogo
// (src/lib/dialogo.ts), para que la vista del cliente lo seccione por locutor.

import { EMOJI } from "./emoji-map.ts";

export type PlanoParsed = {
  titulo: string | null;
  accion: string | null;
  copy_in: string | null;
  sfx: string | null;
  gfx: string | null;
  edicion: string | null;
  dialogo: string | null;
};

export type EstaticoParsed = {
  copy_titulo: string | null;
  copy_subtitulo: string | null;
  copy_cta: string | null;
  legales_extra: string | null;
};

/** "" → null; recorta. Espeja el `nn` de intake-crear.ts. */
const nn = (s: string): string | null => {
  const t = s.trim();
  return t ? t : null;
};

const juntar = (xs: string[]): string | null => nn(xs.filter((x) => x.trim()).join("\n"));

// Un renglón "Plano N ..." abre un plano. (Un encabezado en negrita ya llega
// des-negritado por limpiarPegado — la heurística inicio-de-línea.)
const HEADER = /^plano\s+\d+\b/i;

/**
 * Cuántos planos DECLARA el texto (marcadores "Plano N" en CUALQUIER parte, no
 * sólo a principio de línea). Señal de confianza para la UI: si parseGuion —que
 * SÍ separa por principio de línea— saca menos bloques que esto, el pegado perdió
 * sus saltos de línea y hay que normalizarlo antes (structure-only, con IA).
 */
// Shortcodes de emoji (Notion / Slack / GitHub) → el emoji real. Los guiones del
// equipo traen reacciones como `:orange_heart:` que deben quedar como 🧡, no como el
// texto `:orange_heart:` ni como "orange heart" (H.Ü.E los expandía a palabras). El
// mapa es COMPLETO (3.4k shortcodes: github + iamcal/Slack + emojibase) generado por
// scripts/gen-emoji-map.mjs — así ninguna convención de nombre falla. Un shortcode
// fuera del mapa (raro) se deja tal cual; nunca convertimos un `:foo:` desconocido.
// Las fronteras `(?<!\d)`/`(?!\d)` evitan que un patrón NUMÉRICO como `1:100:1`
// (tiempo/ratio) matchee el shortcode real `:100:` (💯) y BORRE los dígitos `100`
// del texto antes del guard de integridad numérica de sinInventar. Un `:100:`
// suelto (rodeado de espacio/puntuación) sigue expandiendo normal. (reap 2026-08-26)
const EMOJI_RE = /(?<!\d):([a-z0-9_+-]+):(?!\d)/gi;

/** Convierte shortcodes conocidos a su emoji; deja intacto lo desconocido. */
function emojificar(texto: string): string {
  return (texto ?? "").replace(EMOJI_RE, (m, nombre) => EMOJI[String(nombre).toLowerCase()] ?? m);
}

/**
 * Limpia un pegado "rico" (tabla Markdown/Notion/Docs) a texto plano deck-style,
 * ANTES de parsear o de mandarlo a H.Ü.E. Un guión copiado de Notion trae tabla
 * (`| celda |`), `<br>`, filas separadoras `|---|`, negritas `**…**`/`__…__`, y
 * shortcodes de emoji (`:orange_heart:`). Sin esto el parser no encuentra los
 * "Plano N" (van dentro de una celda) y H.Ü.E tiene que REESCRIBIR la tabla →
 * cambia caracteres → el guardarraíl lo rechaza.
 *
 * NEGRITA — heurística inicio-de-línea = estructura, mitad-de-línea = contenido:
 *   - Los `**…**` que van en MITAD de una línea SE CONSERVAN — son la negrita del
 *     copy (`Copy in: **$46,800 m.n.**`), y las vistas de lectura/cliente los pintan
 *     en <strong> (ver src/lib/negrita.ts).
 *   - Un `**…**` al INICIO de una línea se DES-negrita — casi siempre es andamiaje
 *     que el deck/Notion pone en negrita: un encabezado `**Plano 1 - …**`, una
 *     etiqueta `**Copy in:**` o un locutor `**Actor**`. Si se dejara, el parser no
 *     encontraría el "Plano N"/la etiqueta (empiezan con `*`) y perdería el campo.
 * Normalizamos `__x__` → `**x**` primero (un solo marcador). El `*` legal SUELTO de
 * "CASHBACK*" no forma par y sigue intacto. Antes de mandar copy a H.Ü.E
 * (ortografía/validador) se quitan TODOS con `sinNegrita`, así la IA y sus
 * guardarraíles de `*` ven el copy limpio.
 *
 * Los shortcodes se vuelven emoji real ANTES de la IA (así H.Ü.E ve 🧡, no
 * `:orange_heart:`, y no puede expandirlo a "orange heart"). Los emoji no son
 * letras/dígitos/marcas → el guard `sinInventar` los ignora, como a la puntuación.
 */
export function limpiarPegado(texto: string): string {
  return emojificar(
    (texto ?? "")
      .replace(/\r\n?/g, "\n")
      .replace(/<br\s*\/?>/gi, "\n") // <br> → salto de línea
      .replace(/^[\s|:]*-[\s|:\-]*$/gm, "") // filas separadoras de tabla (|---|:--|)
      .replace(/__(.+?)__/g, "**$1**") // __negrita__ → **negrita** (un solo marcador)
      .replace(/[ \t]*\|[ \t]*/g, "\n") // bordes/columnas de tabla → salto (fija los límites de línea)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      // Andamiaje en negrita al INICIO de línea → sin negrita (header/etiqueta/locutor);
      // sólo el PRIMER `**…**` de cada línea, lo demás (negrita del copy) se conserva.
      .replace(/^\*\*([^\n]*?)\*\*/gm, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

export function contarPlanos(texto: string): number {
  // Sin `\b` inicial a propósito: en un pegado sin saltos el primer "Plano 1"
  // viene PEGADO al header ("…MotionDIÁLOGOPlano 1"), sin frontera de palabra
  // antes de la P; con `\b` se saltaba y contaba de menos.
  return (limpiarPegado(texto).match(/plano\s+\d+\b/gi) ?? []).length;
}

// Etiquetas de campo del deck → a qué campo del plano alimentan. "Botón CTA" no
// tiene campo propio en un plano de video: va a copy_in (decisión de Pedro).
type Etiqueta = { re: RegExp; campo: "copy_in" | "sfx" | "gfx" | "edicion" };
const ETIQUETAS: Etiqueta[] = [
  { re: /^copy\s*in\s*:/i, campo: "copy_in" },
  { re: /^sfx\s*:/i, campo: "sfx" },
  { re: /^gfx\s*:/i, campo: "gfx" },
  { re: /^edici[oó]n\s*:/i, campo: "edicion" },
];
const CTA = /^bot[oó]n\s*cta\s*:/i;

const esEtiqueta = (l: string): boolean => CTA.test(l) || ETIQUETAS.some((e) => e.re.test(l));
const valorEtiqueta = (l: string, re: RegExp): string => l.replace(re, "").trim();

/**
 * Parte el guión pegado en planos. Descarta todo lo anterior al primer "Plano N"
 * (la fila de títulos de columna del deck). Dentro de cada plano: el encabezado
 * es el `titulo`; las etiquetas ("Copy in:", "SFX:", "GFX:", "Edición:", "Botón
 * CTA:") llenan sus campos; la ACCIÓN es el texto antes de las etiquetas y el
 * DIÁLOGO el que va DESPUÉS de la última etiqueta (en el deck la columna
 * izquierda —acción + etiquetas— va primero y el diálogo al final).
 */
export function parseGuion(texto: string): PlanoParsed[] {
  const lineas = limpiarPegado(texto).split("\n");

  const bloques: string[][] = [];
  let actual: string[] | null = null;
  for (const raw of lineas) {
    const linea = raw.trim();
    if (HEADER.test(linea)) {
      actual = [linea];
      bloques.push(actual);
    } else if (actual && linea) {
      actual.push(linea);
    }
    // (líneas antes del primer "Plano N", y las vacías, se ignoran)
  }

  return bloques.map(parseBloque);
}

function parseBloque(lineas: string[]): PlanoParsed {
  const titulo = lineas[0] ?? "";
  const cuerpo = lineas.slice(1);

  const copy_in: string[] = [];
  const sfx: string[] = [];
  const gfx: string[] = [];
  const edicion: string[] = [];
  const bucket: Record<Etiqueta["campo"], string[]> = { copy_in, sfx, gfx, edicion };
  const accion: string[] = [];
  const dialogo: string[] = [];

  // La zona de diálogo empieza DESPUÉS de la última etiqueta (Copy in:/SFX:/…).
  let ultimaEtiqueta = -1;
  cuerpo.forEach((l, i) => { if (esEtiqueta(l)) ultimaEtiqueta = i; });
  // Fallback: si el plano NO trae etiquetas, el diálogo empieza en el primer CUE de
  // locutor SUELTO ("Actriz", "Gata 1", "Actriz (V.O)") — así un diálogo con locutor no
  // se va entero a Acción sólo porque no hubo una etiqueta que marcara el corte (bug del
  // plano 4 en "Pegar guión": el diálogo de la Actriz caía en Acción). `esCue` es
  // conservador (≤4 palabras, capitalizado, sin puntuación final) → no toma "Simulación:"
  // (dos puntos al final) ni descripciones de acción.
  const primerCue = ultimaEtiqueta === -1 ? cuerpo.findIndex((l) => esCue(l)) : -1;
  const inicioDialogo =
    ultimaEtiqueta >= 0 ? ultimaEtiqueta + 1 : primerCue >= 0 ? primerCue : Infinity;

  cuerpo.forEach((linea, i) => {
    const et = ETIQUETAS.find((e) => e.re.test(linea));
    if (et) { bucket[et.campo].push(valorEtiqueta(linea, et.re)); return; }
    if (CTA.test(linea)) { copy_in.push(valorEtiqueta(linea, CTA)); return; }
    // No es etiqueta → diálogo desde `inicioDialogo`; antes de eso, acción.
    if (i >= inicioDialogo) dialogo.push(linea);
    else accion.push(linea);
  });

  return {
    titulo: nn(titulo),
    accion: nn(accion.join(" ")),
    copy_in: juntar(copy_in),
    sfx: juntar(sfx),
    gfx: juntar(gfx),
    edicion: juntar(edicion),
    dialogo: nn(convertirDialogo(dialogo)),
  };
}

// ── Diálogo: "Actriz (V.O)\ntexto" → "(Actriz V.O) texto" ─────────────────────
// Un CUE de locutor es un renglón CORTO en mayúscula inicial (nombre/rol), con un
// paréntesis opcional "(V.O)". No termina en puntuación de oración ni la lleva
// dentro — así una línea de diálogo ("Ah, claro. La DiDi Card.") nunca se
// confunde con un cue. Es sólo para DAR FORMATO al campo (que el humano revisa);
// el texto del diálogo jamás se altera.
const CUE = /^[\p{Lu}][\p{L}.]*(?:\s+[\p{Lu}\d][\p{L}.]*)*(?:\s*\([^)]+\))?$/u;

function esCue(linea: string): boolean {
  if (/[.,;:!?"“”]$/.test(linea)) return false;
  const palabras = linea.split(/\s+/).filter(Boolean);
  return palabras.length > 0 && palabras.length <= 4 && CUE.test(linea);
}

// "Actriz (V.O)" → "Actriz V.O" (quitamos los paréntesis internos porque nosotros
// envolvemos en paréntesis).
const limpiaQuien = (s: string): string => s.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Un locutor con DOS PUNTOS: "Actor: texto" | "Actriz V.O:" | "Narrador: ...".
 * Es como llega el deck del equipo. Lo previo al PRIMER ":" debe ser un cue válido
 * (corto, capitalizado) — así una línea de diálogo con dos puntos ("Y le dije:
 * hola") NO se confunde con un locutor. Devuelve el quién + lo que quede tras el ":".
 */
function cueConColon(linea: string): { quien: string; resto: string } | null {
  const i = linea.indexOf(":");
  if (i <= 0) return null;
  const etiqueta = linea.slice(0, i).trim();
  const palabras = etiqueta.split(/\s+/).filter(Boolean);
  if (palabras.length === 0 || palabras.length > 4 || !CUE.test(etiqueta)) return null;
  return { quien: limpiaQuien(etiqueta), resto: linea.slice(i + 1).trim() };
}

/**
 * Convierte el bloque de diálogo del deck al formato "(Quien) texto" que espera
 * parseDialogo. Reconoce el locutor tanto en su PROPIA línea ("Actriz (V.O)")
 * como con DOS PUNTOS ("Actor: texto" / "Narrador:"), el formato real del equipo.
 */
export function convertirDialogo(lineas: string[]): string {
  const segmentos: string[] = [];
  let quien: string | null = null;
  let buffer: string[] = [];
  const cerrar = () => {
    const texto = buffer.join(" ").trim();
    if (quien === null) { if (texto) segmentos.push(texto); }
    else segmentos.push(`(${quien}) ${texto}`.trim());
    buffer = [];
  };
  for (const linea of lineas) {
    const conColon = cueConColon(linea);
    if (conColon) {
      cerrar();
      quien = conColon.quien;
      if (conColon.resto) buffer.push(conColon.resto);
    } else if (esCue(linea)) {
      cerrar();
      quien = limpiaQuien(linea);
    } else {
      buffer.push(linea);
    }
  }
  cerrar();
  return segmentos.join("\n");
}

// ── Estático ──────────────────────────────────────────────────────────────────
// ⚠️ PROVISIONAL: se implementa por etiquetas razonables, pero el formato REAL
// del copy estático lo confirma Pedro con una muestra (aún no la manda). No hay
// gold-test hasta tenerla; los tests de aquí sólo fijan la extracción por
// etiqueta que sí conocemos.
const EST_ETIQUETAS: { re: RegExp; campo: keyof EstaticoParsed }[] = [
  { re: /^(?:copy\s*in|t[ií]tulo)\s*:/i, campo: "copy_titulo" },
  { re: /^subt[ií]tulo\s*:/i, campo: "copy_subtitulo" },
  { re: /^bot[oó]n\s*cta\s*:/i, campo: "copy_cta" },
  { re: /^legales?\s*:/i, campo: "legales_extra" },
];

export function parseEstatico(texto: string): EstaticoParsed {
  const lineas = limpiarPegado(texto).split("\n").map((l) => l.trim()).filter(Boolean);
  const buckets: Record<keyof EstaticoParsed, string[]> = {
    copy_titulo: [], copy_subtitulo: [], copy_cta: [], legales_extra: [],
  };
  for (const linea of lineas) {
    const et = EST_ETIQUETAS.find((e) => e.re.test(linea));
    if (et) buckets[et.campo].push(linea.replace(et.re, "").trim());
  }
  return {
    copy_titulo: juntar(buckets.copy_titulo),
    copy_subtitulo: juntar(buckets.copy_subtitulo),
    copy_cta: juntar(buckets.copy_cta),
    legales_extra: juntar(buckets.legales_extra),
  };
}

// ── Guardarraíl del normalizador con IA (structure-only) ──────────────────────
/** El texto DESDE el primer marcador "Plano N". Descarta lo anterior (la fila de
 *  títulos de columna del deck, "ACCIÓN + COPY IN…/DIÁLOGO"), que el parser IGUAL
 *  ignora. Ancla el guardarraíl al contenido que SÍ se vuelve planos: la IA puede
 *  quitar o dejar ese encabezado de columnas libremente, sin fallar el guard. */
export function desdeElPrimerPlano(texto: string): string {
  // Sin `\b` inicial: el primer "Plano 1" puede venir pegado al header del deck
  // ("…DIÁLOGOPlano 1"); con `\b` se anclaba mal (saltaba al "Plano 2") y el
  // guard comparaba blob-desde-Plano-2 vs IA-desde-Plano-1 → nunca igual.
  const i = (texto ?? "").search(/plano\s+\d+\b/i);
  return i >= 0 ? (texto ?? "").slice(i) : (texto ?? "");
}

/**
 * ¿Dos textos tienen el mismo CONTENIDO fact-shaped? Es el guardarraíl del
 * normalizador con IA. La IA sólo debe INSERTAR saltos de línea, pero es no
 * determinista y a veces toca algo cosmético (una coma, una comilla curva, un
 * espacio). Exigir identidad byte a byte es demasiado frágil (a veces pasa, a
 * veces no). En vez de eso verificamos que lo que DE VERDAD no puede cambiar
 * quede intacto:
 *   - la SECUENCIA de dígitos (protege $60,000, 6%… — un número cambiado se caza),
 *   - la CUENTA de signos de legal/oferta * % $ (un asterisco perdido se caza),
 *   - el MULTISET de letras (una palabra agregada/quitada/cambiada se caza).
 * Tolera whitespace, puntuación y tipografía cosmética (comillas curvas↔rectas,
 * "…"↔"...", guiones). NO cubre un reordenamiento de palabras con las mismas
 * letras — pero la IA no reordena al insertar saltos, y el humano revisa la vista
 * previa antes de importar. (Anclar con desdeElPrimerPlano para ignorar la fila
 * de títulos de columna, que la IA puede quitar.)
 */
export function mismoContenido(a: string, b: string): boolean {
  const norm = (s: string) =>
    (s ?? "")
      // NFC primero: si el modelo devuelve un acento DESCOMPUESTO (a + U+0301) y la
      // entrada lo trae PRECOMPUESTO (á), los multisets de letras difieren y una
      // extracción buena se rechazaría. El corpus es español (á é í ó ú ñ). (reap 2026-08-26)
      .normalize("NFC")
      .replace(/[“”„‟″]/g, '"')
      .replace(/[‘’‚‛′]/g, "'")
      .replace(/…/g, "...")
      .replace(/[–—―]/g, "-");
  const digitos = (s: string) => (s.match(/\d/g) ?? []).join("");
  const letras = (s: string) => (s.match(/\p{L}/gu) ?? []).sort().join("");
  const cuenta = (s: string, re: RegExp) => (s.match(re) ?? []).length;

  const na = norm(a), nb = norm(b);
  return (
    digitos(na) === digitos(nb) &&
    letras(na) === letras(nb) &&
    cuenta(na, /\*/g) === cuenta(nb, /\*/g) &&
    cuenta(na, /%/g) === cuenta(nb, /%/g) &&
    cuenta(na, /\$/g) === cuenta(nb, /\$/g)
  );
}

// ── Guardarraíl del EXTRACTOR format-agnostic (H.Ü.E) ─────────────────────────
/**
 * ¿El texto EXTRAÍDO no INVENTÓ nada respecto de la ENTRADA? Es el guardarraíl del
 * extractor: H.Ü.E lee un guión en CUALQUIER formato (deck, tabla, bullets, labels
 * distintas, screenplay) y lo mapea a los campos de plano de Greenlight.
 *
 * A diferencia de `mismoContenido` —el normalizador structure-only sólo INSERTA
 * saltos, así que exige IGUALDAD de contenido— el extractor DISTRIBUYE el texto en
 * campos y DESCARTA los rótulos ("Copy in:", "SFX:", encabezados de columna). El
 * contenido extraído es entonces un SUBCONJUNTO de la entrada, nunca idéntico.
 *
 * Invariante que SIEMPRE vale, sin importar el formato de origen: extraer sólo
 * SELECCIONA y REORDENA lo que ya está; jamás introduce contenido nuevo. Verificamos
 * que cada letra, dígito y signo de legal/oferta (* % $) del extraído exista en la
 * entrada con AL MENOS esa frecuencia (submultiset). Un número cambiado, una palabra
 * inventada, un legal agregado o una abreviatura expandida ("V.O"→"Voz en Off") meten
 * caracteres que no están en la entrada → se caza y se rechaza.
 *
 * OMITIR contenido (un rótulo —correcto— o, por error, un plano) NO lo caza este
 * guard: eso lo caza la VISTA PREVIA humana obligatoria (se ven todos los campos
 * extraídos y se nota lo que falte). El extractor nunca escribe; el humano confirma.
 * Las letras se comparan sin distinción de mayúsculas (cosmético, como la tipografía).
 */
export function sinInventar(entrada: string, extraido: string): boolean {
  const norm = (s: string) =>
    (s ?? "")
      // NFC primero: si el modelo devuelve un acento DESCOMPUESTO (a + U+0301) y la
      // entrada lo trae PRECOMPUESTO (á), los multisets de letras difieren y una
      // extracción buena se rechazaría. El corpus es español (á é í ó ú ñ). (reap 2026-08-26)
      .normalize("NFC")
      .replace(/[“”„‟″]/g, '"')
      .replace(/[‘’‚‛′]/g, "'")
      .replace(/…/g, "...")
      .replace(/[–—―]/g, "-");
  const cuentas = (s: string, re: RegExp): Map<string, number> => {
    const m = new Map<string, number>();
    for (const c of s.match(re) ?? []) m.set(c, (m.get(c) ?? 0) + 1);
    return m;
  };
  const subconjunto = (chico: Map<string, number>, grande: Map<string, number>): boolean => {
    for (const [c, n] of chico) if ((grande.get(c) ?? 0) < n) return false;
    return true;
  };
  const ne = norm(entrada), nx = norm(extraido);
  const letras = (s: string) => cuentas(s.toLowerCase(), /\p{L}/gu);
  const digitos = (s: string) => cuentas(s, /\d/g);
  const signos = (s: string) => cuentas(s, /[*%$]/g);
  return (
    subconjunto(letras(nx), letras(ne)) &&
    subconjunto(digitos(nx), digitos(ne)) &&
    subconjunto(signos(nx), signos(ne))
  );
}

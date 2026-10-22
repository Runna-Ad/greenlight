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
  cta: string | null;
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

// Etiquetas de campo del deck → a qué campo del plano alimentan.
type Etiqueta = { re: RegExp; campo: "copy_in" | "sfx" | "gfx" | "edicion" };
const ETIQUETAS: Etiqueta[] = [
  { re: /^copy\s*in\s*:/i, campo: "copy_in" },
  { re: /^sfx\s*:/i, campo: "sfx" },
  { re: /^gfx\s*:/i, campo: "gfx" },
  { re: /^edici[oó]n\s*:/i, campo: "edicion" },
];

const valorEtiqueta = (l: string, re: RegExp): string => l.replace(re, "").trim();

// ── CTA ───────────────────────────────────────────────────────────────────────
// El CTA tiene campo propio en el plano (Pedro 2026-10-22; antes "Botón CTA:" caía
// en copy_in sin su etiqueta). Es ETIQUETA con dos puntos ("CTA:", "Botón CTA:",
// "Call to action:", "Llamado a la acción:"), con o sin negrita, viñeta o emoji
// adelante; o un renglón que es SÓLO "CTA" / "Botón CTA" con el texto abajo. Sin dos
// puntos dentro de una frase es una acotación ("señala el CTA.") y se queda donde está.
// A mitad de renglón sólo cuentan las formas cortas (CTA:/Botón CTA:), y fuera de un
// renglón de campo (Copy in:, SFX:…) sólo después de un separador (" · CTA:", ". CTA:"):
// "Aparece el botón CTA: Pídela" es una descripción. `(?<![\p{L}\d])` evita partir
// dentro de una palabra ("Acta:").
const CTA_CORTA = "(?:bot[oó]n\\s*)?cta";
const CTA_LARGA = "(?:call\\s*to\\s*action|llamad[oa]\\s+a\\s+la\\s+acci[oó]n)";
const CTA_CUALQUIERA = `(?:${CTA_CORTA}|${CTA_LARGA})`;
const PREFIJO = "(?:[•·\\-–—]\\s*|\\p{Extended_Pictographic}\\uFE0F?\\s*)?";
const rotuloCta = (nucleo: string): string => `(?:\\*\\*)?${nucleo}(?:\\*\\*)?\\s*:(?:\\*\\*)?`;
const CTA_INICIO = new RegExp(`^${PREFIJO}${rotuloCta(CTA_CUALQUIERA)}`, "iu");
const CTA_ADENTRO = new RegExp(`(?<![\\p{L}\\d])${rotuloCta(CTA_CORTA)}`, "iu");
const CTA_TRAS_SEPARADOR = new RegExp(`(?<=[·•|;.!?–—-]\\s*)${rotuloCta(CTA_CORTA)}`, "iu");
const CTA_SOLO = new RegExp(`^${PREFIJO}(?:\\*\\*)?${CTA_CORTA}(?:\\*\\*)?\\s*:?(?:\\*\\*)?$`, "iu");
// El extractor/writer a veces pone el CTA como locutor: "(CTA) Pídela".
const CTA_LOCUTOR = new RegExp(`^\\(\\s*${CTA_CUALQUIERA}\\s*\\)\\s*`, "iu");

/** Un renglón que abre un CTA desde su inicio ("CTA: …", "CTA:", "Botón CTA"). */
const abreCta = (l: string): boolean => CTA_SOLO.test(l.trim()) || CTA_INICIO.test(l.trim());

/** Quita separadores colgando al final (" · ", " | ", " - "). Nunca toca * $ %.
 *  Con un ciclo y no con `/[…]+$/`: esa regex es cuadrática en un renglón con una tira
 *  larga de guiones a la mitad (39 000 guiones → medio segundo; reap 0081). */
const SEPARADOR = /[\s·•|,;:/–—-]/u;
function sinSeparadorFinal(s: string): string {
  let fin = s.length;
  while (fin > 0 && SEPARADOR.test(s[fin - 1])) fin--;
  return s.slice(0, fin);
}

/** Si un corte partió una negrita (`**Sin anualidad · CTA: Pídela**`), la cierra en un
 *  pedazo y la reabre en el siguiente. Si el renglón trae un `**` sin pareja (una marca
 *  legal como "CASHBACK**"), no adivina: lo deja como está. */
function repartirNegrita(partes: string[]): string[] {
  const n = (p: string): number => (p.match(/\*\*/g) ?? []).length;
  if (partes.reduce((suma, p) => suma + n(p), 0) % 2) return partes;
  let abierta = false;
  return partes.map((p) => {
    let out = p;
    if (abierta && out) out = `**${out}`;
    const abiertaAlFinal = abierta !== (n(p) % 2 === 1);
    if (abiertaAlFinal && out) out = `${out}**`;
    abierta = abiertaAlFinal;
    return out;
  });
}

/** Dónde puede ir un CTA dentro del renglón: "campo" (valor de Copy in:/SFX:/Título:…,
 *  en cualquier parte), "accion" (sólo al inicio o tras un separador), "hablado" (sólo
 *  al inicio: "dale clic al CTA: es fácil" no se parte). */
export type ModoCta = "campo" | "accion" | "hablado";

/**
 * Separa las etiquetas de CTA de un renglón. `resto` es lo de antes de la primera
 * etiqueta; cada etiqueta abre un CTA. Un CTA vacío ("CTA:" o "CTA" solos) significa
 * "el texto viene en el renglón de abajo". Un renglón SIN etiqueta sale intacto.
 */
export function separarCta(linea: string, modo: ModoCta = "campo"): { resto: string; ctas: string[] } {
  const t = linea.trim();
  if (CTA_SOLO.test(t)) return { resto: "", ctas: [""] };
  const adentro = modo === "campo" ? CTA_ADENTRO : CTA_TRAS_SEPARADOR;
  const inicio = CTA_INICIO.exec(t);
  let partes: string[];
  if (inicio) {
    const cola = t.slice(inicio[0].length);
    partes = ["", ...(modo === "hablado" ? [cola] : cola.split(adentro))];
  } else if (modo === "hablado" || !adentro.test(t)) {
    return { resto: t, ctas: [] };
  } else {
    partes = t.split(adentro);
  }
  // Sólo se limpia el borde de cada CORTE (el " · " que quedó antes de un rótulo).
  const limpias = partes.map((p, i) => (i < partes.length - 1 ? sinSeparadorFinal(p.trim()) : p.trim()));
  const [resto, ...ctas] = repartirNegrita(limpias);
  return { resto, ctas };
}

/** ¿Termina el renglón en un CTA vacío (su texto viene abajo)? */
const ctaPendiente = (ctas: string[]): boolean => ctas.length > 0 && ctas[ctas.length - 1] === "";

// Renglones de campo (plano o estático): ahí un "CTA:" a mitad de renglón SÍ es rótulo.
const RENGLON_DE_CAMPO = /^(?:copy\s*in|sfx|gfx|edici[oó]n|t[ií]tulo|subt[ií]tulo|legales?)\s*:/i;

/** ¿El texto pegado trae un CTA? Para avisar en la vista previa si ningún plano quedó
 *  con CTA (algo se perdió o cayó en otro campo). Cuenta lo mismo que el parser: un
 *  rótulo al inicio del renglón, o a mitad de un renglón de campo. NO cuenta un "CTA:"
 *  a mitad de una frase hablada ("dale clic al CTA: es fácil"), ni un "CTA" suelto
 *  antes del primer plano (es el encabezado de una columna del deck, no un CTA). */
export function mencionaCta(texto: string): boolean {
  const lineas = limpiarPegado(texto).split("\n").map((l) => l.trim());
  const primerPlano = lineas.findIndex((l) => HEADER.test(l));
  return lineas.some((l, i) => {
    if (CTA_SOLO.test(l)) return i > primerPlano;
    if (CTA_INICIO.test(l)) return true;
    return RENGLON_DE_CAMPO.test(l) && CTA_ADENTRO.test(l);
  });
}

/**
 * Para lo que devuelve H.Ü.E (extraer o escribir): si dejó un "CTA: …" dentro de
 * otro campo, el CTA como locutor del diálogo ("(CTA) Pídela"), o repitió el rótulo
 * dentro del propio cta ("Botón CTA: Pídela"), lo pasa a `cta` sin rótulo y sin
 * repetidos. Mismas etiquetas que el parser; el texto sólo cambia de campo, nunca de
 * palabras, y un campo sin CTA queda exactamente igual.
 */
export function normalizarCta(p: PlanoParsed): PlanoParsed {
  const ctas: string[] = [];
  for (const l of (p.cta ?? "").split("\n")) {
    const { resto, ctas: c } = separarCta(l, "hablado");
    ctas.push(resto, ...c);
  }
  const out: PlanoParsed = { ...p };
  for (const k of ["accion", "copy_in", "sfx", "gfx", "edicion"] as const) {
    const v = out[k];
    if (!v) continue;
    let movio = false;
    const lineas = v.split("\n").map((l) => {
      const r = separarCta(l, k === "accion" ? "accion" : "campo");
      if (!r.ctas.length) return l;
      movio = true;
      ctas.push(...r.ctas);
      return r.resto;
    });
    if (movio) out[k] = juntar(lineas);
  }
  if (out.dialogo) {
    let movio = false;
    let textoAbajo = false; // "(CTA)" o "CTA:" solos: su texto es el renglón siguiente
    const quedan: string[] = [];
    for (const l of out.dialogo.split("\n")) {
      const t = l.trim();
      if (textoAbajo && t && !t.startsWith("(")) { ctas.push(t); textoAbajo = false; continue; }
      textoAbajo = false;
      const loc = CTA_LOCUTOR.exec(t);
      if (loc) {
        movio = true;
        const texto = t.slice(loc[0].length);
        if (texto) ctas.push(texto);
        else textoAbajo = true;
        continue;
      }
      const r = separarCta(l, "hablado");
      if (!r.ctas.length) { quedan.push(l); continue; }
      movio = true;
      ctas.push(...r.ctas);
      textoAbajo = ctaPendiente(r.ctas);
      if (r.resto) quedan.push(r.resto);
    }
    if (movio) out.dialogo = juntar(quedan);
  }
  out.cta = juntar([...new Set(ctas.flatMap((c) => c.split("\n")).map((c) => c.trim()))]);
  return out;
}

/**
 * Parte el guión pegado en planos. Descarta todo lo anterior al primer "Plano N"
 * (la fila de títulos de columna del deck). Dentro de cada plano: el encabezado
 * es el `titulo`; las etiquetas ("Copy in:", "SFX:", "GFX:", "Edición:") llenan sus
 * campos y una etiqueta de CTA, en cualquier parte del plano, llena `cta`; la ACCIÓN
 * es el texto antes de las etiquetas y el DIÁLOGO el que va DESPUÉS de la última
 * etiqueta (en el deck la columna izquierda —acción + etiquetas— va primero y el
 * diálogo al final).
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

const esEtiqueta = (l: string): boolean => ETIQUETAS.some((e) => e.re.test(l));

/**
 * ¿`sig` es el texto de un CTA que vino solo en el renglón de arriba? No si es otra
 * etiqueta, otro CTA o un locutor con dos puntos. Un renglón con cara de locutor
 * ("Pídela", "Solicítala Ahora") sólo es locutor si abajo viene su texto; si abajo
 * viene otro locutor, una etiqueta o nada, es el texto del botón.
 */
function esTextoDeCta(sig: string | undefined, despues: string | undefined): boolean {
  if (!sig || esEtiqueta(sig) || abreCta(sig) || cueConColon(sig)) return false;
  if (!esCue(sig)) return true;
  return !despues || esEtiqueta(despues) || abreCta(despues) || esCue(despues) || !!cueConColon(despues);
}

function parseBloque(lineas: string[]): PlanoParsed {
  const titulo = lineas[0] ?? "";
  const cuerpo = lineas.slice(1);

  const copy_in: string[] = [];
  const sfx: string[] = [];
  const gfx: string[] = [];
  const edicion: string[] = [];
  const bucket: Record<Etiqueta["campo"], string[]> = { copy_in, sfx, gfx, edicion };
  const cta: string[] = [];
  const accion: string[] = [];
  const dialogo: string[] = [];

  // Renglones que son el TEXTO de un CTA que vino solo arriba ("CTA:", "Botón CTA",
  // "Copy in: … · CTA:"). Se marcan ANTES de ubicar el diálogo, para que no cuenten
  // como acción, como locutor ni como diálogo.
  const valorDeCta = new Set<number>();
  cuerpo.forEach((l, i) => {
    if (valorDeCta.has(i)) return;
    const et = ETIQUETAS.find((e) => e.re.test(l));
    const ctas = et ? separarCta(valorEtiqueta(l, et.re)).ctas : abreCta(l) ? separarCta(l, "hablado").ctas : [];
    if (ctaPendiente(ctas) && esTextoDeCta(cuerpo[i + 1], cuerpo[i + 2])) valorDeCta.add(i + 1);
  });

  // La zona de diálogo empieza DESPUÉS de la última etiqueta (Copy in:/SFX:/…). El CTA
  // NO cuenta: puede ir antes o después del diálogo, y un "Botón CTA:" al final del
  // plano mandaba todo el diálogo a Acción.
  let ultimaEtiqueta = -1;
  cuerpo.forEach((l, i) => { if (esEtiqueta(l)) ultimaEtiqueta = i; });
  // Fallback: si el plano NO trae etiquetas, el diálogo empieza en el primer CUE de
  // locutor SUELTO ("Actriz", "Gata 1", "Actriz (V.O)") — así un diálogo con locutor no
  // se va entero a Acción sólo porque no hubo una etiqueta que marcara el corte (bug del
  // plano 4 en "Pegar guión": el diálogo de la Actriz caía en Acción). `esCue` es
  // conservador (≤4 palabras, capitalizado, sin puntuación final) → no toma "Simulación:"
  // (dos puntos al final) ni descripciones de acción. Un "Botón CTA" suelto o el texto
  // de un CTA ("Pídela") parecen cue; no son locutores.
  const primerCue =
    ultimaEtiqueta === -1
      ? cuerpo.findIndex((l, i) => !valorDeCta.has(i) && !abreCta(l) && esCue(l))
      : -1;
  const inicioDialogo =
    ultimaEtiqueta >= 0 ? ultimaEtiqueta + 1 : primerCue >= 0 ? primerCue : Infinity;

  cuerpo.forEach((linea, i) => {
    if (valorDeCta.has(i)) { cta.push(linea); return; }
    const et = ETIQUETAS.find((e) => e.re.test(linea));
    if (et) {
      // Etiqueta de campo; si trae un CTA a mitad de renglón, ese pedazo va a CTA.
      const { resto, ctas } = separarCta(valorEtiqueta(linea, et.re));
      bucket[et.campo].push(resto);
      cta.push(...ctas);
      return;
    }
    // No es etiqueta → diálogo desde `inicioDialogo`; antes de eso, acción.
    const hablado = i >= inicioDialogo;
    const { resto, ctas } = separarCta(linea, hablado ? "hablado" : "accion");
    cta.push(...ctas);
    if (resto) (hablado ? dialogo : accion).push(resto);
  });

  return {
    titulo: nn(titulo),
    accion: nn(accion.join(" ")),
    copy_in: juntar(copy_in),
    cta: juntar(cta),
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
// El CTA no está en esta lista: usa las mismas etiquetas que el plano (separarCta),
// en su renglón o a mitad de otro.
const EST_ETIQUETAS: { re: RegExp; campo: keyof EstaticoParsed }[] = [
  { re: /^(?:copy\s*in|t[ií]tulo)\s*:/i, campo: "copy_titulo" },
  { re: /^subt[ií]tulo\s*:/i, campo: "copy_subtitulo" },
  { re: /^legales?\s*:/i, campo: "legales_extra" },
];

export function parseEstatico(texto: string): EstaticoParsed {
  const lineas = limpiarPegado(texto).split("\n").map((l) => l.trim()).filter(Boolean);
  const buckets: Record<keyof EstaticoParsed, string[]> = {
    copy_titulo: [], copy_subtitulo: [], copy_cta: [], legales_extra: [],
  };
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const et = EST_ETIQUETAS.find((e) => e.re.test(linea));
    const { resto, ctas } = separarCta(et ? linea.replace(et.re, "").trim() : linea);
    if (et) buckets[et.campo].push(resto);
    buckets.copy_cta.push(...ctas);
    // "CTA:" solo (o "Título: … · CTA:") → el texto viene abajo, si ese renglón no es
    // otra etiqueta ni otro CTA.
    const sig = lineas[i + 1];
    if (ctaPendiente(ctas) && sig && !EST_ETIQUETAS.some((e) => e.re.test(sig)) && !abreCta(sig)) {
      buckets.copy_cta.push(sig);
      i++;
    }
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

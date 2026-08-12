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

// Un renglón "Plano N ..." abre un plano.
const HEADER = /^plano\s+\d+\b/i;

/**
 * Cuántos planos DECLARA el texto (marcadores "Plano N" en CUALQUIER parte, no
 * sólo a principio de línea). Señal de confianza para la UI: si parseGuion —que
 * SÍ separa por principio de línea— saca menos bloques que esto, el pegado perdió
 * sus saltos de línea y hay que normalizarlo antes (structure-only, con IA).
 */
export function contarPlanos(texto: string): number {
  // Sin `\b` inicial a propósito: en un pegado sin saltos el primer "Plano 1"
  // viene PEGADO al header ("…MotionDIÁLOGOPlano 1"), sin frontera de palabra
  // antes de la P; con `\b` se saltaba y contaba de menos.
  return (texto.match(/plano\s+\d+\b/gi) ?? []).length;
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
  const lineas = (texto ?? "").replace(/\r\n?/g, "\n").split("\n");

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

  // La zona de diálogo empieza DESPUÉS de la última etiqueta.
  let ultimaEtiqueta = -1;
  cuerpo.forEach((l, i) => { if (esEtiqueta(l)) ultimaEtiqueta = i; });

  cuerpo.forEach((linea, i) => {
    const et = ETIQUETAS.find((e) => e.re.test(linea));
    if (et) { bucket[et.campo].push(valorEtiqueta(linea, et.re)); return; }
    if (CTA.test(linea)) { copy_in.push(valorEtiqueta(linea, CTA)); return; }
    // No es etiqueta. Diálogo si va después de la última etiqueta; si no, acción.
    // Sin etiquetas (ultimaEtiqueta === -1) TODO es acción — no adivinamos dónde
    // empezaría el diálogo (el humano lo separa en la vista previa).
    if (ultimaEtiqueta >= 0 && i > ultimaEtiqueta) dialogo.push(linea);
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

/** Convierte el bloque de diálogo del deck al formato "(Quien) texto". */
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
    if (esCue(linea)) {
      cerrar();
      // "Actriz (V.O)" → "Actriz V.O" (quitamos los paréntesis internos porque
      // nosotros envolvemos en paréntesis).
      quien = linea.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
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
  const lineas = (texto ?? "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
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

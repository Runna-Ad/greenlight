// SOURCE OF TRUTH para los TIPOS DE CAMBIO (las categorías de una corrección).
// Salen del rúbrica de evaluación de Pedro. Cuando un revisor INTERNO pide un
// cambio, DEBE etiquetarlo con uno de estos; esa etiqueta alimenta el dashboard
// de Evaluación (puntaje por tarea, binario: si una tarea tuvo ≥1 cambio de tipo
// X → 0 en X; si no → 10).
//
// Es una lista en TS (no un enum de la base) a propósito: la rúbrica evoluciona y
// un enum obligaría a migrar por cada criterio nuevo. `comments.categoria` guarda
// el slug. El lado del CLIENTE no lleva categoría — esto es sólo interno.
//
// Lib pura (sin React) para poder compartirla entre el selector, la tarjeta de
// hover y el dashboard, y probarla con el harness de node.

export type CategoriaCambio =
  | "cumplimiento_brief"
  | "errores_marca"
  | "ortografia"
  | "storytelling"
  | "claridad"
  | "creatividad"
  | "hook"
  | "dinamismo"
  | "otro";

// "proceso" es un grupo SINTÉTICO de la Evaluación (no un tipo de cambio que el revisor
// elige): aloja el criterio "Resolución de cambios" (rework fallido detectado por H.Ü.E).
export type GrupoCriterio = "entrega" | "craft" | "aterrizaje" | "proceso" | "otro";

export const GRUPO_LABEL: Record<GrupoCriterio, string> = {
  entrega: "Calidad de entrega",
  craft: "Craft creativo",
  aterrizaje: "Aterrizaje a video/estático",
  proceso: "Proceso / ejecución",
  otro: "Otro",
};

// Un tinte por GRUPO (para el punto/chip), de tokens que ya existen en el tema.
export const GRUPO_TONO: Record<GrupoCriterio, string> = {
  entrega: "var(--status-corrections)", // rojo — errores objetivos
  craft: "var(--primary)", // morado de marca
  aterrizaje: "var(--status-progress)", // ámbar
  proceso: "var(--status-published)", // azul — ejecución/rework
  otro: "var(--muted-foreground)", // neutro
};

export type TipoCambio = {
  slug: CategoriaCambio;
  label: string;
  grupo: GrupoCriterio;
  /** La pregunta guía del rúbrica (tooltip en el selector). */
  hint: string;
};

export const CATEGORIAS_CAMBIO: TipoCambio[] = [
  {
    slug: "cumplimiento_brief",
    label: "Cumplimiento del brief",
    grupo: "entrega",
    hint: "¿Incluye todo lo que pidió el cliente? ¿Se respetó la referencia visual o de tono?",
  },
  {
    slug: "errores_marca",
    label: "Errores de marca",
    grupo: "entrega",
    hint: "CASHBACK, selling points, legales, asteriscos — ¿todo correcto y bien escrito?",
  },
  {
    slug: "ortografia",
    label: "Ortografía",
    grupo: "entrega",
    hint: "¿Sin errores en textos, subtítulos o inserts?",
  },
  {
    slug: "storytelling",
    label: "Storytelling",
    grupo: "craft",
    hint: "Flujo, ritmo y estructura (inicio-desarrollo-cierre); diálogos naturales.",
  },
  {
    slug: "claridad",
    label: "Claridad del mensaje",
    grupo: "craft",
    hint: "¿Se entiende rápido? ¿Los selling points fluyen sin sentirse forzados?",
  },
  {
    slug: "creatividad",
    label: "Creatividad",
    grupo: "craft",
    hint: "¿Explora algo nuevo o mejora una propuesta previa? ¿Original y entretenido?",
  },
  {
    slug: "hook",
    label: "Hook",
    grupo: "aterrizaje",
    hint: "¿Engancha desde el primer segundo (video) o el primer texto (estático)?",
  },
  {
    slug: "dinamismo",
    label: "Dinamismo",
    grupo: "aterrizaje",
    hint: "Cortes ágiles, trick shots, recursos visuales; diálogos cortos y naturales.",
  },
  {
    slug: "otro",
    label: "Otro",
    grupo: "otro",
    hint: "Un cambio que no cae en un criterio del rúbrica (no cuenta en el puntaje).",
  },
];

/** Los criterios que SÍ puntúan en la evaluación (todos menos "otro"). */
export const CRITERIOS_PUNTUABLES: TipoCambio[] = CATEGORIAS_CAMBIO.filter(
  (c) => c.slug !== "otro",
);

const POR_SLUG = new Map(CATEGORIAS_CAMBIO.map((c) => [c.slug, c]));

/** El tipo de cambio de un slug (o undefined si es null/desconocido). */
export const tipoCambio = (slug: string | null | undefined): TipoCambio | undefined =>
  slug ? POR_SLUG.get(slug as CategoriaCambio) : undefined;

/** ¿Es un slug de categoría válido? */
export const esCategoria = (slug: string | null | undefined): slug is CategoriaCambio =>
  !!slug && POR_SLUG.has(slug as CategoriaCambio);

/** Agrupadas por sección del rúbrica, en orden, para el selector. */
export const CATEGORIAS_POR_GRUPO: {
  grupo: GrupoCriterio;
  label: string;
  tono: string;
  items: TipoCambio[];
}[] = (["entrega", "craft", "aterrizaje", "otro"] as GrupoCriterio[]).map((g) => ({
  grupo: g,
  label: GRUPO_LABEL[g],
  tono: GRUPO_TONO[g],
  items: CATEGORIAS_CAMBIO.filter((c) => c.grupo === g),
}));

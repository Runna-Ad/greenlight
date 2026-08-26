// Qué campos son obligatorios para poder CREAR una tarea.
//
// No es una lista única: depende del Tipo de Asset. Sacado de los datos reales
// del Brief 24/07 — una tarea de Copies es texto, no tiene Tamaño ni Duración y
// el Naming del sheet está pensado para archivos de video/imagen. Exigirle esos
// campos bloquearía trabajo legítimo, y una validación que estorba es una
// validación que el equipo aprende a rodear.
//
// ⚠️ NO derivar esta matriz de namingKindForTipo() (src/lib/filename.ts): esa
// agrupa Images y Copies juntas como "static" porque elige la fórmula del
// nombre de archivo, no los obligatorios. Sus requisitos son distintos.
// Se indexa por el texto literal de "Tipo de Asset".
//
// Espejo de produccion.missing_required() en SQL, atado con contract test en
// scripts/test-db.mjs — mismo patrón que buildFilename y canMove.

import type { SheetColumn, SheetRow } from "./sheet-sync";

/** Los 6 tipos del sheet, agrupados por lo que exigen. */
export type TipoGroup = "video" | "images" | "copies";

const GROUP_BY_TIPO: Record<string, TipoGroup> = {
  "RP Video": "video",
  "Normal Video": "video",
  "AIGC video": "video",
  GIF: "video",
  Images: "images",
  Copies: "copies",
};

/**
 * Un tipo desconocido cae en "video", que es el grupo más exigente.
 * Preferimos pedir de más y que alguien lo corrija, a dejar pasar una tarea
 * incompleta porque el sheet trajo un valor que no conocíamos.
 */
export function tipoGroup(tipo: string | undefined): TipoGroup {
  const t = (tipo ?? "").trim();
  return GROUP_BY_TIPO[t] ?? "video";
}

/** Sin estos no se crea nada, sea del tipo que sea. */
export const ALWAYS_REQUIRED: SheetColumn[] = [
  "Asignación",
  "Marca",
  "# Entrega",
  "Tipo de Asset",
  "Concepto",
  "Plataforma",
];

const EXTRA_BY_GROUP: Record<TipoGroup, SheetColumn[]> = {
  video: ["Naming", "# Idea", "Tamaño", "Duración"],
  images: ["Naming", "# Idea", "Tamaño"], // un estático no dura
  copies: [], // es texto: ni proporción, ni duración, ni nombre de archivo
};

export function requiredFor(tipo: string | undefined): SheetColumn[] {
  return [...ALWAYS_REQUIRED, ...EXTRA_BY_GROUP[tipoGroup(tipo)]];
}

/**
 * "-" cuenta como vacío: es como el sheet escribe "no aplica" en Duración.
 * Tratarlo como valor haría pasar una tarea sin duración real.
 */
const isBlank = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return s === "" || s === "-";
};

/** Los campos obligatorios que faltan. Vacío = se puede crear. */
export function missingRequired(row: SheetRow): SheetColumn[] {
  return requiredFor(row["Tipo de Asset"]).filter((f) => isBlank(row[f]));
}

/**
 * Los obligatorios que BLOQUEAN el sync — como missingRequired pero SIN la
 * Asignación: una tarea sin lead se crea IGUAL (se asigna a mano después), sólo se
 * marca "sin lead". Espeja el filtro del importador (import.ts), para que la UI no
 * bloquee lo que el servidor sí importaría.
 */
export function missingBloqueante(row: SheetRow): SheetColumn[] {
  return missingRequired(row).filter((c) => c !== "Asignación");
}

/** ¿A esta fila le falta el lead (Asignación)? NO bloquea el sync; sólo se marca. */
export function faltaLead(row: SheetRow): boolean {
  return isBlank(row["Asignación"]);
}

/**
 * Un copy no es un archivo con proporción.
 *
 * El importador tenía un fallback que inventaba `9:16 × FB` cuando la fila no
 * traía Tamaño ni Plataforma, y a las 2 filas de Copies del Brief 24/07 les
 * generó un entregable fantasma llamado
 * SINNAMING_9X16_TEXTO_STATIC_IDEAX1_GG_V1_SINMES_RN — cuatro valores
 * inventados apilados, camino a una entrega real.
 */
export function generatesFiles(tipo: string | undefined): boolean {
  return tipoGroup(tipo) !== "copies";
}

/**
 * El spec HERMANO: otra versión (variar), adaptar a otro formato y la corrección de un resultado
 * nacen como una fila NUEVA de prisma_specs a partir de una existente. Antes cada sitio copiaba
 * las columnas a mano y cada uno eligió las suyas (F5a: una versión de una corrección perdió
 * `correccion_de`). Aquí vive el ÚNICO conjunto de columnas que viajan. Módulo puro (se prueba en node).
 */
import type { PrismaSpecRow } from "../database.types.ts";

/** Todas las columnas que se escriben al insertar, TODAS obligatorias (`-?`): cuando una
 *  migración agrega una columna a PrismaSpecRow, tsc falla en `filaHermana` hasta que alguien
 *  decida si hereda, se reemplaza o nace vacía. Ése es el punto de este archivo. */
export type FilaHermana = { [K in keyof Omit<PrismaSpecRow, "id" | "created_at">]-?: PrismaSpecRow[K] };

/** Lo que el sitio que clona SIEMPRE decide (spec, herramienta, quién) y lo que PUEDE cambiar. */
export type CambiosHermana = {
  spec: Record<string, unknown>;
  tool: string;
  created_by: string;
} & Partial<Pick<FilaHermana, "job" | "destino" | "refs" | "correccion_de">>;

export function filaHermana(origen: PrismaSpecRow, c: CambiosHermana): FilaHermana {
  return {
    // Heredan: el cliente, la marca y la idea son los del original.
    client_id: origen.client_id,
    marca_id: origen.marca_id,
    idea: origen.idea,
    job: c.job ?? origen.job,
    destino: c.destino ?? origen.destino,
    refs: c.refs ?? origen.refs,
    // 0070: una versión o una adaptación de una corrección sigue siendo una corrección.
    correccion_de: c.correccion_de ?? origen.correccion_de ?? null,
    // Nuevas: lo que el sitio calculó.
    spec: c.spec,
    tool: c.tool,
    created_by: c.created_by,
    // 0066: el enlace al spec del que nace.
    origen_spec_id: origen.id,
    // 0067: la entrevista fue UNA, la de la idea original — el informe la cuenta una vez por idea.
    // (Ni refinar ni otra versión leen esta columna: las respuestas ya están aplicadas en el spec.)
    respuestas: [],
  };
}

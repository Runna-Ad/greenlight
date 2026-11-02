import type { PrismaCharacterRow } from "../database.types.ts";
import type { RefRole, VisualDNA } from "./spec.ts";

/**
 * HÜE Prisma — personajes / productos guardados (prisma_characters): la persona, el
 * producto o la mascota que se repite, con UNA descripción fija (en inglés) que entra
 * como "sujeto" de cada prompt. Módulo puro: lo usan la página (servidor), las actions
 * y el estudio (cliente).
 */

/** Un personaje como lo ve el estudio: foto ya firmada y sabiendo si es mío. */
export type PersonajeUI = {
  id: string;
  name: string;
  client_id: string;
  descripcion: string;
  foto: { storage_path: string; url: string } | null;
  mio: boolean;
};

export function personajeUI(row: PrismaCharacterRow, url: string | null, soyId: string | null): PersonajeUI {
  return {
    id: row.id,
    name: row.name,
    client_id: row.client_id,
    descripcion: row.descripcion,
    // Sin URL firmada la foto no se puede enseñar ni usar: cuenta como "sin foto".
    foto: row.storage_path && url ? { storage_path: row.storage_path, url } : null,
    mio: !!soyId && row.created_by === soyId,
  };
}

/** Una referencia en el estudio (la misma forma que RefLocal en ref-uploader.tsx). */
export type RefFoto = { role: RefRole; storage_path: string; caption: string | null; dna: VisualDNA | null; url: string; aviso: string | null };
export type RefsMapa = Partial<Record<RefRole, RefFoto | null>>;

/** A qué slot le puede prestar su foto un personaje: la persona primero, si no el producto. */
export function slotParaFoto(roles: readonly RefRole[]): RefRole | null {
  return roles.includes("sujeto") ? "sujeto" : roles.includes("producto") ? "producto" : null;
}

/**
 * Al elegir (o soltar) un personaje: su foto entra al slot si está VACÍO y sale al
 * soltarlo — pero SÓLO si el slot sigue trayendo su foto. Lo que subió el diseñador con
 * sus manos no se toca nunca. Puro y sin React para poder probarlo en node.
 */
export function aplicarFotoDePersonaje(
  refs: RefsMapa,
  anterior: PersonajeUI | null,
  nuevo: PersonajeUI | null,
  slot: RefRole | null,
  marcado: RefRole | null,
  fotoLocal: RefFoto | null = null,
): { refs: RefsMapa; marcado: RefRole | null } {
  let out = refs;
  if (marcado && anterior?.foto && out[marcado]?.storage_path === anterior.foto.storage_path) {
    out = { ...out, [marcado]: null };
  }
  const foto = nuevo?.foto ?? null;
  if (foto && slot && !out[slot]) {
    // Si la foto se acaba de subir en esta sesión, ya traemos lo que H.Ü.E vio en ella.
    const local = fotoLocal && fotoLocal.storage_path === foto.storage_path ? fotoLocal : null;
    return {
      refs: { ...out, [slot]: { role: slot, storage_path: foto.storage_path, caption: local?.caption ?? null, dna: local?.dna ?? null, url: foto.url, aviso: null } },
      marcado: slot,
    };
  }
  return { refs: out, marcado: null };
}

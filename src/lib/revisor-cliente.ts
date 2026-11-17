// Revisor del cliente por tarea (0099, Pedro 2026-11-17) — reglas puras, sin base de datos.
//
// Cada tarea puede tener UN revisor del lado del cliente: un usuario del portal de esa empresa.
// No es obligatorio. Quién lo pone y cuándo:
//   · el CLIENTE (cualquier usuario de esa empresa): a sí mismo o a un compañero, en cuanto la
//     pieza aparece en su portal (también «En producción»), y lo cambia o lo quita cuando quiera;
//   · ADMIN / MASTER: sólo con la tarjeta en «Con Cliente» (published) o «En cambios»
//     (in_corrections), para destrabarla si el revisor ya no está disponible.
// Lead y especialista no. El revisor se queda entre rondas.
//
// La acción (revisor-cliente-actions.ts) es la ÚNICA puerta, la usen el portal o el tablero.

import type { ViewRole } from "@/lib/roles";
import type { AssetStatus } from "@/lib/brand";

/** Estados en los que el equipo (admin/master) puede poner o cambiar el revisor. */
export const ESTADOS_REVISOR_EQUIPO: readonly AssetStatus[] = ["published", "in_corrections"];

export const MSG_REVISOR = {
  sinPermiso: "No tienes permiso para cambiar el revisor de esta tarea.",
  fueraDeEstado: "El equipo sólo puede cambiar el revisor con la tarea en «Con Cliente» o «En cambios».",
  noEnPortal: "Esta pieza todavía no aparece en tu portal.",
  sinCliente: "Esta tarea no tiene cliente.",
  revisorInvalido: "Esa persona no es un usuario activo de esta empresa.",
  noExiste: "La tarea no existe o está en la papelera.",
} as const;

/** Los mismos textos en tablero, tarea y portal. */
export const REVISOR_ETIQUETA = "Revisor del cliente";
export const REVISOR_VACIO = "Sin revisor";

/** Un usuario del portal, como se pinta en la pastilla y en el selector. */
export type PersonaCliente = { id: string; name: string };

export type QuienAsigna ={ role: ViewRole; clientId: string | null };

export type TareaParaRevisor = {
  status: AssetStatus;
  borrada: boolean;
  /** Empresa de la tarea (briefs.client_id, o marcas.client_id de respaldo). */
  clientId: string | null;
  /** ¿La pieza está en la lista del portal de ESE cliente? (lo decide el cargador del portal) */
  enPortal: boolean;
};

/** null = puede; si no, el mensaje para el usuario. */
export function motivoNoPuedeAsignar(quien: QuienAsigna, t: TareaParaRevisor): string | null {
  if (t.borrada) return MSG_REVISOR.noExiste;
  if (!t.clientId) return MSG_REVISOR.sinCliente;
  if (quien.role === "client") {
    if (!quien.clientId || quien.clientId !== t.clientId) return MSG_REVISOR.sinPermiso;
    return t.enPortal ? null : MSG_REVISOR.noEnPortal;
  }
  if (quien.role === "master" || quien.role === "admin") {
    return ESTADOS_REVISOR_EQUIPO.includes(t.status) ? null : MSG_REVISOR.fueraDeEstado;
  }
  return MSG_REVISOR.sinPermiso;
}

export type PerfilRevisor = { role: string; active: boolean; client_id: string | null };

/** ¿Este perfil puede ser (o seguir siendo) el revisor de una tarea de `clientId`? Se usa al
 *  escribir y también al LEER: un revisor dado de baja o movido de empresa cuenta como «Sin asignar». */
export function revisorValido(p: PerfilRevisor | null | undefined, clientId: string | null): boolean {
  return !!p && !!clientId && p.role === "client" && p.active && p.client_id === clientId;
}

/** ¿Pide atención en el tablero? Tarjeta en «Con Cliente» sin revisor válido. */
export function faltaRevisor(status: AssetStatus, tieneRevisor: boolean): boolean {
  return status === "published" && !tieneRevisor;
}

/** Cookie del interruptor «Mis tareas» (sólo preferencia de vista; el servidor filtra). */
export const COOKIE_MIS_TAREAS = "gl_mis_tareas";

/** «Mis tareas» del portal: con el interruptor encendido sólo quedan las del usuario. */
export function filtrarMias<T extends { id: string }>(
  items: T[],
  revisorDe: Record<string, { id: string } | null | undefined>,
  yo: string | null,
  soloMias: boolean,
): T[] {
  if (!soloMias || !yo) return items;
  return items.filter((i) => revisorDe[i.id]?.id === yo);
}

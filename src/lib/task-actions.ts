// Qué botón ve cada quien en una tarjeta, según estado × rol × si es su tarea.
//
// Función pura y probada aparte, para que el componente sólo renderice. La misma
// lista alimenta el tablero y /mi-trabajo: si cada pantalla decidiera por su
// cuenta, acabarían ofreciendo acciones distintas para la misma tarea.
//
// Esto NO reemplaza el arrastre ni el menú "Mover" — esos siguen siendo la
// escotilla del lead. Esto es el camino normal: el trabajo empuja la tarjeta.

import type { AssetStatus } from "./brand";
import type { ViewRole } from "./roles";

export type TaskAction = {
  /** Estado destino. La BD sigue siendo la autoridad (rpc_move_task). */
  to: AssetStatus;
  label: string;
  tone: "primary" | "danger";
  /** Pide un texto obligatorio antes de ejecutarse. */
  needsBody?: boolean;
  /** Qué RPC semántica la ejecuta. */
  verb: TaskVerb;
};

/**
 * Los verbos existen como tipo aparte para que quien ejecute use un mapa
 * EXHAUSTIVO (Record<TaskVerb, …>): un verbo nuevo sin implementar debe ser
 * error de compilación, no un `else` que cae en la acción equivocada.
 */
export type TaskVerb =
  | "start"
  | "submit_review"
  | "request_changes"
  | "approve"
  | "send_client";

export type TaskContext = {
  isAssignee: boolean;
  role: ViewRole;
  /** Sin responsable no se puede empezar: primero hay que asignarla. */
  hasAssignee: boolean;
};

// master = Master Builder, el tier sobre admin: se comporta como lead para el
// flujo (aprobar, pedir cambios, enviar a cliente). Sin esto un master no veía
// "Enviar a cliente" en una tarea completada.
const isLead = (role: ViewRole) => role === "master" || role === "admin" || role === "lead";

/**
 * Ojo con el orden: el primero es la acción principal de la tarjeta.
 * Devuelve [] cuando no toca hacer nada (p. ej. el creativo esperando revisión).
 */
export function actionsFor(status: AssetStatus, ctx: TaskContext): TaskAction[] {
  // El cliente nunca mueve trabajo interno.
  if (ctx.role === "client") return [];

  const puedeTrabajarla = ctx.isAssignee || isLead(ctx.role);

  switch (status) {
    case "todo":
      // Sin responsable no hay quién la empiece — la tarjeta ofrece asignar.
      if (!ctx.hasAssignee) return [];
      return puedeTrabajarla
        ? [{ to: "in_progress", label: "Empezar", tone: "primary", verb: "start" }]
        : [];

    case "in_progress":
      return puedeTrabajarla
        ? [
            {
              to: "under_review",
              label: "Mandar a revisión",
              tone: "primary",
              verb: "submit_review",
            },
          ]
        : [];

    case "under_review":
      // Sólo el lead resuelve una revisión. El asignado espera.
      return isLead(ctx.role)
        ? [
            { to: "completed", label: "Aprobar", tone: "primary", verb: "approve" },
            {
              to: "in_corrections",
              label: "Mandar cambios",
              tone: "danger",
              needsBody: true, // pedir cambios sin decir cuáles no sirve de nada
              verb: "request_changes",
            },
          ]
        : [];

    case "in_corrections":
      return puedeTrabajarla
        ? [{ to: "in_progress", label: "Retomar", tone: "primary", verb: "start" }]
        : [];

    case "completed":
      // Enviar al cliente es un paso APARTE de aprobar (decisión de Pedro):
      // dos puertas del lead, nada llega al cliente sin pasar por él.
      return isLead(ctx.role)
        ? [
            {
              to: "published",
              label: "Enviar a cliente",
              tone: "primary",
              verb: "send_client",
            },
          ]
        : [];

    // Entregar vive en el menú "Mover" (P7).
    default:
      return [];
  }
}

/** Texto para quien no tiene nada que pulsar pero necesita saber por qué. */
export function waitingLabel(status: AssetStatus, ctx: TaskContext): string | null {
  if (status === "under_review" && ctx.isAssignee && !isLead(ctx.role)) {
    return "Esperando revisión";
  }
  if (status === "todo" && !ctx.hasAssignee) return "Falta responsable";
  return null;
}

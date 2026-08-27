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
  /** La tarea está en `in_corrections` con cambios del CLIENTE enviados y SIN resolver.
   *  Esos son cancha del LEAD (él edita y reenvía, o reasigna); el especialista NO los
   *  retoma — la tarea sale de su lista por visibilidad hasta que se le reasigne. Las
   *  acciones del lead viven en la propia tarea (AccionesTarea), no en el tablero. */
  clientChangesPending?: boolean;
};

// master = Master Builder, el tier sobre admin: se comporta como lead para el
// flujo (aprobar, pedir cambios, enviar a cliente). Sin esto un master no veía
// "Enviar a cliente" en una tarea completada.
const isLead = (role: ViewRole) => role === "master" || role === "admin" || role === "lead";

/**
 * El ESPECIALISTA que ejecuta: asignado a la tarea y NO lead/admin/master.
 *
 * Los verbos de "doer" (empezar, mandar a revisión, retomar correcciones) son
 * SUYOS — nadie más los ve. El lead/admin/master es REVISOR: aprueba, pide
 * cambios y envía al cliente; NO produce, así que no tiene a quién mandarle una
 * revisión (se la mandaría a sí mismo). Decisión de Pedro (2026-08-21): un lead
 * viendo una tarea en progreso ya no ve "Mandar a revisión". Si necesita empujar
 * una tarea que hizo él mismo, usa el menú "Mover" (la escotilla del lead).
 */
const esEspecialista = (ctx: TaskContext) => ctx.isAssignee && !isLead(ctx.role);

/**
 * Las transiciones que un DOER (especialista) produce por el flujo normal:
 * empezar, mandar a revisión, retomar y devolver correcciones. CUALQUIER otra —
 * aprobar (→completed), enviar al cliente (→published), entregar (→delivered), pedir
 * cambios (under_review→in_corrections), o mover una tarea ya publicada — exige
 * autoridad de LEAD. Fuente ÚNICA compartida por el gate del servidor (`moveTask`) y
 * por el menú "Mover" del tablero, para que el ARRASTRE no salte lo que los BOTONES ya
 * bloquean (un creativo no puede auto-aprobar/publicar arrastrando su tarjeta).
 */
const DOER_TRANSITIONS = new Set<string>([
  "todo>in_progress",
  "in_progress>under_review",
  "in_corrections>in_progress",
  "in_corrections>under_review",
]);
export function transicionRequiereLead(from: AssetStatus, to: AssetStatus): boolean {
  return !DOER_TRANSITIONS.has(`${from}>${to}`);
}

/**
 * Ojo con el orden: el primero es la acción principal de la tarjeta.
 * Devuelve [] cuando no toca hacer nada (p. ej. el creativo esperando revisión,
 * o el lead esperando a que el especialista mande a revisión).
 */
export function actionsFor(status: AssetStatus, ctx: TaskContext): TaskAction[] {
  // El cliente nunca mueve trabajo interno.
  if (ctx.role === "client") return [];

  switch (status) {
    case "todo":
      // Sin responsable no hay quién la empiece — la tarjeta ofrece asignar.
      if (!ctx.hasAssignee) return [];
      return esEspecialista(ctx)
        ? [{ to: "in_progress", label: "Empezar", tone: "primary", verb: "start" }]
        : [];

    case "in_progress":
      return esEspecialista(ctx)
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
      // Sólo el lead/admin/master resuelve una revisión. El especialista espera.
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
      // Cambios del CLIENTE → cancha del LEAD: se resuelven DENTRO de la tarea
      // (AccionesTarea: "Enviar a cliente" / "Reasignar"). En el tablero no hay botón
      // inline, y el especialista ni la ve (visibilidad). Cambios pedidos por el LEAD
      // (sin bandera) → el especialista los RETOMA como siempre.
      if (ctx.clientChangesPending) return [];
      return esEspecialista(ctx)
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
  // Cambios del cliente esperando al lead: en el tablero se marca (el lead los
  // resuelve abriendo la tarea). El especialista no llega aquí (no la ve).
  if (status === "in_corrections" && ctx.clientChangesPending && isLead(ctx.role)) {
    return "Cambios del cliente";
  }
  if (status === "todo" && !ctx.hasAssignee) return "Falta responsable";
  return null;
}

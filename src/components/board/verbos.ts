// El despacho verbo → server action, en UN solo lugar y EXHAUSTIVO.
//
// Antes cada componente resolvía el verbo con una cadena de ternarios cuyo
// else final era approveTask(): un verbo nuevo sin cablear habría APROBADO en
// silencio en vez de fallar. Con Record<TaskVerb, …>, un verbo sin implementar
// es error de compilación.

import {
  approveTask,
  requestChanges,
  sendToClient,
  startTask,
  submitForReview,
  type ActionResult,
} from "@/app/(app)/[cliente]/tablero/actions";
import type { TaskVerb } from "@/lib/task-actions";

export const EJECUTA_VERBO: Record<
  TaskVerb,
  (ideaId: string, body?: string) => Promise<ActionResult>
> = {
  start: (id) => startTask(id),
  submit_review: (id) => submitForReview(id),
  request_changes: (id, body) => requestChanges(id, body ?? ""),
  approve: (id) => approveTask(id),
  send_client: (id, body) => sendToClient(id, body),
};

/** Qué confirmar en pantalla cuando el verbo sale bien. */
export const TOAST_VERBO: Partial<Record<TaskVerb, string>> = {
  submit_review: "Mandada a revisión — el lead ya tiene el aviso.",
  request_changes: "Cambios pedidos — quien la trabaja ya tiene el aviso.",
  approve: "Aprobada.",
  // El botón dice la verdad: el portal del cliente todavía no existe, así que
  // "enviada" significa lista para el cliente, no visible para él.
  send_client: "Enviada al cliente. El portal aún no existe: avísale tú, la app todavía no puede.",
};

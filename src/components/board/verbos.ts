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
  // El portal del cliente YA existe y funciona; lo que falta es el AVISO automático
  // al cliente (llega con el login/binding cliente↔sesión). Así que "enviada" = ya
  // visible en su portal, pero por ahora el lead le comparte el link a mano.
  send_client: "Enviada al cliente. Ya puede revisarla en su portal — compártele el link; el aviso automático llegará con el login del cliente.",
};

// Lógica PURA de ruteo de emails de notificación (sin server, testeable).
// Dos compuertas, como SnapTrack: (1) el TIPO de notificación puede emailear;
// (2) la persona tiene el email activado y una dirección. In-app siempre le llega.

/** Los tipos EMAILEABLES (el resto sólo in-app). Es el catálogo — el DEFAULT cuando
 *  la persona no tiene una fila de preferencia; su fila por-evento (0050) manda. */
export const EMAIL_TYPES = new Set<string>([
  "task_assigned", // "se te asignó una tarea" → al asignado (evento nuevo, 0050)
  "brief_created", // "nuevo brief, tienes X tareas" → a cada especialista asignado
  "task_submitted", // "lista para revisar" → a leads
  "task_changes_requested", // "te pidieron cambios" → al asignado
  "task_approved", // "tu tarea fue aprobada" → al asignado
  "task_published", // "se envió al cliente" → al asignado
  "ready_for_review", // "lista para TU revisión" → al CLIENTE (0051)
]);

export function tipoEmailea(type: string | null | undefined): boolean {
  return !!type && EMAIL_TYPES.has(type);
}

const esEmail = (v: string | null | undefined): boolean =>
  !!v && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

/**
 * ¿Se manda email para esta entrega? "send" o "skip" (con la razón). Dos compuertas:
 *   1) el EVENTO emailea para ESTA persona: su preferencia por-evento (`eventPref`, de
 *      notification_prefs) MANDA; si no tiene fila (undefined) → default del catálogo.
 *   2) `notify_email` maestro encendido + email válido.
 * In-app siempre le llega (amplio); esto sólo gobierna el email.
 */
export function decisionEmail(args: {
  type: string | null | undefined;
  notifyEmail: boolean;
  email: string | null | undefined;
  /** Preferencia por-evento de la persona (notification_prefs.email). undefined = sin fila → default. */
  eventPref?: boolean | null;
  /**
   * El aviso es de una tarea SUYA (va dirigido a la persona ASIGNADA, no a un rol).
   * Se deriva de `notifications.recipient_member_id`: el fan_out sólo lo llena en las
   * ramas de ASIGNADOS; las de alcance/rol y los watchers dejan el member en null.
   */
  esMiTarea?: boolean;
}): { enviar: boolean; razon: string } {
  // Lo TUYO siempre te llega por correo. La preferencia por-evento gobierna el
  // volumen de lo que pasa en tu ALCANCE ("avísame de cada tarea que se manda a
  // revisión"), no lo que pasa en la tarea que llevas tú.
  // Sin esto, un admin/master no recibía NADA por correo: la siembra de 0050 sólo
  // encendió eventos para `lead` y `creative`, y dejó admin/master en false para
  // todo — se escribió cuando un admin no podía ser lead de una tarea. Desde que
  // sí puede (2026-09-01), ese default lo dejaba mudo sobre su propio trabajo.
  // El interruptor MAESTRO (`notify_email`) sigue mandando: quien apaga el correo,
  // lo apaga entero.
  const emailea = args.esMiTarea ? true : args.eventPref ?? tipoEmailea(args.type);
  if (!emailea) return { enviar: false, razon: "evento no emailea (pref/def)" };
  if (!args.notifyEmail) return { enviar: false, razon: "persona desactivó email" };
  if (!esEmail(args.email)) return { enviar: false, razon: "sin email válido" };
  return { enviar: true, razon: args.esMiTarea ? "ok (tarea propia)" : "ok" };
}

import "server-only";

import { dispatchPendingEmails } from "@/lib/notif-email";
import { dispatchPendingSlack } from "@/lib/notif-slack";

/**
 * Manda lo que esté en cola por TODOS los canales (correo y Slack). Es lo que se llama
 * después de cada cambio de estado; un canal que falla no frena al otro.
 */
export async function despacharAvisos() {
  const [correo, slack] = await Promise.allSettled([dispatchPendingEmails(), dispatchPendingSlack()]);
  if (correo.status === "rejected") console.error("[avisos] el correo reventó:", correo.reason);
  if (slack.status === "rejected") console.error("[avisos] Slack reventó:", slack.reason);
  return {
    correo: correo.status === "fulfilled" ? correo.value : null,
    slack: slack.status === "fulfilled" ? slack.value : null,
  };
}

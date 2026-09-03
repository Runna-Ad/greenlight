// Live refresh (0062): el canal privado de Realtime de CADA persona. Debe coincidir
// EXACTAMENTE con el topic que emite `produccion.live_emit` en SQL
// ('greenlight:user:' || profile_id) y con la policy `greenlight_live_propio`.
// Módulo puro (sin imports de servidor) para poder probarse con el harness node.

export const LIVE_TOPIC_PREFIX = "greenlight:user:";

/** El evento que emite el trigger — un solo tipo: "algo cambió, re-lee". */
export const LIVE_EVENT = "cambio";

export function liveTopic(profileId: string): string {
  return `${LIVE_TOPIC_PREFIX}${profileId}`;
}

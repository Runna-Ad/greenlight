import { ARCHIVO_MAX, DETALLE_MAX, textoCorto, type EventoActividad } from "./actividad";

/**
 * Anota en la bitácora de Admin › Actividad (0091) algo que hizo la persona en el navegador. Se dispara y se olvida:
 * nunca lanza ni espera, y `keepalive` deja salir el pedido aunque la página se esté cerrando. Sin red, el evento se pierde
 * (límite aceptado). La persona la pone el servidor con la sesión; no se manda.
 */
export function anotarActividad({ accion, archivo, cliente, detalle }: EventoActividad): void {
  try {
    void fetch("/api/prisma/formatos/actividad", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accion, archivo: textoCorto(archivo, ARCHIVO_MAX), cliente: cliente ?? null, detalle: textoCorto(detalle, DETALLE_MAX) }),
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch {
    // Anotar nunca le estorba a quien está trabajando.
  }
}

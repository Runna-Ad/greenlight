// Correcciones localizadas — lógica pura (sin React ni Supabase), para poder
// probarla con el harness de node y compartirla entre servidor y cliente.
//
// Una corrección apunta a un CAMPO exacto (tabla + fila + campo) y lleva dos
// estados de resolución que se combinan en tres:
//   open   (rojo)  — sin atender
//   done   (ámbar) — el especialista la marcó atendida, falta que el revisor confirme
//   closed (verde) — el revisor la confirmó

export type EstadoCorreccion = "open" | "done" | "closed";

// --- Estilo compartido de correcciones (usado por campo.tsx y campo-correcciones.tsx) ---
// Fondo SÓLIDO del pin / chip de estado (texto blanco encima). Un pelín más oscuro
// que el token para que el blanco pase AA (lección de contraste: los tonos medios
// fallan blanco Y oscuro). Son sólo cadenas CSS — sin React — así que viven aquí,
// en una fuente única, en vez de duplicarse por componente.
export const PIN_BG: Record<EstadoCorreccion, string> = {
  open: "color-mix(in srgb, var(--status-corrections) 78%, #000)",
  done: "color-mix(in srgb, var(--status-progress) 80%, #000)",
  closed: "color-mix(in srgb, var(--status-completed) 92%, #000)",
};

// Fondo del <mark> del resaltado de una frase corregida: un tinte del color de
// estado. Fuente única para el editor (Campo) y la vista de lectura (CampoLectura),
// para que no se separen.
export const MARCA: Record<EstadoCorreccion, string> = {
  open: "color-mix(in srgb, var(--status-corrections) 32%, transparent)",
  done: "color-mix(in srgb, var(--status-progress) 34%, transparent)",
  closed: "color-mix(in srgb, var(--status-completed) 30%, transparent)",
};

/** Etiqueta legible del estado de resolución de una corrección. */
export const ETIQUETA_ESTADO: Record<EstadoCorreccion, string> = {
  open: "Sin atender",
  done: "Atendido · por confirmar",
  closed: "Confirmado",
};

export type Correccion = {
  id: string;
  targetTabla: string | null;
  targetFilaId: string | null;
  targetCampo: string | null;
  targetLabel: string | null;
  /** Ancla por selección: el texto citado + offsets best-effort (null = campo entero). */
  targetQuote: string | null;
  targetStart: number | null;
  targetEnd: number | null;
  body: string;
  autor: string | null;
  ronda: number;
  estado: EstadoCorreccion;
  /** Tipo de cambio (rúbrica). null en cambios de cliente / legacy sin etiqueta. */
  categoria: string | null;
  /** true = lo pidió el CLIENTE desde el portal (kind='client_change'). Es una
   *  corrección de PRIMERA CLASE — MISMO lifecycle (atendido/confirmar/descartar),
   *  gate de aprobación y rondas que una interna (0038). Este flag SÓLO cambia la
   *  presentación: badge "Cliente" en vez de la categoría de rúbrica, y sin veredicto
   *  de H.Ü.E (los cambios del cliente no puntúan en Evaluación). */
  cliente?: boolean;
  /** Hilo INTERNO lead ↔ especialista (0082), en orden. Sólo lo llena la página interna
   *  de la tarea; el portal del cliente nunca lo carga. */
  respuestas?: RespuestaCorreccion[];
};

export type RespuestaCorreccion = {
  id: string;
  body: string;
  autor: string | null;
  createdAt: string;
  /** La escribió el cliente desde su portal (0083). */
  deCliente?: boolean;
  /** La escribió el equipo PARA el cliente (0083): el cliente la ve. */
  paraCliente?: boolean;
};

/** A quién va una respuesta del EQUIPO: al cliente (la ve en su portal) o sólo al equipo. */
export type DestinoRespuesta = "cliente" | "equipo";

/**
 * La regla de Pedro (2026-10-27), automática por etapa — FUENTE ÚNICA: la usa el server
 * al guardar y el panel para el letrero "Va para". (El cliente no pasa por aquí: lo suyo
 * siempre va al lead.)
 *   · Cambio interno, o quien escribe es especialista → equipo.
 *   · Cambio del cliente aún en la cancha del lead → el lead le contesta AL CLIENTE.
 *   · Ya se lo pasó a un especialista → equipo… salvo que lo último del hilo lo haya
 *     escrito el cliente: entonces el lead le está contestando a él.
 *   · Si la pieza NO está a la vista en su portal (regresó a producción interna, papelera),
 *     nada le llega al cliente: queda en el equipo.
 */
export function destinoRespuesta(a: {
  cambioDelCliente: boolean;
  esLead: boolean;
  enCanchaDelLead: boolean;
  ultimaDeCliente: boolean;
  piezaEnPortal: boolean;
}): DestinoRespuesta {
  if (!a.cambioDelCliente || !a.esLead || !a.piezaEnPortal) return "equipo";
  return a.enCanchaDelLead || a.ultimaDeCliente ? "cliente" : "equipo";
}

/** Tope de una respuesta del hilo — el mismo que el CHECK de 0082. */
export const RESPUESTA_MAX = 2000;

/** El estado de una fila de `comments` a partir de sus timestamps. */
export function estadoDeTimestamps(row: {
  atendido_at: string | null;
  resolved_at: string | null;
}): EstadoCorreccion {
  if (row.resolved_at) return "closed";
  if (row.atendido_at) return "done";
  return "open";
}

/** La llave estable de un campo, para agrupar/ubicar correcciones. */
export const keyCampo = (
  tabla: string | null,
  filaId: string | null,
  campo: string | null,
): string => `${tabla ?? ""}::${filaId ?? ""}::${campo ?? ""}`;

/** Estado agregado de un campo con varias correcciones: open > done > closed. */
export function estadoCampo(cs: Correccion[]): EstadoCorreccion | null {
  if (!cs.length) return null;
  if (cs.some((c) => c.estado === "open")) return "open";
  if (cs.some((c) => c.estado === "done")) return "done";
  return "closed";
}

/** Correcciones vivas de un campo (las de la ronda actual, sin cerrar historial). */
export function porCampo(correcciones: Correccion[]): Map<string, Correccion[]> {
  const m = new Map<string, Correccion[]>();
  for (const c of correcciones) {
    const k = keyCampo(c.targetTabla, c.targetFilaId, c.targetCampo);
    (m.get(k) ?? m.set(k, []).get(k)!).push(c);
  }
  return m;
}

/** Cuántas correcciones siguen sin resolver (rojas o ámbar). */
export const sinResolver = (cs: Correccion[]): number =>
  cs.filter((c) => c.estado !== "closed").length;

/** Cuántas siguen abiertas (rojas, sin atender). El botón del lead mira esto. */
export const abiertas = (cs: Correccion[]): number =>
  cs.filter((c) => c.estado === "open").length;

export type Resaltado = { id: string; start: number; end: number; estado: EstadoCorreccion };

/**
 * Rangos a resaltar sobre el texto ACTUAL de un campo (best-effort, maneja la
 * edición): si el offset guardado sigue apuntando al quote, se usa; si no, se
 * re-encuentra el quote por contenido; si ya no existe en el texto, no se
 * resalta (el quote sigue en el panel). Se quitan solapes (el primero gana).
 */
export function resaltadosEnTexto(valor: string, cs: Correccion[]): Resaltado[] {
  const found: Resaltado[] = [];
  for (const c of cs) {
    if (!c.targetQuote) continue;
    let start = -1;
    if (
      c.targetStart != null &&
      c.targetEnd != null &&
      valor.slice(c.targetStart, c.targetEnd) === c.targetQuote
    ) {
      start = c.targetStart;
    } else {
      const i = valor.indexOf(c.targetQuote);
      if (i >= 0) start = i;
    }
    if (start >= 0) found.push({ id: c.id, start, end: start + c.targetQuote.length, estado: c.estado });
  }
  found.sort((a, b) => a.start - b.start);
  const limpio: Resaltado[] = [];
  let lastEnd = -1;
  for (const r of found) if (r.start >= lastEnd) { limpio.push(r); lastEnd = r.end; }
  return limpio;
}

/** Agrupa por ronda, descendente (la actual primero). */
export function porRonda(correcciones: Correccion[]): { ronda: number; items: Correccion[] }[] {
  const m = new Map<number, Correccion[]>();
  for (const c of correcciones) (m.get(c.ronda) ?? m.set(c.ronda, []).get(c.ronda)!).push(c);
  return [...m.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([ronda, items]) => ({ ronda, items }));
}

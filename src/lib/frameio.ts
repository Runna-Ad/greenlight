// El link de Frame.io de una tarea (Pedro 2026-11-19): reusa la columna `ideas.entrega_url`,
// que nadie llenaba. Sólo lo ve el equipo. Puro, sin BD, para probarlo en test-lib.

/** ¿El link es de Frame.io? (frame.io, cualquier subdominio, o el corto f.io). */
export function esLinkFrameio(raw: string): boolean {
  try {
    const host = new URL(raw.trim()).hostname.toLowerCase();
    return host === "frame.io" || host.endsWith(".frame.io") || host === "f.io";
  } catch {
    return false;
  }
}

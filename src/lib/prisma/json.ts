/**
 * Lo que devuelve un tool_use no siempre viene con la forma del schema: a veces el modelo
 * manda una lista como STRING JSON ("preguntas": "{\"preguntas\":[…]}") o envuelta en un
 * objeto con la misma clave. Sin esto, un saneo que exige Array.isArray tira TODO en silencio
 * (2026-09-14: H.Ü.E hacía tres preguntas y el diseñador no veía ninguna). Módulo puro.
 */

/** La lista que hay dentro de `raw`, sea array, string JSON o objeto envoltorio {clave: […]}. */
export function listaDe(raw: unknown, clave?: string, profundidad = 0): unknown[] {
  if (profundidad > 3) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s.startsWith("[") && !s.startsWith("{")) return [];
    try {
      return listaDe(JSON.parse(s) as unknown, clave, profundidad + 1);
    } catch {
      return [];
    }
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (clave && clave in o) return listaDe(o[clave], clave, profundidad + 1);
    // Un objeto con UNA sola clave cuyo valor es lista/string: se desenvuelve.
    const claves = Object.keys(o);
    if (claves.length === 1) return listaDe(o[claves[0]], clave, profundidad + 1);
  }
  return [];
}

/** Un objeto que puede venir como string JSON. */
export function objetoDe(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      const o = JSON.parse(raw) as unknown;
      return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

// Whitelist de CAMPOS editables por tabla + los tipos de tabla que la usan.
//
// Vive AQUÍ, fuera de `tareas/[id]/actions.ts`, porque ese archivo es `"use server"`
// y un módulo de server actions SÓLO puede exportar funciones async: exportar esta
// constante desde ahí revienta EN RUNTIME (module evaluation), no en el build —
// «A "use server" file can only export async functions, found object» — y tumba la
// PRIMERA server action que se invoque en la ruta. (Mismo motivo que lib/papelera.ts
// y lib/equipo.ts; `scripts/check-server-actions.mjs` lo vigila desde ahora.)

export type Tabla = "planos" | "estaticos";

/** Tablas cuyos campos autoguarda `guardarCampo` — incluye las de Copies. `Campo` y las
 *  correcciones usan `Tabla` (planos/estaticos); Copies usa su propio campo (CampoCopy). */
export type TablaGuardable = Tabla | "copies_temas" | "copies";

/**
 * Whitelist en el SERVIDOR. El nombre del campo llega del cliente y termina
 * dentro de un identificador SQL — jamás se interpola algo que no esté aquí.
 * La comparten `guardarCampo` (escritura) y `aplicarOrtografia` (lectura previa),
 * para que ambos validen contra la MISMA lista y no puedan driftar.
 */
export const CAMPOS: Record<TablaGuardable, Set<string>> = {
  planos: new Set([
    "titulo", "hook_narrativo", "hook_visual", "accion",
    "copy_in", "sfx", "gfx", "edicion", "dialogo",
  ]),
  estaticos: new Set([
    "copy_titulo", "copy_subtitulo", "copy_cta", "legales_extra",
    "referencia_url", "referencia_nota", "notas",
  ]),
  copies_temas: new Set(["tema"]),
  copies: new Set(["headline", "descripcion"]),
};

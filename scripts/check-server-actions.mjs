// Un módulo `"use server"` SÓLO puede exportar funciones async.
//
// POR QUÉ ESTE GUARD EXISTE: exportar cualquier otra cosa (una constante, una clase,
// una función sync) NO falla el build cuando sólo la importan otros archivos de
// servidor — falla EN RUNTIME, al evaluar el módulo:
//
//   Error: A "use server" file can only export async functions, found object.
//
// …y tumba la PRIMERA server action que se invoque en esa ruta, con un 500 y una
// pantalla de "Algo salió mal" que no dice nada. Pasó en producción el 2026-09-01:
// un `export const CAMPOS` en `tareas/[id]/actions.ts` dejó muerto el borrado de
// tareas (y cualquier otra acción de esa página). El build había pasado en verde.
//
// Next SÍ lo caza en build cuando el símbolo cruza a un componente CLIENTE — por eso
// el mismo error con `DIAS_RETENCION` sí reventó el build. Es decir: el build cubre
// unos casos y otros no. Este guard cubre TODOS, en `npm test` y en CI.
//
// La solución siempre es la misma: mover la constante/tipo a un módulo puro
// (`src/lib/campos.ts`, `src/lib/papelera.ts`, `src/lib/equipo.ts`) e importarla.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = "src";
const archivos = [];
(function recorrer(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) recorrer(p);
    else if (/\.tsx?$/.test(p)) archivos.push(p);
  }
})(RAIZ);

/** ¿La PRIMERA sentencia real del archivo es la directiva "use server"?
 *  (Buscar la cadena a secas daría falsos positivos: varios módulos la MENCIONAN
 *  en un comentario justamente para explicar esta regla.) */
function esServerActions(src) {
  const lineas = src.split("\n");
  let enBloque = false;
  for (const cruda of lineas) {
    const l = cruda.trim();
    if (!l) continue;
    if (enBloque) {
      if (l.includes("*/")) enBloque = false;
      continue;
    }
    if (l.startsWith("//")) continue;
    if (l.startsWith("/*")) {
      if (!l.includes("*/")) enBloque = true;
      continue;
    }
    return /^["']use server["'];?$/.test(l);
  }
  return false;
}

let problemas = 0;
for (const archivo of archivos) {
  const src = readFileSync(archivo, "utf8");
  if (!esServerActions(src)) continue;

  src.split("\n").forEach((cruda, i) => {
    const l = cruda.trim();
    const donde = `${archivo}:${i + 1}`;

    // Permitido: `export async function`, `export type`, `export interface`,
    // `export type { … }`. Todo lo demás que exporte un VALOR es una bomba de runtime.
    if (/^export\s+(const|let|var|class)\s/.test(l)) {
      console.error(`🚨 ${donde} exporta un VALOR desde un archivo "use server": ${l.slice(0, 80)}`);
      problemas++;
    } else if (/^export\s+function\s/.test(l)) {
      console.error(`🚨 ${donde} exporta una función SYNC (debe ser async): ${l.slice(0, 80)}`);
      problemas++;
    } else if (/^export\s*\{/.test(l) && !/^export\s+type\s*\{/.test(l)) {
      console.error(`🚨 ${donde} re-exporta valores (usa \`export type {…}\` si son tipos): ${l.slice(0, 80)}`);
      problemas++;
    } else if (/^export\s+default\s/.test(l) && !/^export\s+default\s+async\s/.test(l)) {
      console.error(`🚨 ${donde} export default no-async: ${l.slice(0, 80)}`);
      problemas++;
    }
  });
}

const serverFiles = archivos.filter((a) => esServerActions(readFileSync(a, "utf8"))).length;
console.log(
  problemas === 0
    ? `\n✅ ${serverFiles} archivos "use server": todos exportan sólo funciones async\n`
    : `\n❌ ${problemas} export(s) inválido(s) en archivos "use server" — muévelos a un módulo puro (src/lib/…)\n`,
);
process.exit(problemas === 0 ? 0 : 1);

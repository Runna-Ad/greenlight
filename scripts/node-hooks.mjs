// Hooks de resolución para correr libs `server-only` de Next en node SUELTO (smokes
// contra el modelo o contra internet sin levantar Next ni tocar la BD):
//   `server-only` → módulo vacío · `@/x` → src/x.ts (Node 24 quita los tipos; JSX no).
// Uso (con el register, no directo — un `--import` de este archivo NO registra nada):
//   node --env-file=.env.local --import ./scripts/register-hooks.mjs mi-smoke.mjs
// Las libs bajo src/lib/** que importan supabase-admin NO están cubiertas: stubéalas
// aquí si hace falta (lección 2026-09-03).
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src") + "/";

export async function resolve(spec, ctx, next) {
  if (spec === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
  if (spec.startsWith("@/")) {
    const base = ROOT + spec.slice(2);
    // `.ts` antes que el nombre pelón: `@/lib/prisma/compilers` es un DIRECTORIO y un
    // archivo a la vez (compilers.ts no existe, compilers/index.ts sí) — sólo archivos.
    for (const c of [base + ".ts", base + ".tsx", base + "/index.ts", base]) {
      if (existsSync(c) && statSync(c).isFile()) return { url: pathToFileURL(c).href, shortCircuit: true };
    }
  }
  return next(spec, ctx);
}

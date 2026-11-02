// Registra scripts/node-hooks.mjs. Ver ahí el porqué y el uso.
import { register } from "node:module";
register("./node-hooks.mjs", import.meta.url);

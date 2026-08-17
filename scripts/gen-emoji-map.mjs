// Genera src/lib/emoji-map.ts — el mapa COMPLETO de shortcode → emoji real que usa
// limpiarPegado (src/lib/guion.ts) para que un guión pegado de Notion/Docs/Slack
// muestre 🧡 en vez de `:orange_heart:` o "orange heart".
//
// Fuente: emojibase-data (devDependency). Unimos TRES presets de shortcodes para
// cubrir todas las convenciones de nombre — github, iamcal (Slack) y emojibase — así
// `:shopping_bags:`, `:identification_card:`, `:thumbsup:`, `:+1:`, etc. resuelven
// todos. Regenerar tras subir emojibase-data:  node scripts/gen-emoji-map.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);

const data = require("emojibase-data/en/compact.json");
const presets = [
  require("emojibase-data/en/shortcodes/github.json"),
  require("emojibase-data/en/shortcodes/iamcal.json"),
  require("emojibase-data/en/shortcodes/emojibase.json"),
];

const byHex = Object.fromEntries(data.map((d) => [d.hexcode, d.unicode]));
const map = {};
for (const preset of presets) {
  for (const [hex, codes] of Object.entries(preset)) {
    const emoji = byHex[hex];
    if (!emoji) continue;
    for (const c of [].concat(codes)) {
      if (typeof c === "string") map[c.toLowerCase()] = emoji;
    }
  }
}

const entries = Object.keys(map)
  .sort()
  .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(map[k])},`)
  .join("\n");

const out =
  "// GENERADO por scripts/gen-emoji-map.mjs — NO editar a mano.\n" +
  "// Mapa shortcode → emoji (github + iamcal/Slack + emojibase). Regenerar:\n" +
  "//   node scripts/gen-emoji-map.mjs\n" +
  `// ${Object.keys(map).length} shortcodes.\n` +
  "export const EMOJI: Record<string, string> = {\n" +
  entries +
  "\n};\n";

writeFileSync(new URL("../src/lib/emoji-map.ts", import.meta.url), out);
console.log(`emoji-map.ts escrito: ${Object.keys(map).length} shortcodes`);

// Guards against secrets reaching the browser. Next serializes CLIENT COMPONENT
// PROPS into the RSC payload embedded in the HTML — so a secret passed as a prop
// ships to every visitor. This shipped once; never again.
// Usage: node scripts/check-leak.mjs <baseUrl>
const base = process.argv[2] ?? "http://localhost:3100";
const SECRETS = [process.env.SHEETS_SCRIPT_SECRET].filter(Boolean);
const PATHS = ["/didi/sync", "/didi/briefs/nuevo", "/clientes"];

if (!SECRETS.length) {
  console.log("⏭  sin secretos en el entorno — nada que comprobar");
  process.exit(0);
}

let leaked = 0;
for (const path of PATHS) {
  const res = await fetch(base + path, { cache: "no-store" });
  const html = await res.text();
  for (const s of SECRETS) {
    if (html.includes(s)) {
      console.error(`🚨 SECRETO FILTRADO en ${path}`);
      leaked++;
    }
  }
  // the script URL is also sensitive — it's the endpoint itself
  if (process.env.SHEETS_SCRIPT_URL && html.includes(process.env.SHEETS_SCRIPT_URL)) {
    console.error(`🚨 URL DEL SCRIPT FILTRADA en ${path}`);
    leaked++;
  }
  if (!leaked) console.log(`  ✓ ${path} limpio`);
}
console.log(leaked === 0 ? "\n✅ sin filtraciones\n" : `\n❌ ${leaked} filtración(es)\n`);
process.exit(leaked === 0 ? 0 : 1);

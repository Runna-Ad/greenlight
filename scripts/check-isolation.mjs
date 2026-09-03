// Greenlight shares a Supabase project with S.P.A.M (live outreach engine).
// Greenlight owns the `produccion` schema ONLY. This guard fails the build if a
// migration could touch anything outside it — S.P.A.M's `public` schema holds
// 42 live tables and must never be altered by us.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
const ALLOWED_SCHEMAS = new Set(["produccion", "auth", "extensions"]);

// Excepción ACOTADA (0062, live refresh): Realtime Broadcast vive en el esquema `realtime`
// de Supabase — es del proyecto, no de S.P.A.M, y S.P.A.M no usa Realtime Authorization.
// Se permiten SÓLO estos usos; cualquier otra mención de `realtime.` sigue siendo falla:
//   realtime.send(…) · realtime.topic() · to_regclass('realtime.messages')
//   · una policy cuyo nombre empiece por greenlight_ sobre realtime.messages
const REALTIME_OK = [
  /\brealtime\.send\s*\(/i,
  /\brealtime\.topic\s*\(\s*\)/i,
  /to_regclass\(\s*'realtime\.messages'\s*\)/i,
  /\bpolicy\s+(if\s+exists\s+)?greenlight_[a-z0-9_]+\s+on\s+realtime\.messages\b/i,
];
const realtimePermitido = (l) => REALTIME_OK.some((r) => r.test(l));

let problems = 0;
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

for (const file of files) {
  const sql = readFileSync(join(DIR, file), "utf8");
  const lines = sql.split("\n");

  lines.forEach((line, i) => {
    const l = line.trim();
    if (l.startsWith("--") || !l) return;
    const at = `${file}:${i + 1}`;

    // Any explicit mention of another schema is a hard fail.
    for (const m of l.matchAll(/\b(public|storage|realtime|vault|cron|net)\s*\./gi)) {
      if (m[1].toLowerCase() === "realtime" && realtimePermitido(l)) continue;
      console.error(`🚨 ${at} toca el esquema "${m[1]}": ${l.slice(0, 90)}`);
      problems++;
    }

    // DDL must always be schema-qualified, or it lands in the default schema.
    const ddl = l.match(
      /^(create|alter|drop)\s+(table|view|function|trigger|type|index|policy|sequence|materialized\s+view)\s+(if\s+not\s+exists\s+|if\s+exists\s+)?([a-z0-9_."]+)/i,
    );
    if (ddl) {
      const target = ddl[4].replace(/"/g, "");
      const isTrigger = /trigger/i.test(ddl[2]);
      const isPolicy = /policy/i.test(ddl[2]);
      const isIndex = /index/i.test(ddl[2]);
      // triggers/policies/indexes name the OBJECT first and the table later ("on produccion.x")
      if (isTrigger || isPolicy || isIndex) {
        if (isPolicy && realtimePermitido(l)) return;
        if (/\son\s+/i.test(l) && !/\son\s+produccion\./i.test(l)) {
          console.error(`🚨 ${at} DDL sobre tabla fuera de produccion: ${l.slice(0, 90)}`);
          problems++;
        }
        return;
      }
      const schema = target.includes(".") ? target.split(".")[0].toLowerCase() : null;
      if (!schema) {
        console.error(`🚨 ${at} DDL sin esquema (caería en public): ${l.slice(0, 90)}`);
        problems++;
      } else if (!ALLOWED_SCHEMAS.has(schema)) {
        console.error(`🚨 ${at} DDL en esquema no permitido "${schema}": ${l.slice(0, 90)}`);
        problems++;
      }
    }
  });
}

// Version prefixes must not collide with S.P.A.M's 0001-0006 history.
for (const f of files) {
  const version = f.split("_")[0];
  if (!/^\d{14}$/.test(version)) {
    console.error(`🚨 ${f}: versión "${version}" no es timestamp — puede chocar con S.P.A.M`);
    problems++;
  }
}

console.log(
  problems === 0
    ? `\n✅ ${files.length} migraciones: todo dentro de "produccion", sin choque de versiones\n`
    : `\n❌ ${problems} problema(s) de aislamiento\n`,
);
process.exit(problems === 0 ? 0 : 1);

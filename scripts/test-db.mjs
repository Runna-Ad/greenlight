// Local DB test harness — runs migrations + assertions in PGlite (WASM Postgres, no Docker).
// Run: node scripts/test-db.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildFilename } from "../src/lib/filename.ts";
import { canMove } from "../src/lib/brand.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migDir = join(__dirname, "..", "supabase", "migrations");

let pass = 0,
  fail = 0;
function ok(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}
function eq(name, got, want) {
  ok(name, got === want, `\n      got:  ${got}\n      want: ${want}`);
}

const db = await PGlite.create();

// ── Run every migration in order ──
console.log("\n▶ Applying migrations");
for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
  try {
    await db.exec(readFileSync(join(migDir, f), "utf8"));
    console.log(`  ✓ ${f}`);
    pass++;
  } catch (e) {
    console.error(`  ✗ ${f}\n    ${e.message}`);
    fail++;
    // A broken migration invalidates everything downstream — stop here.
    console.error(`\n${fail} failure(s), ${pass} pass. Aborting.`);
    process.exit(1);
  }
}

const q = async (sql, params) => (await db.query(sql, params)).rows;
const scalar = async (sql, params) => Object.values((await q(sql, params))[0])[0];

// ── Filename builder: the highest-value contract test ──
console.log("\n▶ build_filename() — real / normal / static + rules");

eq(
  "real person, full tokens",
  await scalar(
    `select produccion.build_filename('real','RECOMMENDRUMORS','9:16','25s','WOMAN',null,'G2','FB',1,'MAR26')`,
  ),
  "RECOMMENDRUMORS_9X16_25S_WOMAN_REAL_VIDEO_IDEAG2_FB_V1_MAR26_RN",
);

eq(
  "normal video (formato replaces REAL)",
  await scalar(
    `select produccion.build_filename('normal','SPAPFISHFILTER','9:16','30s','WOMAN','STOCK','B','TT',1,'AUG26')`,
  ),
  "SPAPFISHFILTER_9X16_30S_WOMAN_STOCK_VIDEO_IDEAB_TT_V1_AUG26_RN",
);

eq(
  "static drops duration, uses STATIC",
  await scalar(
    `select produccion.build_filename('static','NAMING','1:1',null,'WOMANMAN','STOCK','1','GG',1,'AUG26')`,
  ),
  "NAMING_1X1_WOMANMAN_STOCK_STATIC_IDEA1_GG_V1_AUG26_RN",
);

eq(
  "genero NA is omitted",
  await scalar(
    `select produccion.build_filename('static','NAMING','1:1',null,'NA','STOCK','1','GG',1,'AUG26')`,
  ),
  "NAMING_1X1_STOCK_STATIC_IDEA1_GG_V1_AUG26_RN",
);

eq(
  "size colon→x + space stripped in idea",
  await scalar(
    `select produccion.build_filename('real','TOURISM','9:16','30s','WOMAN',null,'IDEA 4','TT',2,'MAR24')`,
  ),
  // note: idea 'IDEA 4' → norm strips space → IDEA4; token becomes IDEAIDEA4? No — prefix + norm('IDEA 4')
  "TOURISM_9X16_30S_WOMAN_REAL_VIDEO_IDEAIDEA4_TT_V2_MAR24_RN",
);

// ── Seed the validity matrix + insert chain, then assets via filename trigger ──
console.log("\n▶ Insert chain + asset filename trigger");
await db.exec(`
  insert into produccion.clients (id, name, slug) values
    ('00000000-0000-0000-0000-000000000001','DiDi','didi');
  insert into produccion.marcas (id, client_id, name, slug) values
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000001','Card','card');
  insert into produccion.briefs (id, client_id, code, title) values
    ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000001','DIDI-AGO26-01','Agosto');
  insert into produccion.idea_families (id, brief_id, letter) values
    ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','A');
  insert into produccion.ideas (id, family_id, brief_id, variant_number, naming_kind, naming_base, genero_code, mes_code)
    values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
            1,'real','RECOMMENDRUMORS','WOMAN','MAR26');
`);

eq(
  "idea.code trigger → A1",
  await scalar(`select code from produccion.ideas where id='00000000-0000-0000-0000-0000000000d1'`),
  "A1",
);

await db.exec(`
  insert into produccion.assets
    (idea_id, brief_id, naming_kind, naming_base, tamano_code, plataforma_code, duracion_code, genero_code, idea_code, mes_code, version)
  values
    ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b1',
     'real','RECOMMENDRUMORS','9:16','FB','25s','WOMAN','A1','MAR26',1);
`);

eq(
  "asset filename computed by trigger",
  await scalar(`select filename from produccion.assets limit 1`),
  "RECOMMENDRUMORS_9X16_25S_WOMAN_REAL_VIDEO_IDEAA1_FB_V1_MAR26_RN",
);

// version bump reflects in filename
await db.exec(`update produccion.assets set version = 2`);
eq(
  "version bump → filename V2",
  await scalar(`select filename from produccion.assets limit 1`),
  "RECOMMENDRUMORS_9X16_25S_WOMAN_REAL_VIDEO_IDEAA1_FB_V2_MAR26_RN",
);

// valid override wins
await db.exec(`update produccion.assets set filename_override = 'CUSTOM_9X16_THING_RN'`);
eq(
  "valid override wins",
  await scalar(`select filename from produccion.assets limit 1`),
  "CUSTOM_9X16_THING_RN",
);

// invalid override rejected
let rejected = false;
try {
  await db.exec(`update produccion.assets set filename_override = 'bad name with spaces'`);
} catch {
  rejected = true;
}
ok("invalid override rejected", rejected);

// clearing override falls back to computed
await db.exec(`update produccion.assets set filename_override = null`);
eq(
  "cleared override → back to computed",
  await scalar(`select filename from produccion.assets limit 1`),
  "RECOMMENDRUMORS_9X16_25S_WOMAN_REAL_VIDEO_IDEAA1_FB_V2_MAR26_RN",
);

// unique render guard
let dupBlocked = false;
try {
  await db.exec(`
    insert into produccion.assets
      (idea_id, brief_id, naming_kind, naming_base, tamano_code, plataforma_code, idea_code, mes_code, version)
    values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b1',
            'real','RECOMMENDRUMORS','9:16','FB','A1','MAR26',2);`);
} catch {
  dupBlocked = true;
}
ok("duplicate render (idea+size+platform+version) blocked", dupBlocked);

// vocab code shape guard
let vocabBlocked = false;
try {
  await db.exec(`insert into produccion.vocab_terms (set, code, label_es) values ('tamano','9:16','9:16')`);
} catch {
  vocabBlocked = true;
}
ok("vocab code with ':' rejected (must be [A-Z0-9]+)", vocabBlocked);

// ── read-time trigger on planos ──
console.log("\n▶ planos read-time + workflow RPCs");
await db.exec(`
  insert into produccion.planos (idea_id, orden, dialogo)
  values ('00000000-0000-0000-0000-0000000000d1', 1,
          'Te ofrecemos un crédito de hasta cuarenta y cinco mil pesos en minutos');
`); // 13 words / 2.5 = 5.2 → ceil 6
eq(
  "read-time from dialogo (13 words → 6s)",
  Number(await scalar(`select read_time_s from produccion.planos limit 1`)),
  6,
);

// Simulate a signed-in user by setting the JWT 'sub' claim.
const asUser = async (uuid) =>
  db.exec(`select set_config('request.jwt.claims', '{"sub":"${uuid}"}', false);`);
const LEAD = "00000000-0000-0000-0000-00000000ea01";
const CREA = "00000000-0000-0000-0000-00000000ea02";
await db.exec(`
  insert into produccion.profiles (id, email, full_name, role) values
   ('${LEAD}','lead@runna.mx','Lead',   'lead'),
   ('${CREA}','crea@runna.mx','Creativo','creative');
  insert into produccion.size_platform_validity (media,tamano,plataforma) values
   ('video','9:16','FB'),('video','9:16','TT'),('video','1:1','GG'),('video','4:5','FB');
  insert into produccion.idea_assignments (idea_id, profile_id, role)
   values ('00000000-0000-0000-0000-0000000000d1','${CREA}','creativo');
`);

// clear the manual filename-test asset so the workflow section starts clean
await db.exec(`delete from produccion.assets;`);

// generate_assets as lead: 9:16 × [FB,TT] valid, 4:5×TT invalid (matrix)
await asUser(LEAD);
// jsonb comes back already parsed as a JS object.
const gen = await scalar(
  `select produccion.rpc_generate_assets('00000000-0000-0000-0000-0000000000d1',
    array['9:16','4:5'], array['FB','TT'], '25s')`,
);
eq("generate_assets created valid combos", gen.created, 3); // 9:16FB,9:16TT,4:5FB
eq("generate_assets skipped invalid (4:5×TT)", gen.skipped_invalid, 1);

// generate_assets denied for creative
await asUser(CREA);
let genDenied = false;
try {
  await scalar(
    `select produccion.rpc_generate_assets('00000000-0000-0000-0000-0000000000d1', array['9:16'], array['FB'])`,
  );
} catch {
  genDenied = true;
}
ok("generate_assets denied for creative", genDenied);

// transition guard: creative can todo→in_progress, cannot →completed
const anAsset = await scalar(
  `select id from produccion.assets where idea_code='A1' and tamano_code='9:16' and plataforma_code='FB' limit 1`,
);
await db.exec(`update produccion.assets set status='in_progress' where id='${anAsset}'`);
eq(
  "todo→in_progress allowed",
  await scalar(`select status from produccion.assets where id='${anAsset}'`),
  "in_progress",
);
let illegalBlocked = false;
try {
  // in_progress→completed is not in the map, and creative is not lead
  await db.exec(`update produccion.assets set status='completed' where id='${anAsset}'`);
} catch {
  illegalBlocked = true;
}
ok("illegal transition blocked for non-lead", illegalBlocked);

// status_events logged
eq(
  "status_events logged the move",
  Number(await scalar(`select count(*) from produccion.status_events where asset_id='${anAsset}'`)),
  1,
);

// submit_version: creative (assigned) bumps to V2, status→under_review
await asUser(CREA);
const newV = Number(
  await scalar(`select produccion.rpc_submit_version('${anAsset}','path/v2.mp4','listo')`),
);
eq("submit_version → V2", newV, 2);
eq(
  "submit_version set status under_review",
  await scalar(`select status from produccion.assets where id='${anAsset}'`),
  "under_review",
);
eq(
  "asset_versions row created",
  Number(await scalar(`select count(*) from produccion.asset_versions where asset_id='${anAsset}'`)),
  1,
);

// request_correction: lead only
await asUser(LEAD);
await scalar(`select produccion.rpc_request_correction('${anAsset}','Ajustar el hook', '{}')`);
eq(
  "request_correction → in_corrections",
  await scalar(`select status from produccion.assets where id='${anAsset}'`),
  "in_corrections",
);
eq(
  "correction comment created",
  Number(
    await scalar(
      `select count(*) from produccion.comments where asset_id='${anAsset}' and kind='correction_request'`,
    ),
  ),
  1,
);

// ── RLS enforcement (run queries as the authenticated role) ──
console.log("\n▶ RLS enforcement");
await db.exec(`create role authenticated;`).catch(() => {});
await db.exec(`grant usage on schema produccion to authenticated;
  grant all on all tables in schema produccion to authenticated;`);

const asRole = async (uuid) => {
  // session-level (false) so the claim survives across PGlite statement boundaries
  await db.exec(`select set_config('request.jwt.claims','{"sub":"${uuid}"}', false);`);
  await db.exec(`set role authenticated;`);
};
const resetRole = async () => db.exec(`reset role;`);

// creative cannot force an asset to 'completed' (not lead, illegal transition)
await asRole(CREA);
let rlsCreativeBlocked = false;
try {
  await db.query(`update produccion.assets set status='completed' where id=$1`, [anAsset]);
} catch {
  rlsCreativeBlocked = true;
}
ok("creative cannot complete an asset", rlsCreativeBlocked);
await resetRole();

// lead CAN move backward (override) — currently in_corrections → in_progress is allowed anyway;
// test a true backward override: in_corrections → todo (not in map, lead allowed)
await asRole(LEAD);
let leadOverride = true;
try {
  await db.query(`update produccion.assets set status='todo' where id=$1`, [anAsset]);
} catch (e) {
  leadOverride = false;
}
ok("lead can override to a non-mapped status", leadOverride);
await resetRole();

// ── Assignment model (0008) ──
// The sheet's "Asignación" is MULTI-PERSON and carries no role ("Galie, Mony").
console.log("\n▶ Asignación — personas en una tarea");

const anIdea = await scalar(`select id from produccion.ideas limit 1`);
const galie = await scalar(`select id from produccion.track_members where track='real' and name='Galie'`);
const mony = await scalar(`select id from produccion.track_members where track='real' and name='Mony'`);
const viri = await scalar(`select id from produccion.track_members where track='normal' and name='Viri'`);

await db.query(
  `insert into produccion.idea_assignments (idea_id, member_id) values ($1,$2),($1,$3)`,
  [anIdea, galie, mony],
);
eq(
  "dos personas en la misma tarea (el unique(idea_id,role) viejo lo bloqueaba)",
  Number(
    await scalar(`select count(*) from produccion.idea_assignments where idea_id=$1 and member_id is not null`, [
      anIdea,
    ]),
  ),
  2,
);

// Sin profile_id: las 14 personas no tienen cuenta todavía.
eq(
  "asignación por member_id no necesita profile_id (nadie tiene cuenta aún)",
  Number(
    await scalar(
      `select count(*) from produccion.idea_assignments where idea_id=$1 and member_id is not null and profile_id is null`,
      [anIdea],
    ),
  ),
  2,
);

let dupMemberBlocked = false;
try {
  await db.query(`insert into produccion.idea_assignments (idea_id, member_id) values ($1,$2)`, [anIdea, galie]);
} catch {
  dupMemberBlocked = true;
}
ok("la misma persona dos veces en una tarea se rechaza", dupMemberBlocked);

let emptyBlocked = false;
try {
  await db.query(`insert into produccion.idea_assignments (idea_id) values ($1)`, [anIdea]);
} catch {
  emptyBlocked = true;
}
ok("asignación sin persona se rechaza (check has_person)", emptyBlocked);

// "Clau J" (real) y "Clau T" (normal) no se deben cruzar entre tracks.
eq(
  "el pool está separado por track (10 real / 4 normal)",
  `${await scalar(`select count(*) from produccion.track_members where track='real'`)}/${await scalar(
    `select count(*) from produccion.track_members where track='normal'`,
  )}`,
  "10/4",
);

// El match del backfill es insensible a acentos, mayúsculas y espacios.
eq(
  "match real del backfill: ' Galie ' del sheet → Galie del pool",
  await scalar(
    `select tm.name from produccion.track_members tm
      where tm.track = 'real'
        and lower(translate(tm.name,'áéíóúÁÉÍÓÚñÑ','aeiouAEIOUnN'))
          = lower(translate(btrim(' galie '),'áéíóúÁÉÍÓÚñÑ','aeiouAEIOUnN'))`,
  ),
  "Galie",
);
eq(
  "'Galie, Mony' del sheet se parte en 2 personas",
  Number(
    await scalar(
      `select count(*) from unnest(string_to_array('Galie, Mony', ',')) nombre
        join produccion.track_members tm
          on tm.track='real'
         and lower(translate(tm.name,'áéíóúÁÉÍÓÚñÑ','aeiouAEIOUnN'))
           = lower(translate(btrim(nombre),'áéíóúÁÉÍÓÚñÑ','aeiouAEIOUnN'))`,
    ),
  ),
  2,
);
ok(
  "'Viri' (normal) no hace match dentro del track real",
  Number(
    await scalar(
      `select count(*) from produccion.track_members where track='real' and name='Viri'`,
    ),
  ) === 0 && viri !== null,
);

// La vista del tablero trae personas y conteo de archivos pegados a la tarea.
const boardRow = (
  await q(`select file_count, jsonb_array_length(members) as n from produccion.board_tasks where id=$1`, [anIdea])
)[0];
eq("board_tasks lista las 2 personas", Number(boardRow.n), 2);
ok("board_tasks trae el conteo de archivos", Number(boardRow.file_count) >= 0);
eq(
  "board_tasks devuelve una fila por TAREA, no por archivo",
  Number(await scalar(`select count(*) from produccion.board_tasks`)),
  Number(await scalar(`select count(*) from produccion.ideas`)),
);

// ── Override de lead + historial de la TAREA (0009) ──
console.log("\n▶ Override de lead — auditado, no una puerta abierta");

const ovIdea = await scalar(`select id from produccion.ideas limit 1`);
await db.query(`update produccion.ideas set status='todo' where id=$1`, [ovIdea]);
await db.query(`delete from produccion.status_events where idea_id=$1`, [ovIdea]);

// El camino normal sigue funcionando y NO cuenta como override.
eq(
  "rpc_move_task hace la transición legal todo→in_progress",
  await scalar(`select produccion.rpc_move_task($1,'in_progress')`, [ovIdea]),
  "in_progress",
);
eq(
  "el movimiento legal queda registrado",
  Number(await scalar(`select count(*) from produccion.status_events where idea_id=$1`, [ovIdea])),
  1,
);
eq(
  "un movimiento legal NO se marca como override",
  await scalar(`select override from produccion.status_events where idea_id=$1`, [ovIdea]),
  false,
);

// Sin pedir override, un salto ilegal se rechaza igual que antes.
let ilegalBlocked = false;
try {
  await db.query(`select produccion.rpc_move_task($1,'todo')`, [ovIdea]);
} catch {
  ilegalBlocked = true;
}
ok("sin p_as_lead, revertir sigue bloqueado", ilegalBlocked);

// Pedirlo sin tener derecho tampoco basta: un creativo no puede revertir.
await asUser(CREA);
let creaBlocked = false;
try {
  await db.query(`select produccion.rpc_move_task($1,'todo',true,$2)`, [ovIdea, CREA]);
} catch {
  creaBlocked = true;
}
ok("un creativo NO puede revertir aunque pida override", creaBlocked);

// Claims vacías no deben reventar nada (current_profile_id endurecido en 0009).
await db.exec(`select set_config('request.jwt.claims','', false);`);
eq(
  "claims vacías → current_profile_id() devuelve null, no revienta",
  await scalar(`select produccion.current_profile_id() is null`),
  true,
);

// Un lead sí, y queda marcado como override con su motivo.
eq(
  "un lead revierte in_progress→todo",
  await scalar(`select produccion.rpc_move_task($1,'todo',true,$2,'me equivoqué de tarjeta')`, [
    ovIdea,
    LEAD,
  ]),
  "todo",
);
const ovRow = (
  await q(
    `select override, reason, actor_id, from_status, to_status from produccion.status_events
      where idea_id=$1 order by created_at desc limit 1`,
    [ovIdea],
  )
)[0];
ok("la reversión queda marcada como override", ovRow.override === true);
eq("guarda el motivo", ovRow.reason, "me equivoqué de tarjeta");
eq("guarda quién lo hizo", ovRow.actor_id, LEAD);
eq("guarda de dónde a dónde", `${ovRow.from_status}→${ovRow.to_status}`, "in_progress→todo");

// El permiso NO se queda encendido: el siguiente salto ilegal vuelve a fallar.
let despuesBlocked = false;
try {
  await db.query(`select produccion.rpc_move_task($1,'completed')`, [ovIdea]);
} catch {
  despuesBlocked = true;
}
ok("el override no queda encendido para el resto de la transacción", despuesBlocked);

// Un UPDATE directo también se registra — el registro no es opcional.
await db.query(`update produccion.ideas set status='in_progress' where id=$1`, [ovIdea]);
eq(
  "un UPDATE directo también deja historial",
  Number(await scalar(`select count(*) from produccion.status_events where idea_id=$1`, [ovIdea])),
  3,
);

// ── CONTRACT: TS canMove() === DB transition_allowed() over ALL pairs ──
// The board dims illegal columns using the TS map; the trigger enforces the SQL
// one. If they ever drift, the UI would offer a drop the DB then rejects.
console.log("\n▶ Transiciones — contrato TS vs DB");
const STATUSES = [
  "todo",
  "in_progress",
  "under_review",
  "in_corrections",
  "completed",
  "published",
  "delivered",
];
let tMismatch = 0;
for (const from of STATUSES) {
  for (const to of STATUSES) {
    if (from === to) continue; // canMove() treats a no-op move as fine; SQL has no such pair
    const dbAllows = await scalar(
      `select produccion.transition_allowed($1::produccion.asset_status,$2::produccion.asset_status)`,
      [from, to],
    );
    const tsAllows = canMove(from, to);
    if (dbAllows !== tsAllows) {
      tMismatch++;
      if (tMismatch <= 3) console.error(`      ${from}→${to}: db=${dbAllows} ts=${tsAllows}`);
    }
  }
}
ok(`TS canMove() === DB transition_allowed() en ${STATUSES.length * (STATUSES.length - 1)} pares`, tMismatch === 0);

// ── CONTRACT: TS buildFilename() === DB build_filename() over a matrix ──
console.log("\n▶ Filename contract — TS vs DB (many combos)");
await resetRole();
const kinds = ["real", "normal", "static"];
const sizes = ["9:16", "1:1", "4:5", "16:9", "1.91:1"];
const durs = ["6s", "25s", "30-40s"];
const gens = ["WOMAN", "MAN", "WOMANMAN", "NA", null];
const fmts = ["STOCK", "ILLUS", "AI"];
const plats = ["FB", "TT", "GG", "GGFBTT"];
let contractChecked = 0,
  contractMismatch = 0;
let ci = 0;
for (const kind of kinds)
  for (const size of sizes)
    for (const gen of gens) {
      ci++;
      const dur = durs[ci % durs.length];
      const fmt = fmts[ci % fmts.length];
      const plat = plats[ci % plats.length];
      const ver = (ci % 3) + 1;
      const dbName = await scalar(
        `select produccion.build_filename($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [kind, "MYTOPIC", size, dur, gen, fmt, "A1", plat, ver, "AUG26"],
      );
      const tsName = buildFilename({
        kind,
        base: "MYTOPIC",
        tamano: size,
        duracion: dur,
        genero: gen,
        formato: fmt,
        idea: "A1",
        plataforma: plat,
        version: ver,
        mes: "AUG26",
      });
      contractChecked++;
      if (dbName !== tsName) {
        contractMismatch++;
        if (contractMismatch <= 3)
          console.error(`      mismatch:\n        db: ${dbName}\n        ts: ${tsName}`);
      }
    }
ok(`TS===DB across ${contractChecked} combos`, contractMismatch === 0);

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} pass, ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);

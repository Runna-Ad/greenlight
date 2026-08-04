// Local DB test harness — runs migrations + assertions in PGlite (WASM Postgres, no Docker).
// Run: node scripts/test-db.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildFilename } from "../src/lib/filename.ts";
import { canMove } from "../src/lib/brand.ts";
import { missingRequired } from "../src/lib/required.ts";

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
const migFiles = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
for (const f of migFiles) {
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

// ── seed.sql aplica contra el esquema vigente ──
// En una instancia APARTE: el objetivo es probar que el archivo no se desfasó,
// no sembrar la base de pruebas (sus fixtures usan los mismos slugs).
// Sin este guard, un desfase vive meses invisible: pasó con
// `on conflict (set, code)` (constraint cambiada por la 0003) y con
// `on conflict (idea_id, role)` (eliminada por la 0008).
console.log("\n▶ seed.sql — ¿sigue al día con el esquema?");
{
  const seedDb = await PGlite.create();
  try {
    for (const f of migFiles) await seedDb.exec(readFileSync(join(migDir, f), "utf8"));
    await seedDb.exec(readFileSync(join(__dirname, "..", "supabase", "seed.sql"), "utf8"));
    ok("seed.sql aplica sin errores sobre las migraciones", true);
  } catch (e) {
    ok("seed.sql aplica sin errores sobre las migraciones", false, `\n      ${e.message}`);
  } finally {
    await seedDb.close();
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
  -- La matriz base ya la siembra la migración 0012 (antes sólo vivía en
  -- seed.sql, que nunca se aplicaba a producción).
  insert into produccion.size_platform_validity (media,tamano,plataforma) values
   ('video','9:16','FB'),('video','9:16','TT'),('video','1:1','GG'),('video','4:5','FB')
  on conflict do nothing;
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


// ── Flujo por botones + notificaciones (0010) ──
console.log("\n▶ Flujo por botones — verbos, avisos y quién se entera");

const flIdea = await scalar(`select id from produccion.ideas limit 1`);
// Volver a 'todo' es una reversión: se pasa por la puerta de lead, como lo
// haría una persona. Un UPDATE directo choca con el guard — y está bien.
await db.query(`select produccion.rpc_move_task($1,'todo',true,$2,'reset de prueba')`, [flIdea, LEAD]);
await db.query(`delete from produccion.notifications where entity_id=$1`, [flIdea]);
// dos personas trabajando la tarea
await db.query(
  `insert into produccion.idea_assignments (idea_id, member_id)
   select $1, id from produccion.track_members where track='real' and name in ('Galie','Mony')
   on conflict do nothing`, [flIdea]);
const mGalie = await scalar(`select id from produccion.track_members where track='real' and name='Galie'`);

const notifs = async () => (await q(
  `select n.type, n.title, tm.name as para, n.body
     from produccion.notifications n
     left join produccion.track_members tm on tm.id = n.recipient_member_id
    where n.entity_id=$1 order by n.created_at`, [flIdea]));

// Empezar: nadie tiene por qué enterarse.
eq("rpc_task_start → in_progress", await scalar(`select produccion.rpc_task_start($1,$2)`, [flIdea, mGalie]), "in_progress");
eq("empezar no notifica a nadie", (await notifs()).length, 0);

// Mandar a revisión: se entera el lead.
eq("rpc_task_submit_review → under_review",
   await scalar(`select produccion.rpc_task_submit_review($1,$2)`, [flIdea, mGalie]), "under_review");
const nRev = await notifs();
eq("mandar a revisión avisa al lead", nRev.length, 1);
eq("y el aviso dice de qué tarea", nRev[0].type, "task_submitted");

eq("se registró la entrega in_app",
  await scalar(`select channel::text from produccion.notification_deliveries d
                 join produccion.notifications n on n.id=d.notification_id
                where n.entity_id=$1 limit 1`, [flIdea]),
  "in_app");
eq("y como enviada (no pendiente)",
  await scalar(`select status from produccion.notification_deliveries d
                 join produccion.notifications n on n.id=d.notification_id
                where n.entity_id=$1 limit 1`, [flIdea]),
  "sent");

// Pedir cambios: se enteran los que trabajan la tarea, menos quien lo pidió.
let sinTexto = false;
try { await db.query(`select produccion.rpc_task_request_changes($1,'')`, [flIdea]); } catch { sinTexto = true; }
ok("pedir cambios sin decir cuáles se rechaza", sinTexto);

await db.query(`delete from produccion.notifications where entity_id=$1`, [flIdea]);
eq("rpc_task_request_changes → in_corrections",
   await scalar(`select produccion.rpc_task_request_changes($1,$2,$3)`,
                [flIdea, "Cambia el hook de los primeros 3 segundos", mGalie]), "in_corrections");
const nCorr = await notifs();
eq("avisa a los asignados", nCorr.length, 1);
eq("pero NO a quien pidió los cambios", nCorr.map(n => n.para).join(), "Mony");
eq("y el aviso lleva el texto de qué corregir", nCorr[0].body, "Cambia el hook de los primeros 3 segundos");
eq("los cambios quedan como comentario",
   await scalar(`select body from produccion.comments where idea_id=$1 and kind='correction_request'`, [flIdea]),
   "Cambia el hook de los primeros 3 segundos");

// El historial guarda a la persona del pool, no sólo al perfil admin.
eq("el historial guarda quién del equipo lo movió",
   await scalar(`select tm.name from produccion.status_events se
                  join produccion.track_members tm on tm.id = se.actor_member_id
                 where se.idea_id=$1 order by se.created_at desc limit 1`, [flIdea]),
   "Galie");

// Un UPDATE directo también notifica: el trigger no se puede evadir.
await db.query(`delete from produccion.notifications where entity_id=$1`, [flIdea]);
await db.query(`update produccion.ideas set status='in_progress' where id=$1`, [flIdea]);
await db.query(`update produccion.ideas set status='under_review' where id=$1`, [flIdea]);
ok("un UPDATE directo también avisa (el trigger no se evade)", (await notifs()).length > 0);

// Un fallo notificando NO puede tumbar el movimiento de la tarea.
await db.exec(`
  create or replace function produccion.active_notify_channels()
  returns produccion.notify_channel[] language plpgsql immutable as $$
  begin
    raise exception 'canal roto a propósito';
  end $$;`);
let movioIgual = false;
try {
  await db.query(`select produccion.rpc_task_approve($1,$2)`, [flIdea, mGalie]);
  movioIgual = (await scalar(`select status from produccion.ideas where id=$1`, [flIdea])) === "completed";
} catch { movioIgual = false; }
ok("si la notificación revienta, la tarea se mueve igual", movioIgual);
ok("y el fallo queda registrado, no invisible",
   Number(await scalar(`select count(*) from produccion.activity_log where verb='notify_failed'`)) > 0);
await db.exec(`
  create or replace function produccion.active_notify_channels()
  returns produccion.notify_channel[] language sql immutable as $$
    select array['in_app']::produccion.notify_channel[];
  $$;`);

// ── CONTRACT: missingRequired() TS === missing_required() SQL ──
console.log("\n▶ Obligatorios — contrato TS vs DB");
const TIPOS = ["RP Video", "Normal Video", "AIGC video", "GIF", "Images", "Copies", "Podcast"];
const CAMPOS = ["Asignación","Marca","# Entrega","Tipo de Asset","Concepto","Plataforma","Naming","# Idea","Tamaño","Duración"];
const LLENA = { "Asignación":"Flor","Marca":"Card","# Entrega":"1ra","Concepto":"c",
                "Plataforma":"FB","Naming":"N","# Idea":"A1","Tamaño":"9:16","Duración":"10s" };
let reqMismatch = 0, reqChecked = 0;
for (const tipo of TIPOS) {
  // fila completa, y luego una variante por cada campo vaciado
  for (const vaciar of [null, ...CAMPOS]) {
    const row = { ...LLENA, "Tipo de Asset": tipo };
    if (vaciar) row[vaciar] = "";
    const ts = missingRequired(row).join("|");
    const sql = (await scalar(`select produccion.missing_required($1::jsonb)`, [JSON.stringify(row)]) ?? []).join("|");
    reqChecked++;
    if (ts !== sql) {
      reqMismatch++;
      if (reqMismatch <= 3) console.error(`      ${tipo} sin "${vaciar}": ts=[${ts}] sql=[${sql}]`);
    }
  }
}
ok(`TS missingRequired() === SQL missing_required() en ${reqChecked} casos`, reqMismatch === 0);


// ── Plantilla de trabajo: reglas, estáticos, planos (0012) ──
console.log("\n▶ Plantilla de trabajo — reglas contextuales");

// El harness crea clients/marcas después de migrar, así que la biblioteca se
// siembra ahora — la función es idempotente a propósito.
await db.query(`select produccion.sembrar_biblioteca()`);

eq("se sembraron las 7 reglas",
   Number(await scalar(`select count(*) from produccion.reglas where activo`)), 7);
eq("las reglas de marca emparejan por slug, no por uuid",
   Number(await scalar(`select count(*) from produccion.reglas where scope='marca' and cond_marca_slug is not null`)), 2);

// Una tarea de VIDEO de 10-40s en FB
await db.query(
  `update produccion.ideas set tipo_asset='RP Video', plataformas='{FB,TT}', duracion='10-40s',
          marca_id=(select id from produccion.marcas where slug='card')
    where id='00000000-0000-0000-0000-0000000000d1'`);
const reglasDe = async (texto = null) =>
  (await q(`select codigo from produccion.reglas_para_tarea('00000000-0000-0000-0000-0000000000d1', $1) order by sort_order`, [texto]))
    .map((r) => r.codigo);

const rVideo = await reglasDe();
ok("video en FB trae safe zones", rVideo.includes("FB_SAFE_ZONES"));
ok("video NO trae las reglas de estático", !rVideo.some((c) => c.includes("STATIC")));
ok("40s dispara el mínimo de beneficios", rVideo.includes("DUR30_MIN5_BENEF"));
ok("Card pide timeframes", rVideo.includes("CARD_TIMEFRAMES"));
ok("y NO trae la de Préstamos", !rVideo.includes("PREST_SIN_TIMEFRAMES"));

// La regla que depende del TEXTO que se está escribiendo
ok("sin mencionar cashback, la regla del asterisco NO aparece",
   !(await reglasDe("Un guión cualquiera")).includes("CASHBACK_ASTERISCO"));
ok("al escribir CASHBACK, aparece",
   (await reglasDe("Hasta 6% de CASHBACK en tus compras")).includes("CASHBACK_ASTERISCO"));
ok("y también con MSI",
   (await reglasDe("12 MSI en comercios")).includes("CASHBACK_ASTERISCO"));

// EL CASO QUE IMPORTA: un estático multiplataforma recibe las DOS reglas
// contradictorias. El diseño tiene que enseñarlas agrupadas, no elegir una.
await db.query(
  `update produccion.ideas set tipo_asset='Images', plataformas='{FB,GG,TT}', duracion='-'
    where id='00000000-0000-0000-0000-0000000000d1'`);
const rEstatico = await reglasDe();
ok("estático multiplataforma trae la de GG (sin CTA)", rEstatico.includes("GG_STATIC_SIN_CTA"));
ok("y también la de FB (con CTA) — contradictorias a propósito",
   rEstatico.includes("FB_STATIC_CON_CTA"));
ok("un estático sin duración NO dispara el mínimo de beneficios",
   !rEstatico.includes("DUR30_MIN5_BENEF"));

// Estáticos: la tabla y sus sub-campos
console.log("\n▶ Plantilla de trabajo — estáticos y planos");
await db.query(
  `insert into produccion.estaticos (idea_id, orden, copy_titulo, copy_cta)
   values ('00000000-0000-0000-0000-0000000000d1', 1, 'Hasta 6% de CASHBACK*', 'Pídela ya')`);
eq("estático guarda los sub-campos de COPY IN",
   await scalar(`select copy_titulo from produccion.estaticos limit 1`), "Hasta 6% de CASHBACK*");
let dupEst = false;
try {
  await db.query(`insert into produccion.estaticos (idea_id, orden) values ('00000000-0000-0000-0000-0000000000d1', 1)`);
} catch { dupEst = true; }
ok("dos estáticos con el mismo orden se rechazan", dupEst);

// planos: SFX y GFX ya son campos separados, como en el deck
await db.query(
  `insert into produccion.planos (idea_id, orden, sfx, gfx, dialogo, es_cierre)
   values ('00000000-0000-0000-0000-0000000000d1', 9, 'Música alegre', 'Emoji de confeti',
           'Hasta seis por ciento de cashback en todas tus compras diarias', false)`);
const pl = (await q(`select sfx, gfx, read_time_s from produccion.planos where orden=9`))[0];
eq("SFX y GFX son campos distintos", `${pl.sfx} | ${pl.gfx}`, "Música alegre | Emoji de confeti");
eq("el read-time se calcula solo (11 palabras / 2.5 → 5s)", Number(pl.read_time_s), 5);
ok("existe la marca de Cortinilla de Cierre",
   (await scalar(`select count(*) from information_schema.columns
                   where table_schema='produccion' and table_name='planos' and column_name='es_cierre'`)) > 0);

// Lo que el seed nunca llevó a producción
console.log("\n▶ Lo que faltaba del seed");
ok("la matriz base de tamaño×plataforma ya está (17 combos base)",
   Number(await scalar(`select count(*) from produccion.size_platform_validity
                         where plataforma in ('GG','FB','TT') and tamano <> '2736 x 1260'`)) >= 17);
eq("1.91:1 ya está en el vocabulario",
   await scalar(`select label_es from produccion.vocab_terms where set='tamano' and code='1.91X1' limit 1`),
   "1.91:1");
ok("el set duracion dejó de estar vacío",
   Number(await scalar(`select count(*) from produccion.vocab_terms where set='duracion'`)) >= 4);
ok("la biblioteca de selling points tiene claims",
   Number(await scalar(`select count(*) from produccion.snippets where kind='selling_point'`)) >= 30);
// Idempotente: volver a llamarla no duplica nada.
await db.query(`select produccion.sembrar_biblioteca()`);
eq("sembrar_biblioteca() es idempotente",
   Number(await scalar(`select count(*) from produccion.snippets where kind='selling_point'`)),
   Number(await scalar(`select count(distinct body) from produccion.snippets where kind='selling_point'`)));
eq("el legal está scopeado a MARCA, no a cliente",
   await scalar(`select scope from produccion.snippets where kind='legal' limit 1`), "marca");

// is_assigned() veía sólo profile_id desde la 0008
eq("is_assigned() ahora ve las asignaciones por member_id",
   await scalar(`
     select produccion.is_assigned('00000000-0000-0000-0000-0000000000d1')
       from (select set_config('request.jwt.claims', json_build_object('sub', tm.profile_id)::text, true)
               from produccion.track_members tm limit 1) _`),
   false); // sin profile_id ligado todavía: false, pero YA NO revienta

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

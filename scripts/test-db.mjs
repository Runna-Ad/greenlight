// Local DB test harness — runs migrations + assertions in PGlite (WASM Postgres, no Docker).
// Run: node scripts/test-db.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildFilename } from "../src/lib/filename.ts";
import { canMove } from "../src/lib/brand.ts";
import { missingRequired } from "../src/lib/required.ts";
import { readTimeS } from "../src/lib/plantilla.ts";
import { reglasQueAplican } from "../src/lib/reglas.ts";
import { actionsFor } from "../src/lib/task-actions.ts";
import { greenlitDeBundle } from "../src/lib/bundle.ts";

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
  -- Las DOS marcas, como en producción: sin Préstamos, las reglas de esa marca
  -- nunca se pueden probar y el contrato TS↔SQL da un falso desacuerdo.
  insert into produccion.marcas (id, client_id, name, slug) values
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000001','Card','card'),
    ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000001','Préstamos','prestamos');
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

// unique render guard — la clave ahora incluye la duración (0031): misma
// (idea, tamaño, plataforma, DURACIÓN, versión) choca.
let dupBlocked = false;
try {
  await db.exec(`
    insert into produccion.assets
      (idea_id, brief_id, naming_kind, naming_base, tamano_code, plataforma_code, duracion_code, idea_code, mes_code, version)
    values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b1',
            'real','RECOMMENDRUMORS','9:16','FB','25s','A1','MAR26',2);`);
} catch {
  dupBlocked = true;
}
ok("duplicate render (idea+size+platform+duración+version) blocked", dupBlocked);

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
`); // 13 palabras habladas × 3/10 = 3.9 → ceil 4 (200 pal/min)
eq(
  "read-time from dialogo (13 words → 4s)",
  Number(await scalar(`select read_time_s from produccion.planos limit 1`)),
  4,
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
  -- El lead de prueba es un perfil "pelón" (sin track_member); en prod TODO lead ES
  -- track_member de su track. Para las pruebas generales de notificación lo dejamos
  -- notify_scope='all' (ve todo) — el scope por-track de 0050 se prueba aparte, abajo,
  -- con leads ligados a un track real.
  update produccion.profiles set notify_scope='all' where id='${LEAD}';
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

// ── Candado RLS 0056: la llave PÚBLICA no toca `produccion` ──
// Corre ANTES del bloque de abajo (que re-concede a `authenticated` a propósito para
// probar las políticas). Esto vigila el ESTADO POST-MIGRACIONES: si una migración futura
// vuelve a conceder el esquema a anon/authenticated, el candado se abriría en silencio y
// la anon key (pública, va en el bundle del navegador) podría volver a pegarle a la API
// REST saltándose los gates del código. Aquí truena en CI en vez de en producción.
console.log("\n▶ Candado RLS 0056 (anon/authenticated fuera de produccion)");
{
  const priv = async (sql) => Number((await db.query(sql)).rows[0].n);

  for (const rol of ["anon", "authenticated"]) {
    ok(
      `${rol} NO tiene usage sobre el esquema produccion`,
      !(await db.query(`select has_schema_privilege('${rol}','produccion','usage') as n`)).rows[0].n,
    );
    eq(
      `${rol} no conserva privilegios en ninguna tabla de produccion`,
      await priv(`select count(*)::int as n from pg_class c
                    join pg_namespace ns on ns.oid = c.relnamespace
                   where ns.nspname='produccion' and c.relkind in ('r','v')
                     and c.relacl::text like '%${rol}=%'`),
      0,
    );
  }

  // El otro lado de la moneda: si esto se rompiera, la APP dejaría de funcionar.
  ok(
    "service_role conserva usage sobre produccion",
    (await db.query(`select has_schema_privilege('service_role','produccion','usage') as n`)).rows[0].n,
  );
  eq(
    "toda tabla de produccion tiene RLS habilitada",
    await priv(`select count(*)::int as n from pg_class c
                  join pg_namespace ns on ns.oid = c.relnamespace
                 where ns.nspname='produccion' and c.relkind='r' and not c.relrowsecurity`),
    0,
  );
}

// ── RLS enforcement (run queries as the authenticated role) ──
console.log("\n▶ RLS enforcement");
await db.exec(`create role authenticated;`).catch(() => {});
// Simulación del mundo PRE-0056 (rol authenticated con acceso): el candado real se
// prueba aparte ("Candado RLS 0056" + "Avisos 0061"). Desde 0061 las rutinas ya no son
// ejecutables por PUBLIC, así que la simulación también tiene que conceder EXECUTE.
await db.exec(`grant usage on schema produccion to authenticated;
  grant all on all tables in schema produccion to authenticated;
  grant execute on all routines in schema produccion to authenticated;`);

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
} catch {
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
    select array['in_app','email']::produccion.notify_channel[];  -- restaurar al valor de la 0025
  $$;`);

// ── Correcciones localizadas (0028) ──
console.log("\n▶ Correcciones localizadas");
// reset: flIdea a revisión, sin comentarios ni avisos previos. Viene 'completed'
// del test de aprobar; completed→under_review es ilegal, así que se baja con el
// override de lead (mismo mecanismo que usan los otros setups del harness).
await db.query(`delete from produccion.comments where idea_id=$1`, [flIdea]);
await db.query(`delete from produccion.notifications where entity_id=$1`, [flIdea]);
await db.exec(`select set_config('produccion.lead_override','on',false)`);
await db.query(`update produccion.ideas set status='under_review' where id=$1`, [flIdea]);
await db.exec(`select set_config('produccion.lead_override','',false)`);
const flPlano = await scalar(
  `insert into produccion.planos (idea_id, orden, accion) values ($1, 1, 'x')
     on conflict (idea_id, orden) do update set accion=excluded.accion returning id`, [flIdea]);

// fijar una corrección a un campo concreto — no mueve el estado
const c1 = await scalar(
  `select produccion.rpc_add_correction($1,'planos',$2,'accion','Plano 1 · Acción','Que sonría',$3,null)`,
  [flIdea, flPlano, mGalie]);
eq("add_correction fija al campo (target_campo)",
   await scalar(`select target_campo from produccion.comments where id=$1`, [c1]), "accion");
eq("y guarda la etiqueta humana del destino",
   await scalar(`select target_label from produccion.comments where id=$1`, [c1]), "Plano 1 · Acción");
eq("arranca en ronda 1", Number(await scalar(`select ronda from produccion.comments where id=$1`, [c1])), 1);
eq("y NO mueve el estado (sigue en revisión)",
   await scalar(`select status::text from produccion.ideas where id=$1`, [flIdea]), "under_review");

// 0034: la categoría del cambio (tipo de la rúbrica) se guarda; sin ella queda null
const cCat = await scalar(
  `select produccion.rpc_add_correction(p_idea_id=>$1, p_target_tabla=>'planos', p_target_fila=>$2,
     p_target_campo=>'accion', p_target_label=>'Plano 1 · Acción', p_body=>'Falta acento',
     p_actor_member=>$3, p_categoria=>'ortografia')`,
  [flIdea, flPlano, mGalie]);
eq("0034 · guarda la categoría del cambio",
   await scalar(`select categoria from produccion.comments where id=$1`, [cCat]), "ortografia");
eq("0034 · sin categoría queda null (cambio de campo entero / legacy)",
   await scalar(`select categoria from produccion.comments where id=$1`, [c1]), null);

// segunda corrección abierta → misma ronda
const c2 = await scalar(
  `select produccion.rpc_add_correction($1,'planos',$2,'copy_in','Plano 1 · Copy in','Sube el copy',$3,null)`,
  [flIdea, flPlano, mGalie]);
eq("otra corrección con la ronda abierta = misma ronda",
   Number(await scalar(`select ronda from produccion.comments where id=$1`, [c2])), 1);

// resueltas todas → la siguiente empieza ronda 2
await db.query(`update produccion.comments set resolved_at=now() where idea_id=$1 and kind='correction_request'`, [flIdea]);
const c3 = await scalar(
  `select produccion.rpc_add_correction($1,'planos',$2,'dialogo','Plano 1 · Diálogo','Otro tono',$3,null)`,
  [flIdea, flPlano, mGalie]);
eq("con la ronda anterior cerrada, la nueva es ronda 2",
   Number(await scalar(`select ronda from produccion.comments where id=$1`, [c3])), 2);

// mandar a correcciones: exige pendientes, mueve a in_corrections, avisa
await db.query(`delete from produccion.notifications where entity_id=$1`, [flIdea]);
eq("send_corrections → in_corrections",
   await scalar(`select produccion.rpc_task_send_corrections($1,$2)::text`, [flIdea, mGalie]), "in_corrections");
ok("y avisa a los asignados", (await notifs()).length > 0);

// sin correcciones pendientes, se rechaza
await db.query(`update produccion.comments set resolved_at=now() where idea_id=$1`, [flIdea]);
await db.query(`update produccion.ideas set status='under_review' where id=$1`, [flIdea]);
let sinPend = false;
try { await db.query(`select produccion.rpc_task_send_corrections($1,$2)`, [flIdea, mGalie]); } catch { sinPend = true; }
ok("mandar sin correcciones pendientes se rechaza", sinPend);

// devolver a revisión: in_corrections → under_review (transición nueva) + avisa al lead
await db.query(`update produccion.ideas set status='in_corrections' where id=$1`, [flIdea]);
await db.query(`delete from produccion.notifications where entity_id=$1`, [flIdea]);
eq("return_review → under_review (transición nueva)",
   await scalar(`select produccion.rpc_task_return_review($1,$2)::text`, [flIdea, mGalie]), "under_review");
ok("devolver avisa (al lead)", (await notifs()).length > 0);

// dos lados: atendido (especialista) → confirmado (revisor)
const c4 = await scalar(
  `select produccion.rpc_add_correction($1,'planos',$2,'accion','Plano 1 · Acción','y',$3,null)`,
  [flIdea, flPlano, mGalie]);
await db.query(`update produccion.comments set atendido_at=now(), atendido_by=$2 where id=$1`, [c4, mGalie]);
eq("marcado atendido por el especialista (amber)",
   await scalar(`select case when atendido_at is not null and resolved_at is null then 'done' end from produccion.comments where id=$1`, [c4]), "done");
await db.query(`update produccion.comments set resolved_at=now(), resolved_member_id=$2 where id=$1`, [c4, mGalie]);
eq("confirmado por el revisor (green)",
   await scalar(`select case when resolved_at is not null then 'closed' end from produccion.comments where id=$1`, [c4]), "closed");

// regresión (reap #1): una corrección SIN ronda (camino legacy del tablero) no
// debe contaminar el cálculo — la ronda nueva nunca puede ser NULL.
await db.exec(`select set_config('produccion.lead_override','on',false)`);
await db.query(`update produccion.ideas set status='under_review' where id=$1`, [flIdea]);
await db.exec(`select set_config('produccion.lead_override','',false)`);
await db.query(`update produccion.comments set resolved_at=now() where idea_id=$1 and kind='correction_request'`, [flIdea]);
await db.query(`insert into produccion.comments (idea_id, body, kind) values ($1,'cambio legacy sin ronda','correction_request')`, [flIdea]);
const cN = await scalar(
  `select produccion.rpc_add_correction($1,'planos',$2,'copy_in','Plano 1 · Copy in','x',$3,null)`,
  [flIdea, flPlano, mGalie]);
ok("con una corrección sin ronda presente, la nueva NO es NULL",
   (await scalar(`select ronda from produccion.comments where id=$1`, [cN])) != null);

// regresión (reap #1): el botón legacy (rpc_task_request_changes) ahora estampa ronda
await db.exec(`select set_config('produccion.lead_override','on',false)`);
await db.query(`update produccion.ideas set status='under_review' where id=$1`, [flIdea]);
await db.exec(`select set_config('produccion.lead_override','',false)`);
await scalar(`select produccion.rpc_task_request_changes($1,$2,$3)`, [flIdea, "cambio via boton legacy", mGalie]);
ok("request_changes (legacy) ahora estampa una ronda",
   (await scalar(`select ronda from produccion.comments where idea_id=$1 and body='cambio via boton legacy'`, [flIdea])) != null);

// regresión (reap #2): aprobar CIERRA la ronda — no quedan correcciones sin resolver
await db.exec(`select set_config('produccion.lead_override','on',false)`);
await db.query(`update produccion.ideas set status='under_review' where id=$1`, [flIdea]);
await db.exec(`select set_config('produccion.lead_override','',false)`);
ok("antes de aprobar sí quedan correcciones sin resolver",
   Number(await scalar(`select count(*) from produccion.comments where idea_id=$1 and kind='correction_request' and resolved_at is null`, [flIdea])) > 0);
await scalar(`select produccion.rpc_task_approve($1,$2,$3,$4)`, [flIdea, mGalie, null, null]);
eq("aprobar deja 0 correcciones sin resolver (la ronda queda cerrada)",
   Number(await scalar(`select count(*) from produccion.comments where idea_id=$1 and kind='correction_request' and resolved_at is null`, [flIdea])), 0);

// corrección anclada a una SELECCIÓN (0029): guarda quote + offsets
const cQuote = await scalar(
  `select produccion.rpc_add_correction($1,'planos',$2,'copy_in','Plano 1 · Copy in','sube a 8%',$3,null,'correction_request','6% de CASHBACK*',6,20)`,
  [flIdea, flPlano, mGalie]);
eq("selección: guarda el texto citado (ancla)",
   await scalar(`select target_quote from produccion.comments where id=$1`, [cQuote]), "6% de CASHBACK*");
eq("selección: guarda el offset inicial", Number(await scalar(`select target_start from produccion.comments where id=$1`, [cQuote])), 6);
eq("selección: guarda el offset final", Number(await scalar(`select target_end from produccion.comments where id=$1`, [cQuote])), 20);
const cWhole = await scalar(
  `select produccion.rpc_add_correction($1,'planos',$2,'accion','Plano 1 · Acción','cambia el hook',$3,null)`,
  [flIdea, flPlano, mGalie]);
ok("corrección de campo entero → quote null", (await scalar(`select target_quote from produccion.comments where id=$1`, [cWhole])) === null);

// descartar (borrado duro): el revisor borra una corrección que fijó porque
// cambió de opinión. Espeja el DELETE del server action (scope id+idea_id+kind).
// Se cura solo: correction_next_round mira "¿queda alguna sin resolver?" y el
// botón de acción mira el conteo vivo. cQuote + cWhole están abiertas en la ronda
// actual → fixture limpio de "dos abiertas, borro una".
const rondaViva = Number(await scalar(`select ronda from produccion.comments where id=$1`, [cQuote]));
const abiertasAntes = Number(await scalar(
  `select count(*) from produccion.comments where idea_id=$1 and kind='correction_request' and resolved_at is null`, [flIdea]));
await db.query(`delete from produccion.comments where id=$1 and idea_id=$2 and kind='correction_request'`, [cWhole, flIdea]);
eq("descartar borra la fila", Number(await scalar(`select count(*) from produccion.comments where id=$1`, [cWhole])), 0);
eq("descartar baja el conteo de abiertas en 1",
   Number(await scalar(`select count(*) from produccion.comments where idea_id=$1 and kind='correction_request' and resolved_at is null`, [flIdea])), abiertasAntes - 1);
eq("con otra abierta viva, la ronda NO se bumpea (misma ronda)",
   Number(await scalar(`select produccion.correction_next_round($1)`, [flIdea])), rondaViva);
// borrar la última abierta → 0 sin resolver: el botón revierte a Aprobar, no cuelga la tarea.
await db.query(`delete from produccion.comments where id=$1 and idea_id=$2 and kind='correction_request'`, [cQuote, flIdea]);
eq("borrar la última abierta deja 0 sin resolver (no cuelga la tarea)",
   Number(await scalar(`select count(*) from produccion.comments where idea_id=$1 and kind='correction_request' and resolved_at is null`, [flIdea])), 0);

// specialist_lead: es equipo (ve la plantilla) pero NO revisa
eq("'specialist_lead' existe en el enum app_role",
   await scalar(`select 'specialist_lead' = any(enum_range(null::produccion.app_role)::text[])`), true);
const anyP = (await q(`select id, role::text as role from produccion.profiles limit 1`))[0];
if (anyP) {
  await db.query(`update produccion.profiles set role='specialist_lead' where id=$1`, [anyP.id]);
  await db.exec(`select set_config('request.jwt.claims', json_build_object('sub','${anyP.id}')::text, false);`);
  eq("specialist_lead ve la plantilla (is_team)", await scalar(`select produccion.is_team()`), true);
  eq("pero specialist_lead NO revisa (is_lead false)", await scalar(`select produccion.is_lead()`), false);
  await db.exec(`select set_config('request.jwt.claims','', false);`);
  await db.query(`update produccion.profiles set role=$2 where id=$1`, [anyP.id, anyP.role]);
} else {
  ok("(sin profiles en el harness — is_team specialist_lead se verifica en vivo)", true);
}

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

// Una tarea de VIDEO de 10-40s en FB (duracion ahora es text[]: una pastilla).
await db.query(
  `update produccion.ideas set tipo_asset='RP Video', plataformas='{FB,TT}', duracion='{10-40s}',
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
  `update produccion.ideas set tipo_asset='Images', plataformas='{FB,GG,TT}', duracion='{}'
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
eq("el read-time se calcula solo (11 palabras habladas × 3/10 → 4s)", Number(pl.read_time_s), 4);
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


// ── CONTRACT: readTimeS() TS === trigger de planos ──
console.log("\n▶ Read-time — contrato TS vs DB");
const DIALOGOS = [
  "", "   ", "Hola", "Hola mundo",
  "Hasta seis por ciento de cashback en todas tus compras diarias",
  "Uno  dos   tres", "Con\nsaltos\nde línea", "Acentuación en español mexicano",
  "a b c d e f g h i j k l m n o p q r s t",
  // No hablado: etiquetas de locutor "(...)" y negrita "**" (deben coincidir TS vs DB).
  "(Actriz 1) Hola mundo",
  "(Actriz 1) ¿Y sin historial crediticio? (Actriz 2) Así es, con **tasa del 4%**",
  "(Ambas) Pídelo ya en **DiDi Finanzas**.",
  "**sólo negrita sin locutor**",
  "(Ambos actores)",
  "(sólo una etiqueta larga sin nada hablado afuera)",
];
let rtMismatch = 0;
for (const d of DIALOGOS) {
  await db.query(`update produccion.planos set dialogo=$1 where orden=9`, [d]);
  const sql = Number(await scalar(`select read_time_s from produccion.planos where orden=9`));
  if (sql !== readTimeS(d)) {
    rtMismatch++;
    console.error(`      "${d.slice(0,30)}": db=${sql} ts=${readTimeS(d)}`);
  }
}
ok(`TS readTimeS() === trigger en ${DIALOGOS.length} diálogos`, rtMismatch === 0);

// ── CONTRACT: reglasQueAplican() TS === reglas_para_tarea() SQL ──
console.log("\n▶ Reglas — contrato TS vs DB");
const todasLasReglas = await q(`select codigo, titulo, mensaje, severidad, scope,
  cond_media, cond_tipo_group, cond_plataformas, cond_marca_slug,
  cond_duracion_min_s, cond_texto_contiene, sort_order from produccion.reglas where activo`);

// duracion ahora es text[]: cada escenario trae un arreglo de pastillas ([] = sin).
const ESCENARIOS = [
  { tipo: "RP Video",     plats: ["FB","TT"],      dur: ["10-40s"], marca: "card",      texto: "" },
  { tipo: "RP Video",     plats: ["GG"],           dur: ["15-30s"], marca: "prestamos", texto: "" },
  { tipo: "Images",       plats: ["FB","GG","TT"], dur: [],         marca: "card",      texto: "" },
  { tipo: "Images",       plats: ["GG"],           dur: [],         marca: "card",      texto: "6% de CASHBACK" },
  { tipo: "Normal Video", plats: ["TT"],           dur: ["50-60s"], marca: "card",      texto: "12 MSI" },
  // Dos pastillas: la regla mira la MÁS larga (10-15s ignora el mínimo, 30-40s lo dispara).
  { tipo: "Normal Video", plats: ["TT"],           dur: ["10-15s","30-40s"], marca: "card", texto: "" },
  { tipo: "Copies",       plats: ["GG"],           dur: [],         marca: "prestamos", texto: "" },
  { tipo: "Podcast",      plats: [],               dur: [],         marca: null,        texto: "" },
];
let regMismatch = 0;
for (const e of ESCENARIOS) {
  await db.query(
    `update produccion.ideas set tipo_asset=$1, plataformas=$2, duracion=$3,
            marca_id=(select id from produccion.marcas where slug=$4)
      where id='00000000-0000-0000-0000-0000000000d1'`,
    [e.tipo, e.plats, e.dur, e.marca]);
  const sql = (await q(
    `select codigo from produccion.reglas_para_tarea('00000000-0000-0000-0000-0000000000d1',$1) order by sort_order`,
    [e.texto])).map((r) => r.codigo).join("|");
  const ts = reglasQueAplican(todasLasReglas, {
    tipoAsset: e.tipo, plataformas: e.plats, duracion: e.dur,
    marcaSlug: e.marca, texto: e.texto,
  }).map((r) => r.codigo).join("|");
  if (sql !== ts) {
    regMismatch++;
    console.error(`      ${e.tipo}/${e.plats.join("+")}/${e.dur}: sql=[${sql}] ts=[${ts}]`);
  }
}
ok(`TS reglasQueAplican() === SQL reglas_para_tarea() en ${ESCENARIOS.length} escenarios`, regMismatch === 0);

// ── 0031: la Duración es un arreglo (pastillas); cada una es su propio archivo ──
// Ya NO hay trigger que copie una duración única a los assets: el fan-out lo hacen
// las rutas de creación (rpc_crear_brief / import) y, al editar, la acción de
// servidor guardarDuraciones (que reconcilia los assets, no probable desde aquí).
// Cada asset guarda SU duración; build_filename la mete en el nombre por-asset.
console.log("\n▶ Duración multi (0031) — arreglo + índice por duración");
await resetRole();

eq("ideas.duracion es un arreglo (text[])",
   await scalar(`select data_type from information_schema.columns
                  where table_schema='produccion' and table_name='ideas' and column_name='duracion'`),
   "ARRAY");
ok("el trigger propagar_duracion ya no existe",
   Number(await scalar(`select count(*)::int from pg_trigger where tgname='ideas_duracion_propaga'`)) === 0);

// El índice único ahora incluye la duración: dos videos del mismo tamaño×plataforma
// pero distinta duración conviven; repetir la misma choca.
await db.exec(`delete from produccion.assets where idea_id='00000000-0000-0000-0000-0000000000d1'`);
await db.exec(`insert into produccion.assets
    (idea_id, brief_id, naming_kind, naming_base, tamano_code, plataforma_code,
     duracion_code, genero_code, idea_code, mes_code)
  values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b1',
          'real','DURTEST','9:16','FB','15-30s','WOMAN','A1','AUG26'),
         ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b1',
          'real','DURTEST','9:16','FB','40-50s','WOMAN','A1','AUG26');`);
eq("dos duraciones del mismo tamaño×plataforma conviven",
   Number(await scalar(`select count(*)::int from produccion.assets
                         where idea_id='00000000-0000-0000-0000-0000000000d1'`)), 2);

let duraDupChoco = false;
try {
  await db.exec(`insert into produccion.assets
      (idea_id, brief_id, naming_kind, naming_base, tamano_code, plataforma_code,
       duracion_code, genero_code, idea_code, mes_code)
    values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b1',
            'real','DURTEST','9:16','FB','40-50s','WOMAN','A1','AUG26');`);
} catch { duraDupChoco = true; }
ok("repetir (tamaño,plataforma,duración,versión) choca con el índice único", duraDupChoco);

// Cada asset lleva SU duración en el nombre (build_filename por-asset).
const nombrePorDur = (d) =>
  scalar(`select filename from produccion.assets
           where idea_id='00000000-0000-0000-0000-0000000000d1' and duracion_code=$1`, [d]);
ok("el archivo de 15-30s lleva su token", (await nombrePorDur("15-30s")).includes("_15-30S_"));
ok("el archivo de 40-50s lleva su token", (await nombrePorDur("40-50s")).includes("_40-50S_"));

// Un asset sin duración (null) no gana token — igual que un estático.
await db.exec(`delete from produccion.assets where idea_id='00000000-0000-0000-0000-0000000000d1'`);
await db.exec(`insert into produccion.assets
    (idea_id, brief_id, naming_kind, naming_base, tamano_code, plataforma_code,
     duracion_code, genero_code, idea_code, mes_code)
  values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b1',
          'real','DURTEST','9:16','FB',null,'WOMAN','A1','AUG26');`);
eq("sin duracion_code el nombre queda sin token",
   await scalar(`select filename from produccion.assets
                  where idea_id='00000000-0000-0000-0000-0000000000d1'`),
   "DURTEST_9X16_WOMAN_REAL_VIDEO_IDEAA1_FB_V1_AUG26_RN");

// ── rpc_set_duraciones: editar pastillas reconciliando entregables (atómico) ──
console.log("\n▶ rpc_set_duraciones — reconciliar por duración");
const IDEA_D = "00000000-0000-0000-0000-0000000000d1";
await db.exec(`delete from produccion.assets where idea_id='${IDEA_D}';
  insert into produccion.assets
    (idea_id, brief_id, naming_kind, naming_base, tamano_code, plataforma_code, duracion_code, genero_code, idea_code, mes_code)
  values ('${IDEA_D}','00000000-0000-0000-0000-0000000000b1','real','DURTEST','9:16','FB',null,'WOMAN','A1','AUG26'),
         ('${IDEA_D}','00000000-0000-0000-0000-0000000000b1','real','DURTEST','1:1','FB',null,'WOMAN','A1','AUG26');`);

// Agregar dos pastillas: cada par (2) se despliega en 2 duraciones → 4 filas.
await db.exec(`select produccion.rpc_set_duraciones('${IDEA_D}', array['15-30s','40s'])`);
eq("agregar 2 duraciones → 2 pares × 2 = 4 assets",
   Number(await scalar(`select count(*)::int from produccion.assets where idea_id='${IDEA_D}'`)), 4);
eq("ideas.duracion guarda ambas pastillas en orden",
   await scalar(`select array_to_string(duracion,',') from produccion.ideas where id='${IDEA_D}'`), "15-30s,40s");
ok("las 4 filas nacen en 'todo'/versión 1 (no heredan estado del hermano)",
   Number(await scalar(`select count(*)::int from produccion.assets where idea_id='${IDEA_D}' and status='todo' and version=1`)) === 4);
eq("ya no queda la fila sin duración (null dejó de ser objetivo)",
   Number(await scalar(`select count(*)::int from produccion.assets where idea_id='${IDEA_D}' and duracion_code is null`)), 0);

// Quitar una pastilla VIRGEN → se borran sus filas.
await db.exec(`select produccion.rpc_set_duraciones('${IDEA_D}', array['15-30s'])`);
eq("quitar '40s' (virgen) → 2 assets",
   Number(await scalar(`select count(*)::int from produccion.assets where idea_id='${IDEA_D}'`)), 2);

// GUARDA: subir una entrega a 15-30s/9:16 (storage_path = archivo subido), luego
// intentar quitar 15-30s → RECHAZO. (Se deja status='todo' para no chocar con el
// trigger de transiciones; storage_path ya es señal de trabajo producido.)
await db.exec(`update produccion.assets set storage_path='x/y.mp4', version=2
                where idea_id='${IDEA_D}' and duracion_code='15-30s' and tamano_code='9:16'`);
let duraGuard = false;
try {
  await db.exec(`select produccion.rpc_set_duraciones('${IDEA_D}', array['40s'])`);
} catch { duraGuard = true; }
ok("quitar una duración con entrega subida/en revisión se RECHAZA", duraGuard);
eq("tras el rechazo NO se borró nada (siguen 2 assets)",
   Number(await scalar(`select count(*)::int from produccion.assets where idea_id='${IDEA_D}'`)), 2);
eq("tras el rechazo ideas.duracion no cambió (atómico)",
   await scalar(`select array_to_string(duracion,',') from produccion.ideas where id='${IDEA_D}'`), "15-30s");

// Estático: no se despliega por duración — sólo se guarda el arreglo.
await db.exec(`delete from produccion.assets where idea_id='${IDEA_D}';
  insert into produccion.assets
    (idea_id, brief_id, naming_kind, naming_base, tamano_code, plataforma_code, duracion_code, genero_code, idea_code, mes_code)
  values ('${IDEA_D}','00000000-0000-0000-0000-0000000000b1','static','DURTEST','1:1','GG',null,'WOMAN','A1','AUG26');`);
await db.exec(`select produccion.rpc_set_duraciones('${IDEA_D}', array['15-30s','40s'])`);
eq("estático: guarda el arreglo de pastillas",
   await scalar(`select array_to_string(duracion,',') from produccion.ideas where id='${IDEA_D}'`), "15-30s,40s");
eq("estático: NO se despliega por duración (sigue 1 asset)",
   Number(await scalar(`select count(*)::int from produccion.assets where idea_id='${IDEA_D}'`)), 1);

eq("TREND y NOTAS ya tienen dónde guardarse",
   Number(await scalar(`select count(*) from information_schema.columns
                         where table_schema='produccion' and table_name='ideas'
                           and column_name in ('trend','notas')`)), 2);

await db.exec(`delete from produccion.assets where idea_id='00000000-0000-0000-0000-0000000000d1'`);

// ── 0014/0015: Enviar a cliente + leads en las asignaciones ──
console.log("\n▶ Enviar a cliente — 5º verbo");
await resetRole();
{
  const IDEA = "00000000-0000-0000-0000-0000000000d1";
  // Estado conocido: aprobada y con un asignado que NO es quien publica.
  await db.exec(`update produccion.ideas set status='completed' where id='${IDEA}'`);
  await db.exec(`delete from produccion.notifications`);

  const quienPublica = await scalar(
    `select id from produccion.track_members
      where id not in (select member_id from produccion.idea_assignments
                        where idea_id='${IDEA}' and member_id is not null)
      limit 1`);
  await db.query(`select produccion.rpc_task_send_client($1::uuid, $2::uuid)`, [IDEA, quienPublica]);

  eq("send_client mueve a published",
     await scalar(`select status from produccion.ideas where id='${IDEA}'`), "published");
  ok("published_at quedó sellado",
     (await scalar(`select published_at from produccion.ideas where id='${IDEA}'`)) !== null);
  ok("los asignados recibieron task_published",
     Number(await scalar(`select count(*) from produccion.notifications
                           where type='task_published' and entity_id='${IDEA}'`)) >= 1);
  eq("el movimiento quedó en el historial",
     await scalar(`select to_status::text from produccion.status_events
                    where idea_id='${IDEA}' order by created_at desc limit 1`),
     "published");

  // El trigger no se evade: un update directo también notifica.
  // (El reset published→completed no es una transición legal — se pasa con el
  // override de lead, que es exactamente para eso.)
  await db.exec(`select set_config('produccion.lead_override','on',false);
                 update produccion.ideas set status='completed' where id='${IDEA}';
                 select set_config('produccion.lead_override','',false);
                 delete from produccion.notifications;
                 update produccion.ideas set status='published' where id='${IDEA}'`);
  ok("un update directo a published también notifica (trigger, no verbo)",
     Number(await scalar(`select count(*) from produccion.notifications
                           where type='task_published'`)) >= 1);

  // ── 0037 — cambios LOCALIZADOS del cliente (portal) ──
  // El cliente selecciona texto → escribe el cambio (sin categoría). Cada uno es
  // un pin client_change anclado al campo, pendiente hasta que "Pedir cambios".
  await db.exec(`delete from produccion.comments where idea_id='${IDEA}' and kind='client_change'`);
  const cPin = "00000000-0000-0000-0000-0000000000e1";
  const pin1 = await scalar(
    `select produccion.rpc_client_add_change('${IDEA}'::uuid,'planos','${cPin}'::uuid,'copy_in',
      'Plano 1 · Copy in','Cámbialo a algo más corto','texto viejo',0,10)`);
  ok("client_add_change crea un pin", typeof pin1 === "string" && pin1.length === 36);
  eq("el pin se ancla al campo (localizado)",
     await scalar(`select target_campo from produccion.comments where id='${pin1}'`), "copy_in");
  ok("el pin no lleva categoría (el cliente no puntúa)",
     (await scalar(`select categoria from produccion.comments where id='${pin1}'`)) === null);
  ok("el pin queda pendiente (resolved_at null)",
     (await scalar(`select resolved_at from produccion.comments where id='${pin1}'`)) === null);
  await db.query(
    `select produccion.rpc_client_add_change($1::uuid,'planos',$2::uuid,'dialogo',
      'Plano 1 · Diálogos','Otro ajuste',null,null,null)`, [IDEA, cPin]);
  ok("dos pins pendientes (borrador = ronda null)",
     Number(await scalar(`select count(*) from produccion.comments
       where idea_id='${IDEA}' and kind='client_change' and ronda is null`)) === 2);

  await db.exec(`delete from produccion.notifications`);
  const stSubmit = await scalar(`select produccion.rpc_client_submit_changes('${IDEA}'::uuid)`);
  eq("submit mueve published→in_corrections", stSubmit, "in_corrections");
  // 0038: submit ASIGNA ronda (marca enviado) pero NO resuelve — el client_change
  // entra OPEN al lifecycle (rojo), como una corrección interna; lo confirma el lead.
  ok("submit asigna ronda a los pins (enviado)",
     Number(await scalar(`select count(*) from produccion.comments
       where idea_id='${IDEA}' and kind='client_change' and ronda is not null`)) === 2);
  ok("submit NO resuelve los pins (siguen OPEN para el lifecycle)",
     Number(await scalar(`select count(*) from produccion.comments
       where idea_id='${IDEA}' and kind='client_change' and resolved_at is null`)) === 2);
  // El client_change enviado cuenta en la ronda: correction_next_round lo ve OPEN →
  // devuelve la ronda actual (no abre una nueva), como con una corrección interna viva.
  const rondaCC = Number(await scalar(`select ronda from produccion.comments
     where idea_id='${IDEA}' and kind='client_change' and ronda is not null limit 1`));
  eq("correction_next_round cuenta el client_change enviado (misma ronda)",
     Number(await scalar(`select produccion.correction_next_round('${IDEA}'::uuid)`)), rondaCC);
  // 0038 fix: "Pedir cambios" (send_corrections) cuenta los client_change enviados —
  // antes reventaba ("no hay correcciones") cuando lo pendiente era del cliente.
  await db.exec(`select set_config('produccion.lead_override','on',false);
                 update produccion.ideas set status='under_review' where id='${IDEA}';
                 select set_config('produccion.lead_override','',false)`);
  eq("send_corrections con SÓLO client_change enviados → in_corrections",
     await scalar(`select produccion.rpc_task_send_corrections('${IDEA}'::uuid,null,null)`), "in_corrections");
  // rpc_task_approve CIERRA la ronda incluyendo los client_change enviados sin resolver.
  await db.exec(`select set_config('produccion.lead_override','on',false);
                 update produccion.ideas set status='under_review' where id='${IDEA}';
                 select set_config('produccion.lead_override','',false)`);
  await scalar(`select produccion.rpc_task_approve('${IDEA}'::uuid,null,null,null)`);
  ok("aprobar resuelve también los client_change enviados",
     Number(await scalar(`select count(*) from produccion.comments
       where idea_id='${IDEA}' and kind='client_change' and ronda is not null and resolved_at is null`)) === 0);
  // Tras el submit la idea está in_corrections (no publicada) → añadir un pin se rechaza.
  let addRechazado = false;
  try {
    await scalar(`select produccion.rpc_client_add_change('${IDEA}'::uuid,'planos','${cPin}'::uuid,
      'copy_in','x','y',null,null,null)`);
  } catch { addRechazado = true; }
  ok("un pin sobre idea NO publicada se rechaza", addRechazado);

  // Dejar la idea publicada para el bloque siguiente (revisión del lead).
  await db.exec(`select set_config('produccion.lead_override','on',false);
                 update produccion.ideas set status='published' where id='${IDEA}';
                 select set_config('produccion.lead_override','',false);
                 delete from produccion.notifications`);

  // ── 0054 — el LEAD aplica los cambios del cliente y REENVÍA directo al cliente ──
  // (in_corrections→published, sin ronda de revisión). Resuelve los client_change.
  await db.exec(`delete from produccion.comments where idea_id='${IDEA}' and kind='client_change'`);
  await db.query(
    `select produccion.rpc_client_add_change($1::uuid,'planos',$2::uuid,'copy_in',
      'Plano 1 · Copy in','Acórtalo','viejo',0,5)`, [IDEA, cPin]);
  await scalar(`select produccion.rpc_client_submit_changes('${IDEA}'::uuid)`);
  eq("reenvia: precondición in_corrections con cambios sin resolver",
     await scalar(`select status from produccion.ideas where id='${IDEA}'`), "in_corrections");
  await db.exec(`delete from produccion.notifications`);
  // La server action corre con service-role → rpc_move_task permite el override de lead
  // (in_corrections→published no es transición normal). Se simula con el claim service_role.
  await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
  const stReenvio = await scalar(
    `select produccion.rpc_lead_reenvia_cliente($1::uuid,$2::uuid,null)::text`, [IDEA, mGalie]);
  eq("reenvia mueve in_corrections→published", stReenvio, "published");
  ok("reenvia RESUELVE los client_change enviados sin resolver",
     Number(await scalar(`select count(*) from produccion.comments
       where idea_id='${IDEA}' and kind='client_change' and ronda is not null and resolved_at is null`)) === 0);
  ok("reenvia notifica el published (asignados + cliente ready_for_review)",
     Number(await scalar(`select count(*) from produccion.notifications where entity_id='${IDEA}'`)) >= 1);
  let reenvioRechazado = false;
  try { await scalar(`select produccion.rpc_lead_reenvia_cliente($1::uuid,null,null)`, [IDEA]); }
  catch { reenvioRechazado = true; }
  ok("reenvia se rechaza si la idea NO está en correcciones", reenvioRechazado);
  await db.exec(`select set_config('request.jwt.claims','',false)`);

  // Un lead miembro asignado recibe el aviso de revisión.
  const LEAD_M = await scalar(
    `select member_id from produccion.idea_assignments
      where idea_id='${IDEA}' and member_id is not null limit 1`);
  await db.query(`update produccion.track_members set es_lead=true where id=$1`, [LEAD_M]);
  await db.query(`update produccion.idea_assignments set es_lead=true
                   where idea_id='${IDEA}' and member_id=$1`, [LEAD_M]);
  await db.exec(`select set_config('produccion.lead_override','on',false);
                 update produccion.ideas set status='in_progress' where id='${IDEA}';
                 select set_config('produccion.lead_override','',false);
                 delete from produccion.notifications;
                 update produccion.ideas set status='under_review' where id='${IDEA}'`);
  ok("a revisión: el miembro lead asignado recibe aviso",
     Number(await scalar(`select count(*) from produccion.notifications
                           where recipient_member_id=$1 and type='task_submitted'`, [LEAD_M])) === 1,
  );

  // board_tasks separa leads de team sin tocar members.
  const fila = (await q(`select member_ids, lead_ids, team_ids from produccion.board_tasks
                          where id='${IDEA}'`))[0];
  const union = [...(fila.lead_ids ?? []), ...(fila.team_ids ?? [])].sort();
  eq("lead_ids ∪ team_ids = member_ids",
     JSON.stringify(union), JSON.stringify([...(fila.member_ids ?? [])].sort()));
  ok("lead_ids y team_ids son disjuntos",
     (fila.lead_ids ?? []).every((x) => !(fila.team_ids ?? []).includes(x)));

  // Volver al estado que esperan los tests de abajo.
  await db.query(`update produccion.track_members set es_lead=false where id=$1`, [LEAD_M]);
  await db.query(`update produccion.idea_assignments set es_lead=false
                   where idea_id='${IDEA}' and member_id=$1`, [LEAD_M]);
  await db.exec(`select set_config('produccion.lead_override','on',false);
                 update produccion.ideas set status='todo' where id='${IDEA}';
                 select set_config('produccion.lead_override','',false);
                 delete from produccion.notifications`);
}

// ── 0014: marcar leads entre los asignados (lo que hace setLeads) ──
console.log("\n▶ Lead vs Team en las asignaciones");
{
  const IDEA = "00000000-0000-0000-0000-0000000000d1";
  await resetRole();
  // Dos asignados; marcar uno como lead.
  const dos = await q(`select id from produccion.track_members order by sort_order limit 2`);
  await db.query(`delete from produccion.idea_assignments where idea_id=$1`, [IDEA]);
  await db.query(
    `insert into produccion.idea_assignments (idea_id, member_id) values ($1,$2),($1,$3)`,
    [IDEA, dos[0].id, dos[1].id]);

  // setLeads: todos a false, el elegido a true.
  await db.query(`update produccion.idea_assignments set es_lead=false where idea_id=$1`, [IDEA]);
  await db.query(`update produccion.idea_assignments set es_lead=true
                   where idea_id=$1 and member_id=$2`, [IDEA, dos[0].id]);

  const fila = (await q(`select leads, team, lead_ids, team_ids from produccion.board_tasks
                          where id='${IDEA}'`))[0];
  eq("board_tasks: un lead marcado", (fila.lead_ids ?? []).length, 1);
  eq("board_tasks: el otro queda en team", (fila.team_ids ?? []).length, 1);
  ok("el lead es el que marcamos", (fila.lead_ids ?? [])[0] === dos[0].id);
  ok("leads trae nombre y color para el chip",
     Array.isArray(fila.leads) && fila.leads[0]?.name != null && fila.leads[0]?.color != null);

  await db.query(`delete from produccion.idea_assignments where idea_id=$1`, [IDEA]);
}

// ── 0016: la misma referencia puede colgar de DOS planos ──
// Es la razón de existir de plano_references (idea_references no puede: su PK
// es (idea_id, reference_id)).
console.log("\n▶ Referencias por plano");
{
  const IDEA = "00000000-0000-0000-0000-0000000000d1";
  await resetRole();
  await db.exec(`delete from produccion.planos where idea_id='${IDEA}';
    insert into produccion.planos (idea_id, orden) values ('${IDEA}',1),('${IDEA}',2);`);
  const planos = await q(`select id from produccion.planos where idea_id='${IDEA}' order by orden`);
  const ref = (await q(`insert into produccion.references (url, kind, platform)
    values ('https://tiktok.com/@x/video/999','video','tiktok') returning id`))[0];

  await db.query(`insert into produccion.plano_references (plano_id, reference_id)
                   values ($1,$3),($2,$3)`, [planos[0].id, planos[1].id, ref.id]);
  eq("la misma referencia cuelga de 2 planos",
     Number(await scalar(`select count(*) from produccion.plano_references where reference_id=$1`, [ref.id])),
     2);

  // El CHECK: una imagen SIEMPRE tiene storage_path.
  let bloqueado = false;
  try {
    await db.exec(`insert into produccion.references (url, kind) values ('x://y','imagen')`);
  } catch { bloqueado = true; }
  ok("una imagen sin storage_path se rechaza", bloqueado);

  await db.exec(`delete from produccion.plano_references where reference_id='${ref.id}';
                 delete from produccion.references where id='${ref.id}';
                 delete from produccion.planos where idea_id='${IDEA}'`);
}

// ── CONTRACT: toda acción que ofrece actionsFor() es legal en SQL ──
// El botón vive en TS; el candado en transition_allowed. Si divergen, la UI
// ofrece un movimiento que la BD rechaza — o peor, deja de ofrecer uno legal.
console.log("\n▶ Botones — contrato actionsFor() vs transition_allowed()");
{
  const ROLES = ["admin", "lead", "creative", "client"];
  const CTXS = [
    { isAssignee: true, hasAssignee: true },
    { isAssignee: false, hasAssignee: true },
    { isAssignee: false, hasAssignee: false },
  ];
  const ESTADOS = ["todo","in_progress","under_review","in_corrections","completed","published","delivered"];
  let ofrecidas = 0, ilegales = 0;
  for (const status of ESTADOS)
    for (const role of ROLES)
      for (const c of CTXS)
        for (const a of actionsFor(status, { ...c, role })) {
          ofrecidas++;
          const legal = await scalar(
            `select produccion.transition_allowed($1::produccion.asset_status,$2::produccion.asset_status)`,
            [status, a.to]);
          if (!legal) {
            ilegales++;
            console.error(`      ${status} → ${a.to} (${a.verb}, ${role}) no es legal en SQL`);
          }
        }
  ok(`las ${ofrecidas} acciones ofrecidas por actionsFor() son legales en SQL`, ilegales === 0);
}

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

// ── rpc_crear_brief: crear un brief nuevo, atómico ──
console.log("\n▶ rpc_crear_brief — captura de brief (atómica)");

const callCrear = async (payload) => {
  const r = (await db.query(`select produccion.rpc_crear_brief($1::jsonb) as out`, [JSON.stringify(payload)])).rows[0].out;
  return typeof r === "string" ? JSON.parse(r) : r;
};

const CLIENT = "00000000-0000-0000-0000-000000000001";
const MARCA_CARD = "00000000-0000-0000-0000-0000000000a1";
// Un miembro real ya sembrado por la migración (unique (track, name)).
const MEM_VERO = await scalar(`select id from produccion.track_members where track='real' order by sort_order limit 1`);

const okPayload = {
  client_id: CLIENT,
  code: "DIDI-CREARTEST-REAL",
  title: "Brief de prueba",
  track: "real",
  mes_code: "AUG26",
  created_by: null,
  tasks: [
    {
      family_letter: "A", variant_number: 1, marca_id: MARCA_CARD,
      naming_base: "SPAPX", naming_kind: "real", tipo_asset: "RP Video",
      plataformas: ["GG", "FB"], tamanos: ["9:16"], duracion: ["25s"],
      concepto: "Concepto A", member_ids: [MEM_VERO],
      // duracion ahora es text[] y cada combo trae su duracion_code (lo despliega TS).
      assets: [
        { tamano_code: "9:16", plataforma_code: "GG", duracion_code: "25s" },
        { tamano_code: "9:16", plataforma_code: "FB", duracion_code: "25s" },
      ],
    },
    {
      family_letter: "A", variant_number: 2, marca_id: MARCA_CARD,
      naming_base: "SPAPX", naming_kind: "real", tipo_asset: "RP Video",
      plataformas: ["GG"], tamanos: ["9:16"], duracion: ["25s"],
      concepto: "Concepto A2", member_ids: [],
      assets: [{ tamano_code: "9:16", plataforma_code: "GG", duracion_code: "25s" }],
    },
    {
      family_letter: "B", variant_number: 1, marca_id: MARCA_CARD,
      naming_kind: "static", tipo_asset: "Copies",
      plataformas: [], tamanos: [], concepto: "Un copy", member_ids: [],
      assets: [], // un copy es texto: 0 archivos
    },
  ],
};

const out = await callCrear(okPayload);
eq("crea 3 tareas", out.created_tasks, 3);
eq("crea 3 assets (copies → 0)", out.created_assets, 3);

const BRIEF = out.brief_id;
eq("2 familias (A, B)", await scalar(`select count(*)::int from produccion.idea_families where brief_id=$1`, [BRIEF]), 2);
eq("códigos de idea A1/A2/B1", await scalar(`select string_agg(code, ',' order by code) from produccion.ideas where brief_id=$1`, [BRIEF]), "A1,A2,B1");
eq("3 assets bajo el brief", await scalar(`select count(*)::int from produccion.assets where brief_id=$1`, [BRIEF]), 3);
eq(
  "filename lo pone el trigger",
  await scalar(`select a.filename from produccion.assets a join produccion.ideas i on i.id=a.idea_id where i.brief_id=$1 and i.code='A1' and a.plataforma_code='GG' limit 1`, [BRIEF]),
  "SPAPX_9X16_25S_REAL_VIDEO_IDEAA1_GG_V1_AUG26_RN",
);
eq("Vero quedó asignada a A1", await scalar(`select count(*)::int from produccion.idea_assignments ia join produccion.ideas i on i.id=ia.idea_id where i.brief_id=$1 and i.code='A1' and ia.member_id=$2`, [BRIEF, MEM_VERO]), 1);

// atomicidad: dos tareas con la MISMA variante en la misma familia → choca la
// unique (family_id, variant_number) → la función entera revierte, sin brief a medias.
const badPayload = {
  ...okPayload,
  code: "DIDI-ATOMIC-REAL",
  tasks: [
    { family_letter: "C", variant_number: 1, naming_kind: "real", tipo_asset: "RP Video", plataformas: [], tamanos: [], concepto: "C1", member_ids: [], assets: [] },
    { family_letter: "C", variant_number: 1, naming_kind: "real", tipo_asset: "RP Video", plataformas: [], tamanos: [], concepto: "C1 dup", member_ids: [], assets: [] },
  ],
};
let threw = false;
try { await callCrear(badPayload); } catch { threw = true; }
ok("una tarea inválida hace fallar el RPC", threw);
eq("nada quedó a medias (rollback del brief entero)", await scalar(`select count(*)::int from produccion.briefs where code like 'DIDI-ATOMIC%'`), 0);

// code único: reusar el mismo code sufija en vez de chocar
const dupCode = await callCrear({ ...okPayload, tasks: [okPayload.tasks[2]] });
eq("code duplicado se sufija", await scalar(`select code from produccion.briefs where id=$1`, [dupCode.brief_id]), "DIDI-CREARTEST-REAL-2");

// ── 0031: fan-out por duración en el RPC — dos pastillas → dos archivos ──
// Una tarea de un solo tamaño×plataforma pero DOS duraciones crea DOS assets,
// cada uno con su duracion_code y su propio nombre (TS despliega los combos).
const fanOut = await callCrear({
  ...okPayload,
  code: "DIDI-FANOUT-REAL",
  tasks: [{
    family_letter: "A", variant_number: 1, marca_id: MARCA_CARD,
    naming_base: "SPAPX", naming_kind: "real", tipo_asset: "RP Video",
    plataformas: ["GG"], tamanos: ["9:16"], duracion: ["15-30s", "40s"],
    concepto: "Fan-out", member_ids: [],
    assets: [
      { tamano_code: "9:16", plataforma_code: "GG", duracion_code: "15-30s" },
      { tamano_code: "9:16", plataforma_code: "GG", duracion_code: "40s" },
    ],
  }],
});
eq("fan-out: 2 duraciones → 2 assets", fanOut.created_assets, 2);
eq("la idea guarda ambas pastillas (text[])",
   await scalar(`select array_to_string(duracion,',') from produccion.ideas where brief_id=$1`, [fanOut.brief_id]),
   "15-30s,40s");
eq("los dos archivos difieren sólo por la duración",
   await scalar(`select string_agg(filename, '|' order by duracion_code) from produccion.assets where brief_id=$1`, [fanOut.brief_id]),
   "SPAPX_9X16_15-30S_REAL_VIDEO_IDEAA1_GG_V1_AUG26_RN|SPAPX_9X16_40S_REAL_VIDEO_IDEAA1_GG_V1_AUG26_RN");

// ── rpc_notificar_brief: nuevo brief avisa a cada especialista con su conteo ──
console.log("\n▶ rpc_notificar_brief — nuevo brief avisa a especialistas");
const nAvisos = await scalar(`select produccion.rpc_notificar_brief($1)`, [BRIEF]);
eq("crea 1 aviso (sólo Vero está asignada en el brief)", nAvisos, 1);
eq("aviso es tipo brief_created para Vero",
   await scalar(`select type from produccion.notifications where recipient_member_id=$1 and type='brief_created' limit 1`, [MEM_VERO]), "brief_created");
eq("el cuerpo dice 1 tarea + call to action",
   await scalar(`select body from produccion.notifications where type='brief_created' limit 1`),
   "Tienes 1 tarea en este brief. Da click para ir a tus tareas.");
eq("entregas: in_app sent + email pending",
   await scalar(`select string_agg(d.channel||':'||d.status, ',' order by d.channel) from produccion.notification_deliveries d join produccion.notifications n on n.id=d.notification_id where n.type='brief_created'`),
   "email:pending,in_app:sent");

// ── rpc_import_planos: importar un guión pegado (replace / append) ──
console.log("\n▶ rpc_import_planos — importar guión pegado");
{
  const IDEA = "00000000-0000-0000-0000-0000000000d1";
  await resetRole();
  await db.exec(`delete from produccion.planos where idea_id='${IDEA}';
    insert into produccion.planos (idea_id, orden, titulo) values ('${IDEA}',1,'viejo 1'),('${IDEA}',2,'viejo 2');`);

  const imp = (planos, modo) =>
    scalar(`select produccion.rpc_import_planos($1, $2::jsonb, $3)`, [IDEA, JSON.stringify(planos), modo]);
  const planos = [
    { titulo: "Plano 1", accion: "hace algo", copy_in: "compra ya", dialogo: "(Actriz) hola cómo estás tú" },
    { titulo: "Plano 2", accion: "otra cosa", sfx: "pop" },
    { titulo: "Plano 3" }, // sin más campos → todos null
  ];

  // replace: reemplaza los 2 viejos por 3 nuevos, orden 1..3
  eq("replace crea 3 planos", Number(await imp(planos, "replace")), 3);
  eq("replace deja exactamente 3 (borró los viejos)",
     Number(await scalar(`select count(*) from produccion.planos where idea_id=$1`, [IDEA])), 3);
  eq("replace reordena desde 1",
     await scalar(`select string_agg(orden::text,',' order by orden) from produccion.planos where idea_id=$1`, [IDEA]), "1,2,3");
  eq("los planos viejos ya no están",
     Number(await scalar(`select count(*) from produccion.planos where idea_id=$1 and titulo like 'viejo%'`, [IDEA])), 0);
  eq("un campo no provisto queda null (plano 3 sin accion)",
     await scalar(`select accion from produccion.planos where idea_id=$1 and orden=3`, [IDEA]), null);
  ok("read_time_s lo pone el trigger desde el diálogo (>0 con diálogo)",
     Number(await scalar(`select read_time_s from produccion.planos where idea_id=$1 and orden=1`, [IDEA])) > 0);

  // append: agrega 2 al final → orden 4,5, sin borrar los previos
  eq("append crea 2", Number(await imp([{ titulo: "Plano 4" }, { titulo: "Plano 5" }], "append")), 2);
  eq("append continúa el orden (max = 5)",
     await scalar(`select max(orden)::text from produccion.planos where idea_id=$1`, [IDEA]), "5");
  eq("append no borró los previos (5 en total)",
     Number(await scalar(`select count(*) from produccion.planos where idea_id=$1`, [IDEA])), 5);

  // vacío y modo inválido → se rechazan (rollback)
  let vacio = false;
  try { await db.query(`select produccion.rpc_import_planos($1, '[]'::jsonb, 'replace')`, [IDEA]); } catch { vacio = true; }
  ok("importar 0 planos se rechaza", vacio);
  let malModo = false;
  try { await db.query(`select produccion.rpc_import_planos($1, $2::jsonb, 'nope')`, [IDEA, JSON.stringify([{ titulo: "x" }])]); } catch { malModo = true; }
  ok("modo inválido se rechaza", malModo);

  await db.exec(`delete from produccion.planos where idea_id='${IDEA}'`);
}

// ── 0039 S1 (reap): borrar un plano/estático borra sus correcciones ancladas ──
// Sin FK en comments.target_fila_id, borrar/re-importar planos dejaba correcciones
// huérfanas que jamás cerraban la ronda. El trigger BEFORE DELETE las limpia.
console.log("\n▶ 0039 — correcciones huérfanas se limpian con su plano (S1)");
{
  const IDEA = "00000000-0000-0000-0000-0000000000d1";
  const pid = await scalar(`insert into produccion.planos (idea_id, orden) values ($1, 91) returning id`, [IDEA]);
  const otro = await scalar(`insert into produccion.planos (idea_id, orden) values ($1, 92) returning id`, [IDEA]);
  await db.query(
    `insert into produccion.comments (idea_id, body, kind, target_tabla, target_fila_id)
     values ($1,'arregla esto','correction_request','planos',$2), ($1,'y esto','client_change','planos',$2)`,
    [IDEA, pid],
  );
  await db.query(
    `insert into produccion.comments (idea_id, body, kind, target_tabla, target_fila_id)
     values ($1,'de otro plano','correction_request','planos',$2)`,
    [IDEA, otro],
  );
  eq("2 correcciones ancladas antes de borrar el plano",
     Number(await scalar(`select count(*) from produccion.comments where target_tabla='planos' and target_fila_id=$1`, [pid])), 2);
  await db.query(`delete from produccion.planos where id=$1`, [pid]);
  eq("borrar el plano borró SUS correcciones ancladas (trigger)",
     Number(await scalar(`select count(*) from produccion.comments where target_tabla='planos' and target_fila_id=$1`, [pid])), 0);
  eq("la corrección de OTRO plano quedó intacta",
     Number(await scalar(`select count(*) from produccion.comments where target_tabla='planos' and target_fila_id=$1`, [otro])), 1);
  eq("existe el trigger en planos",
     Number(await scalar(`select count(*) from pg_trigger where tgname='before_delete_plano_correcciones'`)), 1);
  eq("existe el trigger en estaticos",
     Number(await scalar(`select count(*) from pg_trigger where tgname='before_delete_estatico_correcciones'`)), 1);
  await db.query(`delete from produccion.planos where id=$1`, [otro]);
}

// ── H.Ü.E HUB (0045): captura de adopción + Cerebro + KB + ganadores + RLS master-only ──
console.log("\n▶ 0045 — H.Ü.E HUB: captura + entrenamiento + RLS master-only");
{
  const IDEA = "00000000-0000-0000-0000-0000000000d1";
  const GALIE = await scalar(`select id from produccion.track_members where track='real' and name='Galie'`);

  // 1) hue_suggestions — ofrecida (decision null) → aplicada; CHECKs
  const sug = await scalar(
    `insert into produccion.hue_suggestions (idea_id, kind, hecho, sugerencia)
     values ($1,'correction_verdict','parcial','usa «el elemento importante»') returning id`, [IDEA]);
  eq("hue_suggestions arranca sin decisión (ofrecida)",
     await scalar(`select decision from produccion.hue_suggestions where id=$1`, [sug]), null);
  await db.query(`update produccion.hue_suggestions set decision='applied', decided_at=now() where id=$1`, [sug]);
  eq("hue_suggestions sella la decisión aplicada",
     await scalar(`select decision from produccion.hue_suggestions where id=$1`, [sug]), "applied");
  let badKind = false;
  try { await db.query(`insert into produccion.hue_suggestions (idea_id, kind) values ($1,'otro')`, [IDEA]); } catch { badKind = true; }
  ok("hue_suggestions rechaza un kind fuera del CHECK", badKind);
  let badHecho = false;
  try { await db.query(`insert into produccion.hue_suggestions (idea_id, kind, hecho) values ($1,'ortografia','maybe')`, [IDEA]); } catch { badHecho = true; }
  ok("hue_suggestions rechaza un hecho fuera del CHECK", badHecho);
  // idempotencia del veredicto: unique(idea_id, correccion_id) — un re-run hace upsert, no duplica
  const cmt = await scalar(`insert into produccion.comments (idea_id, body, kind) values ($1,'nota','correction_request') returning id`, [IDEA]);
  await db.query(`insert into produccion.hue_suggestions (idea_id, kind, correccion_id, hecho) values ($1,'correction_verdict',$2,'si')`, [IDEA, cmt]);
  let dupVer = false;
  try { await db.query(`insert into produccion.hue_suggestions (idea_id, kind, correccion_id, hecho) values ($1,'correction_verdict',$2,'no')`, [IDEA, cmt]); } catch { dupVer = true; }
  ok("hue_suggestions: dos veredictos de la MISMA corrección chocan (unique idea,correccion)", dupVer);
  await db.query(`insert into produccion.hue_suggestions (idea_id, kind) values ($1,'ortografia'),($1,'ortografia')`, [IDEA]);
  eq("hue_suggestions: ortografía (correccion_id null) NO colisiona — nulls distintos",
     Number(await scalar(`select count(*) from produccion.hue_suggestions where idea_id=$1 and kind='ortografia'`, [IDEA])), 2);

  // 2) hue_instructions — versionado + el trigger set_updated_at PISA un updated_at viejo (prueba determinista)
  const ins = await scalar(
    `insert into produccion.hue_instructions (title, body, source) values ('Hooks cortos','Beneficio en 2s','human') returning id`);
  eq("hue_instructions arranca v1 / activa / human",
     `${await scalar(`select version from produccion.hue_instructions where id=$1`,[ins])}/${await scalar(`select active from produccion.hue_instructions where id=$1`,[ins])}/${await scalar(`select source from produccion.hue_instructions where id=$1`,[ins])}`,
     "1/true/human");
  await db.query(`update produccion.hue_instructions set updated_at='2000-01-01T00:00:00Z', body='Beneficio en los primeros 2s' where id=$1`, [ins]);
  const uForced = await scalar(`select updated_at from produccion.hue_instructions where id=$1`, [ins]);
  ok("hue_instructions: el trigger set_updated_at PISA el updated_at viejo con now()", new Date(uForced).getUTCFullYear() >= 2026);
  let badScope = false;
  try { await db.query(`insert into produccion.hue_instructions (title, body, scope) values ('x','y','equipo')`); } catch { badScope = true; }
  ok("hue_instructions rechaza scope fuera del CHECK", badScope);

  // 3) hue_kb_documents — texto extraído + seam indexed_at null
  const kb = await scalar(
    `insert into produccion.hue_kb_documents (title, storage_path, mime_type, size_bytes, extracted_text)
     values ('Playbook','storage://greenlight-kb/x.pdf','application/pdf',1234,'texto extraído') returning id`);
  eq("hue_kb_documents guarda el texto extraído",
     await scalar(`select extracted_text from produccion.hue_kb_documents where id=$1`, [kb]), "texto extraído");
  eq("hue_kb_documents: indexed_at arranca null (seam de retrieval futuro)",
     await scalar(`select indexed_at from produccion.hue_kb_documents where id=$1`, [kb]), null);

  // 3b) AISLAMIENTO de scope (reap CRITICAL) — un doc de MARCA no se filtra a la marca
  // hermana. Espeja el filtro OR-PLANO del writer (hue-writer.ts): un doc entra si
  //   scope='global' OR client_id=<clienteTarea> OR marca_id=<marcaTarea>.
  // El fix vive en resolverScope: un doc de marca guarda client_id=NULL. Si llevara
  // client_id=DiDi, la clause client_id.eq lo pescaría para AMBAS marcas de DiDi → un
  // doc de "DiDi Card" se filtraría a un guión de "DiDi Préstamos".
  const DIDI = "00000000-0000-0000-0000-000000000001";
  const CARD = "00000000-0000-0000-0000-0000000000a1";
  const PREST = "00000000-0000-0000-0000-0000000000a2";
  await db.exec(`
    insert into produccion.hue_kb_documents (title, storage_path, scope, client_id, marca_id) values
      ('iso-G','s://k/g','global', null, null),
      ('iso-DiDi','s://k/c','client','${DIDI}', null),
      ('iso-Card','s://k/card','marca', null, '${CARD}'),
      ('iso-Prest','s://k/prest','marca', null, '${PREST}');
  `);
  const paraPrestamos = (await q(
    `select title from produccion.hue_kb_documents
      where (scope='global' or client_id='${DIDI}' or marca_id='${PREST}')
        and title like 'iso-%' order by title`)).map((r) => r.title).join(",");
  eq("scope: un guión de DiDi Préstamos NO lee docs de DiDi Card (aislamiento)",
     paraPrestamos, "iso-DiDi,iso-G,iso-Prest");
  const paraCard = (await q(
    `select title from produccion.hue_kb_documents
      where (scope='global' or client_id='${DIDI}' or marca_id='${CARD}')
        and title like 'iso-%' order by title`)).map((r) => r.title).join(",");
  eq("scope: un guión de DiDi Card NO lee docs de DiDi Préstamos (aislamiento)",
     paraCard, "iso-Card,iso-DiDi,iso-G");

  // 4) hue_top_performers — unique(idea_id)
  await db.query(`insert into produccion.hue_top_performers (idea_id, starred_by, reason) values ($1,$2,'ganó')`, [IDEA, GALIE]);
  let dupStar = false;
  try { await db.query(`insert into produccion.hue_top_performers (idea_id) values ($1)`, [IDEA]); } catch { dupStar = true; }
  ok("hue_top_performers: estrellar dos veces la misma idea se rechaza (unique)", dupStar);

  // 5) hue_adaptations — auditoría del cambio auto
  const adap = await scalar(
    `insert into produccion.hue_adaptations (trigger_summary, changed_instruction_id, from_version, to_version)
     values ('estrellado nuevo guión', $1, 1, 2) returning id`, [ins]);
  ok("hue_adaptations registra un cambio auto", adap != null);

  // 6) hue_settings — singleton del interruptor auto_learn
  eq("hue_settings arranca con auto_learn=false (opt-in)",
     await scalar(`select auto_learn from produccion.hue_settings where id=1`), false);
  let dupSettings = false;
  try { await db.query(`insert into produccion.hue_settings (id) values (2)`); } catch { dupSettings = true; }
  ok("hue_settings rechaza id≠1 (singleton)", dupSettings);
  ok("hue_top_snippets() es callable (agrega en SQL, no en JS)",
     Array.isArray(await q(`select * from produccion.hue_top_snippets()`)));

  // RLS — verificar DESDE EL ASIENTO no-master (negativo), no sólo que el master pasa
  const MASTER = "00000000-0000-0000-0000-00000000ea09";
  await db.exec(`insert into produccion.profiles (id, email, full_name, role) values ('${MASTER}','master@runna.mx','Master','master') on conflict (id) do nothing;`);
  await asRole(CREA);
  eq("RLS: un creative (no master) ve 0 filas de hue_instructions",
     Number(await scalar(`select count(*) from produccion.hue_instructions`)), 0);
  let creaWriteBlocked = false;
  try { await db.query(`insert into produccion.hue_instructions (title, body) values ('hack','x')`); } catch { creaWriteBlocked = true; }
  ok("RLS: un creative no puede escribir en hue_instructions", creaWriteBlocked);
  await resetRole();
  await asRole(MASTER);
  ok("RLS: el master SÍ ve las instrucciones del HUB",
     Number(await scalar(`select count(*) from produccion.hue_instructions`)) >= 1);
  await resetRole();
  await db.exec(`select set_config('request.jwt.claims','', false);`);

  // limpieza del fixture propio de este bloque
  await db.query(`delete from produccion.hue_top_performers where idea_id=$1`, [IDEA]);
  await db.query(`delete from produccion.hue_suggestions where idea_id=$1`, [IDEA]);
  await db.query(`delete from produccion.comments where idea_id=$1 and body='nota'`, [IDEA]);
}

// ── H.Ü.E aprende de ediciones (0048): hue_generations + source auto_edit + settings ──
console.log("\n▶ 0048 — H.Ü.E ediciones: hue_generations + FK cascade + source auto_edit + settings");
{
  const IDEA = "00000000-0000-0000-0000-0000000000d1";

  // draft jsonb round-trip + kind CHECK
  const gen = await scalar(
    `insert into produccion.hue_generations (idea_id, kind, draft, model)
     values ($1,'guion','[{"titulo":"Plano 1","dialogo":"(A) Hola"}]'::jsonb,'claude-sonnet-5') returning id`, [IDEA]);
  eq("hue_generations guarda el draft jsonb",
     await scalar(`select draft->0->>'dialogo' from produccion.hue_generations where id=$1`, [gen]), "(A) Hola");
  eq("hue_generations.imported_at arranca null (se sella al importar el borrador)",
     await scalar(`select imported_at from produccion.hue_generations where id=$1`, [gen]), null);
  let badKind = false;
  try { await db.query(`insert into produccion.hue_generations (idea_id, kind, draft) values ($1,'video','[]'::jsonb)`, [IDEA]); } catch { badKind = true; }
  ok("hue_generations rechaza kind fuera del CHECK (guion|copy)", badKind);

  // FK cascade: borrar la idea borra sus generaciones (idea desechable, no la semilla)
  const chain = (await q(`select brief_id, family_id from produccion.ideas where id=$1`, [IDEA]))[0];
  const tmpIdea = await scalar(
    `insert into produccion.ideas (brief_id, family_id, variant_number) values ($1,$2,99) returning id`, [chain.brief_id, chain.family_id]);
  await db.query(`insert into produccion.hue_generations (idea_id, kind, draft) values ($1,'guion','[]'::jsonb)`, [tmpIdea]);
  await db.query(`delete from produccion.ideas where id=$1`, [tmpIdea]);
  eq("hue_generations: borrar la idea borra sus generaciones (cascade)",
     Number(await scalar(`select count(*) from produccion.hue_generations where idea_id=$1`, [tmpIdea])), 0);

  // hue_instructions.source ahora acepta 'auto_edit' (lección aprendida de ediciones)
  const le = await scalar(
    `insert into produccion.hue_instructions (title, body, source) values ('De ediciones','Acorta el 1er plano','auto_edit') returning id`);
  eq("hue_instructions acepta source='auto_edit'",
     await scalar(`select source from produccion.hue_instructions where id=$1`, [le]), "auto_edit");
  let badSrc = false;
  try { await db.query(`insert into produccion.hue_instructions (title, body, source) values ('x','y','robot')`); } catch { badSrc = true; }
  ok("hue_instructions sigue rechazando source fuera del CHECK ampliado", badSrc);

  // hue_settings: switch + debounce del loop de ediciones
  eq("hue_settings.auto_learn_edits arranca false (opt-in, independiente)",
     await scalar(`select auto_learn_edits from produccion.hue_settings where id=1`), false);
  eq("hue_settings.last_synth_edits_at arranca null",
     await scalar(`select last_synth_edits_at from produccion.hue_settings where id=1`), null);

  // RLS master-only (defensa en profundidad; la app escribe por service_role)
  await asRole(CREA);
  eq("RLS: un creative (no master) ve 0 filas de hue_generations",
     Number(await scalar(`select count(*) from produccion.hue_generations`)), 0);
  await resetRole();
  await db.exec(`select set_config('request.jwt.claims','', false);`);

  // limpieza del fixture propio
  await db.query(`delete from produccion.hue_generations where idea_id=$1`, [IDEA]);
  await db.query(`delete from produccion.hue_instructions where id=$1`, [le]);
}

// ── Plantilla Copies (0046): temas con cuota + copies (headline/descripción) ──
console.log("\n▶ 0046 — Copies: temas con cuota + FK cascade + unique + trigger");
{
  const IDEA = "00000000-0000-0000-0000-0000000000d1";
  const tema = await scalar(
    `insert into produccion.copies_temas (idea_id, tema, cuota, orden) values ($1,'Ahorro',5,1) returning id`, [IDEA]);
  eq("copies_temas guarda la cuota", Number(await scalar(`select cuota from produccion.copies_temas where id=$1`, [tema])), 5);
  let badCuota = false;
  try { await db.query(`insert into produccion.copies_temas (idea_id, cuota, orden) values ($1,-1,2)`, [IDEA]); } catch { badCuota = true; }
  ok("copies_temas rechaza cuota negativa (CHECK)", badCuota);
  let dupTema = false;
  try { await db.query(`insert into produccion.copies_temas (idea_id, orden) values ($1,1)`, [IDEA]); } catch { dupTema = true; }
  ok("copies_temas: (idea_id, orden) único", dupTema);

  await db.query(`insert into produccion.copies (tema_id, headline, descripcion, orden) values ($1,'H1','D1',1),($1,'H2','D2',2)`, [tema]);
  eq("2 copies bajo el tema", Number(await scalar(`select count(*) from produccion.copies where tema_id=$1`, [tema])), 2);
  let dupCopy = false;
  try { await db.query(`insert into produccion.copies (tema_id, orden) values ($1,1)`, [tema]); } catch { dupCopy = true; }
  ok("copies: (tema_id, orden) único", dupCopy);

  await db.query(`update produccion.copies_temas set updated_at='2000-01-01T00:00:00Z', tema='Ahorro+' where id=$1`, [tema]);
  ok("copies_temas: el trigger set_updated_at pisa un updated_at viejo",
     new Date(await scalar(`select updated_at from produccion.copies_temas where id=$1`, [tema])).getUTCFullYear() >= 2026);

  // Correcciones huérfanas al borrar (0046 espeja el trigger de 0039). Copies es
  // entregable al cliente: el cliente ancla pins (client_change) a un copy/tema y el
  // equipo puede borrarlo — el pin debe limpiarse o queda con resolved_at=null y la
  // ronda nunca cierra. Se prueban los dos caminos: borrado directo del copy y borrado
  // en cascada (borrar el tema → sus copies → sus pins).
  const copy1 = await scalar(`select id from produccion.copies where tema_id=$1 and orden=1`, [tema]);
  const copy2 = await scalar(`select id from produccion.copies where tema_id=$1 and orden=2`, [tema]);
  // Aísla el sub-test: limpia cualquier client_change previo de esta idea semilla.
  await db.query(`delete from produccion.comments where idea_id=$1 and kind='client_change'`, [IDEA]);
  await db.query(`insert into produccion.comments (idea_id, body, kind, target_tabla, target_fila_id, target_campo)
                  values ($1,'sube el gancho','client_change','copies',$2,'headline')`, [IDEA, copy1]);
  await db.query(`insert into produccion.comments (idea_id, body, kind, target_tabla, target_fila_id, target_campo)
                  values ($1,'renombra el tema','client_change','copies_temas',$2,'tema')`, [IDEA, tema]);
  await db.query(`insert into produccion.comments (idea_id, body, kind, target_tabla, target_fila_id, target_campo)
                  values ($1,'ajusta el copy 2','client_change','copies',$2,'descripcion')`, [IDEA, copy2]);

  await db.query(`delete from produccion.copies where id=$1`, [copy1]);
  eq("borrar un copy limpia SU pin (trigger 0046)",
     Number(await scalar(`select count(*) from produccion.comments where target_tabla='copies' and target_fila_id=$1`, [copy1])), 0);
  eq("borrar un copy NO toca el pin del tema ni de otro copy",
     Number(await scalar(`select count(*) from produccion.comments where kind='client_change' and idea_id=$1`, [IDEA])), 2);

  await db.query(`delete from produccion.copies_temas where id=$1`, [tema]);
  eq("borrar el tema cascada a sus copies (0)", Number(await scalar(`select count(*) from produccion.copies where tema_id=$1`, [tema])), 0);
  eq("borrar el tema limpia SU pin + los de sus copies en cascada",
     Number(await scalar(`select count(*) from produccion.comments where kind='client_change' and idea_id=$1`, [IDEA])), 0);
  eq("limpieza: 0 temas en la idea", Number(await scalar(`select count(*) from produccion.copies_temas where idea_id=$1`, [IDEA])), 0);
}

// ── 0047 — el cambio del CLIENTE avisa al LEAD, no al especialista ──
console.log("\n▶ 0047 — cambios del cliente enrutan al lead");
{
  // flIdea trae a Galie y Mony como ESPECIALISTAS (es_lead=false). El trigger de
  // notificación decide el destinatario de in_corrections según la bandera
  // `notify_to_lead` que prende rpc_client_submit_changes.
  // Asegura ESPECIALISTAS asignados (Galie/Mony, es_lead=false) — otros tests
  // pudieron limpiar las asignaciones de flIdea.
  await db.query(
    `insert into produccion.idea_assignments (idea_id, member_id)
     select $1, id from produccion.track_members where track='real' and name in ('Galie','Mony')
     on conflict do nothing`, [flIdea]);
  const notifsPara = async () => (await q(
    `select tm.name as para from produccion.notifications n
       left join produccion.track_members tm on tm.id = n.recipient_member_id
      where n.entity_id=$1`, [flIdea])).map((r) => r.para);

  // Los cambios de estado pasan por el guard `guard_idea_status`; se mueve con
  // rpc_move_task (override de lead para el setup a published; y el MISMO llamado
  // que hace el cliente en prod para el paso probado: in_corrections sin actor).
  const aPublished = () => db.query(`select produccion.rpc_move_task($1,'published',true,$2,'setup 0047')`, [flIdea, LEAD]);
  const aCorrecciones = () => db.query(`select produccion.rpc_move_task($1,'in_corrections',false,null,null,null)`, [flIdea]);

  // CASO LEAD (primero, sesión limpia SIN bandera): avisa a los que la trabajan.
  await aPublished();
  await db.query(`delete from produccion.notifications where entity_id=$1`, [flIdea]);
  await aCorrecciones();
  const lead = await notifsPara();
  ok("sin bandera (cambio del lead), SÍ avisa a los especialistas",
     lead.some((n) => n === "Galie" || n === "Mony"));

  // CASO CLIENTE: la bandera (que prende rpc_client_submit_changes) enruta al lead.
  await aPublished();
  await db.query(`delete from produccion.notifications where entity_id=$1`, [flIdea]);
  await db.query(`select set_config('produccion.notify_to_lead','true',false)`);
  await aCorrecciones();
  await db.query(`select set_config('produccion.notify_to_lead','false',false)`); // apagar
  const cli = await notifsPara();
  ok("cambio del cliente NO avisa a los especialistas (Galie/Mony)",
     !cli.some((n) => n === "Galie" || n === "Mony"));
  ok("y sí genera aviso (al lead/admin)", cli.length > 0);
}

// ── Preferencias de notificación (0050): task_assigned + scope por-track + watch_all ──
console.log("\n▶ Notificaciones 0050 — task_assigned, scope por-track, watch_all");
await db.exec(`select set_config('produccion.acting_member','',false);`);
await db.exec(`select set_config('produccion.notify_to_lead','false',false);`);

// task_assigned: asignar un miembro (con perfil) crea el aviso al asignado.
const nP = "00000000-0000-0000-0000-0000000000e5";
await db.exec(`
  insert into produccion.profiles (id,email,full_name,role) values ('${nP}','espn@runna.mx','EspN','creative') on conflict (id) do nothing;
  insert into produccion.track_members (track,name,color,role,profile_id) values ('real','EspNotif0050','#775cbf','creative','${nP}') on conflict do nothing;
`);
const nM = await scalar(`select id from produccion.track_members where name='EspNotif0050'`);
const nIdea = await scalar(`select id from produccion.ideas where track='real' limit 1`);
await db.query(`delete from produccion.notifications where entity_id=$1`, [nIdea]);
await db.query(`delete from produccion.idea_assignments where idea_id=$1 and member_id=$2`, [nIdea, nM]);
await db.query(`insert into produccion.idea_assignments (idea_id, member_id) values ($1,$2)`, [nIdea, nM]);
eq("asignar dispara task_assigned al asignado", Number(await scalar(
  `select count(*) from produccion.notifications where entity_id=$1 and type='task_assigned' and recipient_id=$2`, [nIdea, nP])), 1);

// scope: un lead 'my_track' sólo recibe SU track (arregla el firehose).
const lrP = "00000000-0000-0000-0000-0000000000f1", lnP = "00000000-0000-0000-0000-0000000000f2";
await db.exec(`
  insert into produccion.profiles (id,email,full_name,role) values
   ('${lrP}','lrn@runna.mx','LeadReal','lead'),('${lnP}','lnn@runna.mx','LeadNormal','lead') on conflict (id) do nothing;
  insert into produccion.track_members (track,name,color,role,profile_id) values
   ('real','LeadRealN','#775cbf','lead','${lrP}'),('normal','LeadNormalN','#775cbf','lead','${lnP}') on conflict do nothing;
`);
eq("un lead nuevo arranca con notify_scope='my_track' (trigger 0050)",
   await scalar(`select notify_scope from produccion.profiles where id='${lrP}'`), "my_track");
await db.query(`delete from produccion.notifications where entity_id=$1`, [nIdea]);
await db.exec(`select set_config('produccion.acting_member','',false);`);
await db.query(`update produccion.ideas set status='in_progress' where id=$1`, [nIdea]);
await db.query(`update produccion.ideas set status='under_review' where id=$1`, [nIdea]);
eq("el lead del track REAL recibe la revisión de una tarea real", Number(await scalar(
  `select count(*) from produccion.notifications where entity_id=$1 and recipient_id=$2`, [nIdea, lrP])), 1);
eq("el lead de OTRO track (normal) NO la recibe — scope my_track", Number(await scalar(
  `select count(*) from produccion.notifications where entity_id=$1 and recipient_id=$2`, [nIdea, lnP])), 0);

// watch_all: un admin con notify_watch_all recibe hasta eventos que no son su tarea.
const awP = "00000000-0000-0000-0000-0000000000f3";
await db.exec(`
  insert into produccion.profiles (id,email,full_name,role,notify_watch_all,notify_scope)
   values ('${awP}','awn@runna.mx','AdminWatch','admin',true,'all')
   on conflict (id) do update set notify_watch_all=true, notify_scope='all';
`);
await db.query(`delete from produccion.notifications where entity_id=$1`, [nIdea]);
await db.exec(`select set_config('produccion.acting_member','',false);`);
// nIdea está en 'under_review' (de la prueba de scope). Transición VÁLIDA → 'completed'
// (aprobar) dispara task_approved: el admin watch_all NO es asignado de la tarea, así
// que sólo la pata (d) del fan_out se la entrega.
await db.query(`update produccion.ideas set status='completed' where id=$1`, [nIdea]);
eq("admin con watch_all recibe un evento donde NO es stakeholder (task_approved)", Number(await scalar(
  `select count(*) from produccion.notifications where entity_id=$1 and recipient_id=$2`, [nIdea, awP])), 1);

// ── Notificación al CLIENTE (0051): publicar avisa al cliente con ready_for_review ──
console.log("\n▶ Notificación al cliente 0051 — ready_for_review al publicar");
const cliP = "00000000-0000-0000-0000-0000000000f4";
const cliId = await scalar(
  `select b.client_id from produccion.ideas i join produccion.briefs b on b.id=i.brief_id where i.id=$1`, [nIdea]);
await db.query(
  `insert into produccion.profiles (id,email,full_name,role,client_id)
   values ($1,'cli@didi.mx','Cliente DiDi','client',$2) on conflict (id) do nothing`, [cliP, cliId]);
eq("un cliente nuevo arranca con la pref ready_for_review sembrada (trigger 0051)", Number(await scalar(
  `select count(*) from produccion.notification_prefs where profile_id=$1 and event_type='ready_for_review' and email`, [cliP])), 1);
await db.query(`delete from produccion.notifications where entity_id=$1`, [nIdea]);
await db.exec(`select set_config('produccion.acting_member','',false);`);
await db.query(`update produccion.ideas set status='published' where id=$1`, [nIdea]); // completed→published (válido)
eq("publicar avisa al CLIENTE con ready_for_review", Number(await scalar(
  `select count(*) from produccion.notifications where entity_id=$1 and type='ready_for_review' and recipient_id=$2`, [nIdea, cliP])), 1);
eq("la URL del aviso al cliente apunta al PORTAL",
  await scalar(`select url from produccion.notifications where entity_id=$1 and type='ready_for_review' and recipient_id=$2`, [nIdea, cliP]),
  await scalar(`select '/'||c.slug||'/portal' from produccion.clients c
                 join produccion.briefs b on b.client_id=c.id join produccion.ideas i on i.brief_id=b.id where i.id=$1`, [nIdea]));
eq("el cliente NO recibe el task_published INTERNO (ese va a los asignados)", Number(await scalar(
  `select count(*) from produccion.notifications where entity_id=$1 and type='task_published' and recipient_id=$2`, [nIdea, cliP])), 0);

// ── 0061: el actor no se avisa a sí mismo · dados de baja sin avisos · rpc_set_assignees ──
// Contrato, no columnas: quien MUEVE una tarea no recibe su propio aviso por la pata (a)
// (antes sólo la (d) lo excluía); una persona dada de baja no recibe nada; asignar por
// RPC fija al actor (sin "se te asignó" a uno mismo) y sella es_lead/assigned_by.
console.log("\n▶ Avisos 0061 — actor excluido en (a), inactivos fuera, rpc_set_assignees, candado de rutinas");
{
  const leadM = await scalar(`select id from produccion.track_members where name='LeadRealN'`);
  // nIdea está en 'published'. El LEAD REAL (perfil lrP, scope my_track) la mueve a
  // in_corrections como "cambios del cliente" (notify_to_lead) → pata (a): avisa a los
  // admins/leads en scope… menos al ACTOR.
  await db.query(`delete from produccion.notifications where entity_id=$1`, [nIdea]);
  await db.query(`select set_config('produccion.acting_member',$1,false)`, [leadM]);
  await db.query(`select set_config('produccion.notify_to_lead','true',false)`);
  await db.query(`update produccion.ideas set status='in_corrections' where id=$1`, [nIdea]);
  await db.query(`select set_config('produccion.notify_to_lead','false',false)`);
  await db.exec(`select set_config('produccion.acting_member','',false);`);
  eq("(a) el lead que ACTÚA no recibe su propio aviso", Number(await scalar(
    `select count(*) from produccion.notifications where entity_id=$1 and recipient_id=$2`, [nIdea, lrP])), 0);
  eq("(a)/(d) el admin watch_all (no es el actor) SÍ lo recibe — el trigger disparó", Number(await scalar(
    `select count(*) from produccion.notifications where entity_id=$1 and recipient_id=$2`, [nIdea, awP])), 1);

  // (c) un asignado DADO DE BAJA no recibe la aprobación (antes sí: sin filtro active).
  await db.query(`update produccion.track_members set active=false where id=$1`, [nM]);
  await db.query(`delete from produccion.notifications where entity_id=$1`, [nIdea]);
  await db.query(`update produccion.ideas set status='in_progress' where id=$1`, [nIdea]);
  await db.query(`update produccion.ideas set status='under_review' where id=$1`, [nIdea]);
  await db.query(`update produccion.ideas set status='completed' where id=$1`, [nIdea]);
  eq("(c) un asignado dado de baja NO recibe task_approved", Number(await scalar(
    `select count(*) from produccion.notifications where entity_id=$1 and recipient_id=$2 and type='task_approved'`, [nIdea, nP])), 0);
  await db.query(`update produccion.track_members set active=true where id=$1`, [nM]);

  // rpc_notificar_brief: un asignado dado de baja tampoco recibe "Nuevo brief".
  await db.query(`update produccion.track_members set active=false where id=$1`, [MEM_VERO]);
  await db.query(`delete from produccion.notifications where type='brief_created'`);
  eq("rpc_notificar_brief no avisa a un asignado dado de baja",
     Number(await scalar(`select produccion.rpc_notificar_brief($1)`, [BRIEF])), 0);
  await db.query(`update produccion.track_members set active=true where id=$1`, [MEM_VERO]);

  // rpc_set_assignees: el lead se pone a sí mismo → sin "se te asignó"; sella es_lead y assigned_by.
  await db.query(`delete from produccion.notifications where entity_id=$1`, [nIdea]);
  await db.query(`select produccion.rpc_set_assignees($1,$2,$3::uuid[],$4,$5)`, [nIdea, leadM, `{${nM}}`, leadM, lrP]);
  eq("auto-asignación del lead: sin task_assigned para él mismo", Number(await scalar(
    `select count(*) from produccion.notifications where entity_id=$1 and type='task_assigned' and recipient_id=$2`, [nIdea, lrP])), 0);
  eq("es_lead sellado en el lead",
     await scalar(`select es_lead from produccion.idea_assignments where idea_id=$1 and member_id=$2`, [nIdea, leadM]), true);
  eq("assigned_by = perfil del actor",
     await scalar(`select assigned_by from produccion.idea_assignments where idea_id=$1 and member_id=$2`, [nIdea, leadM]), lrP);
  eq("el especialista que ya estaba conserva su fila (DIFF) y no es lead", Number(await scalar(
    `select count(*) from produccion.idea_assignments where idea_id=$1 and member_id=$2 and not es_lead`, [nIdea, nM])), 1);
  // Asignar a OTRO sí avisa (el actor no es el destinatario): el trigger sigue vivo.
  await db.query(`delete from produccion.idea_assignments where idea_id=$1 and member_id=$2`, [nIdea, nM]);
  await db.query(`delete from produccion.notifications where entity_id=$1`, [nIdea]);
  await db.query(`select produccion.rpc_set_assignees($1,$2,$3::uuid[],$4,$5)`, [nIdea, leadM, `{${nM}}`, leadM, lrP]);
  eq("asignar a otra persona SÍ dispara task_assigned para ella", Number(await scalar(
    `select count(*) from produccion.notifications where entity_id=$1 and type='task_assigned' and recipient_id=$2`, [nIdea, nP])), 1);
  // El conjunto deseado manda: quitar al lead lo saca.
  await db.query(`select produccion.rpc_set_assignees($1,null,$2::uuid[],$3,$4)`, [nIdea, `{${nM}}`, leadM, lrP]);
  eq("quitar al lead lo saca del conjunto", Number(await scalar(
    `select count(*) from produccion.idea_assignments where idea_id=$1 and member_id=$2`, [nIdea, leadM])), 0);

  // Candado completo (I6): ninguna rutina ni tabla de produccion con privilegio a PUBLIC
  // (grantee vacío en el ACL) — el test 0056 sólo miraba anon/authenticated por nombre.
  eq("ninguna rutina de produccion es ejecutable por PUBLIC", Number(await scalar(
    `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='produccion'
        and (p.proacl is null or exists (select 1 from unnest(p.proacl) a where a::text like '=%'))`)), 0);
  eq("ninguna tabla/vista de produccion con privilegio a PUBLIC", Number(await scalar(
    `select count(*) from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
      where ns.nspname='produccion' and c.relkind in ('r','v')
        and exists (select 1 from unnest(c.relacl) a where a::text like '=%')`)), 0);
}

// ── Papelera de 30 días (0057) ──────────────────────────────────────────────
// Lo que importa probar no es "la columna existe", sino el CONTRATO: lo borrado
// desaparece de las superficies, vuelve entero al restaurar, y el corte de 30 días
// separa lo recuperable de lo purgable.
console.log("\n▶ Papelera 30 días (0057)");
{
  const pBrief = "00000000-0000-0000-0000-0000000fa001";
  const pFam = "00000000-0000-0000-0000-0000000fa002";
  const pIdea1 = "00000000-0000-0000-0000-0000000fa011";
  const pIdea2 = "00000000-0000-0000-0000-0000000fa012";
  await db.query(
    `insert into produccion.briefs (id, client_id, code, title) values ($1,$2,'PAPEL-01','Papelera')`,
    [pBrief, CLIENT],
  );
  await db.query(
    `insert into produccion.idea_families (id, brief_id, letter) values ($1,$2,'P')`,
    [pFam, pBrief],
  );
  let vn = 0;
  for (const [id, base] of [[pIdea1, "PAP1"], [pIdea2, "PAP2"]]) {
    await db.query(
      `insert into produccion.ideas (id, family_id, brief_id, variant_number, naming_kind, naming_base, genero_code, mes_code)
       values ($1,$2,$3,$4,'real',$5,'RE','AGO')`,
      [id, pFam, pBrief, ++vn, base],
    );
  }
  const enBoard = async (id) =>
    Number(await scalar(`select count(*) from produccion.board_tasks where id=$1`, [id]));

  eq("board_tasks ve una tarea viva", await enBoard(pIdea1), 1);

  // Sellar UNA tarea (borrado individual)
  await db.query(`update produccion.ideas set deleted_at=now() where id=$1`, [pIdea1]);
  eq("una tarea en la papelera SALE de board_tasks", await enBoard(pIdea1), 0);
  eq("su hermana viva sigue en board_tasks", await enBoard(pIdea2), 1);
  eq(
    "sus hijos NO se tocaron (se llega a ellos por la tarea)",
    Number(await scalar(`select count(*) from produccion.ideas where id=$1`, [pIdea1])),
    1,
  );

  // Restaurar
  await db.query(`update produccion.ideas set deleted_at=null where id=$1`, [pIdea1]);
  eq("restaurar la devuelve a board_tasks", await enBoard(pIdea1), 1);

  // Sellar el BRIEF con su árbol (lo que hace eliminarBrief)
  const sello = await scalar(`select now()`);
  await db.query(`update produccion.ideas set deleted_at=$2 where brief_id=$1 and deleted_at is null`, [pBrief, sello]);
  await db.query(`update produccion.briefs set deleted_at=$2 where id=$1`, [pBrief, sello]);
  eq("borrar el brief saca TODAS sus tareas del board", await enBoard(pIdea1), 0);
  eq("…también la segunda", await enBoard(pIdea2), 0);

  // Restaurar el brief devuelve sólo lo sellado en ESE instante (el árbol que se fue con él)
  await db.query(`update produccion.ideas set deleted_at=null where brief_id=$1 and deleted_at=$2`, [pBrief, sello]);
  await db.query(`update produccion.briefs set deleted_at=null where id=$1`, [pBrief]);
  eq("restaurar el brief devuelve su árbol completo", await enBoard(pIdea1) + await enBoard(pIdea2), 2);

  // El corte de 30 días: 29 días = recuperable, 31 = purgable
  await db.query(`update produccion.ideas set deleted_at=now()-interval '29 days' where id=$1`, [pIdea1]);
  await db.query(`update produccion.ideas set deleted_at=now()-interval '31 days' where id=$1`, [pIdea2]);
  const corte = `now()-interval '30 days'`;
  eq(
    "a los 29 días sigue siendo recuperable",
    Number(await scalar(`select count(*) from produccion.ideas where id=$1 and deleted_at >= ${corte}`, [pIdea1])),
    1,
  );
  eq(
    "a los 31 días ya es purgable",
    Number(await scalar(`select count(*) from produccion.ideas where id=$1 and deleted_at < ${corte}`, [pIdea2])),
    1,
  );
  // La purga perezosa borra DURO lo vencido (y sólo eso)
  await db.query(`delete from produccion.ideas where deleted_at < ${corte}`);
  eq(
    "la purga elimina la vencida",
    Number(await scalar(`select count(*) from produccion.ideas where id=$1`, [pIdea2])),
    0,
  );
  eq(
    "la purga NO toca la de 29 días",
    Number(await scalar(`select count(*) from produccion.ideas where id=$1`, [pIdea1])),
    1,
  );

  // ── Re-importar del sheet una tarea que está en la papelera (regresión 2026-09-01) ──
  // El dedup del sync salta lo que ya importó mirando `staged_rows.idea_id`. Con el
  // borrado DURO, el FK `on delete set null` limpiaba ese vínculo solo y la fila se
  // podía reimportar. Con el borrado suave la idea sigue ahí, así que el dedup tiene
  // que mirar el ESTADO de la idea, no sólo el vínculo — si no, borrar una tarea la
  // vuelve imposible de traer del sheet para siempre (lo que reportó Pedro).
  {
    await db.query(`update produccion.ideas set deleted_at=null where id=$1`, [pIdea1]);
    await db.query(
      `insert into produccion.staged_rows (client_id, source_tab, natural_key, row_hash, data, idea_id)
       values ($1,'Real (01/09)','KEY-PAP-1','hash1','{}'::jsonb,$2)`,
      [CLIENT, pIdea1],
    );
    // "Ya sincronizada" = HAY UNA TAREA VIVA detrás. Un INNER JOIN lo expresa: si no
    // hay idea (vínculo nulo) o está sellada, no hay fila → importable.
    const dedup = async () =>
      Number(await scalar(
        `select count(*) from produccion.staged_rows s
           join produccion.ideas i on i.id = s.idea_id
          where s.natural_key='KEY-PAP-1' and i.deleted_at is null`));

    eq("con la tarea VIVA el sync la salta (ya importada)", await dedup(), 1);
    await db.query(`update produccion.ideas set deleted_at=now() where id=$1`, [pIdea1]);
    eq("con la tarea EN LA PAPELERA el sync la deja reimportar", await dedup(), 0);
    await db.query(`update produccion.ideas set deleted_at=null where id=$1`, [pIdea1]);
    eq("al RESTAURARLA el vínculo vuelve a valer solo (sin duplicar)", await dedup(), 1);

    // EL CASO QUE FALLÓ EN PROD (2026-09-01): la fila quedó HUÉRFANA porque su tarea se
    // borró en DURO antes de que existiera la papelera (el FK `on delete set null` la
    // desvinculó). Mirar sólo `idea_id is not null` la daba por sincronizada y el preview
    // decía "sin cambios" para siempre. Sin tarea detrás = importable.
    await db.query(`update produccion.staged_rows set idea_id=null where natural_key='KEY-PAP-1'`);
    eq("una fila HUÉRFANA (borrado duro viejo) se puede reimportar", await dedup(), 0);
    // …y la simetría con el borrado DURO de verdad: al purgar, la fila queda huérfana sola.
    // (pIdea2 ya no existe: se la llevó el assert de la purga de arriba, así que va una nueva.)
    const pIdea3 = "00000000-0000-0000-0000-0000000fa013";
    await db.query(
      `insert into produccion.ideas (id, family_id, brief_id, variant_number, naming_kind, naming_base, genero_code, mes_code)
       values ($1,$2,$3,9,'real','PAP3','RE','AGO')`,
      [pIdea3, pFam, pBrief],
    );
    await db.query(
      `insert into produccion.staged_rows (client_id, source_tab, natural_key, row_hash, data, idea_id)
       values ($1,'Real (01/09)','KEY-PAP-2','hash2','{}'::jsonb,$2)`,
      [CLIENT, pIdea3],
    );
    await db.query(`delete from produccion.ideas where id=$1`, [pIdea3]);
    eq("purgar la tarea desvincula su fila (FK set null) → reimportable",
       Number(await scalar(
         `select count(*) from produccion.staged_rows where natural_key='KEY-PAP-2' and idea_id is null`)), 1);
  }

  // Limpieza: no dejar fixtures que ensucien otros asserts si se reordena el archivo
  await db.query(`delete from produccion.staged_rows where natural_key like 'KEY-PAP-%'`);
  await db.query(`delete from produccion.briefs where id=$1`, [pBrief]);
}

// ── brief_estado (0060): "en curso" calculado en la BD, MISMA regla que bundle.ts ──
// Lo que importa es el CONTRATO con greenlitDeBundle(): si la vista y el JS discreparan,
// la lista de briefs enseñaría (u ocultaría) briefs distintos según quién calcule.
console.log("\n▶ brief_estado (0060) — contrato con greenlitDeBundle()");
{
  const eBrief = "00000000-0000-0000-0000-0000000be001";
  const eFam = "00000000-0000-0000-0000-0000000be002";
  const eIdea1 = "00000000-0000-0000-0000-0000000be011";
  const eIdea2 = "00000000-0000-0000-0000-0000000be012";
  const eVacio = "00000000-0000-0000-0000-0000000be003";
  await db.query(`insert into produccion.briefs (id, client_id, code, title) values ($1,$2,'BE-01','Estado')`, [eBrief, CLIENT]);
  await db.query(`insert into produccion.briefs (id, client_id, code, title) values ($1,$2,'BE-02','Vacío')`, [eVacio, CLIENT]);
  await db.query(`insert into produccion.idea_families (id, brief_id, letter) values ($1,$2,'E')`, [eFam, eBrief]);
  let vn = 0;
  for (const [id, base] of [[eIdea1, "EST1"], [eIdea2, "EST2"]]) {
    await db.query(
      `insert into produccion.ideas (id, family_id, brief_id, variant_number, naming_kind, naming_base, genero_code, mes_code)
       values ($1,$2,$3,$4,'real',$5,'RE','AGO')`,
      [id, eFam, eBrief, ++vn, base],
    );
  }
  const estado = async (id) => (await q(`select n_tareas, n_pendientes, greenlit_at from produccion.brief_estado where brief_id=$1`, [id]))[0];
  // Lo que diría el JS con las mismas filas (board_tasks expone status + delivered_at).
  const enJs = async (id) => greenlitDeBundle(
    await q(`select status, delivered_at from produccion.board_tasks where brief_id=$1`, [id]),
  );
  const iso = (v) => (v ? new Date(v).toISOString() : null);
  // El trigger de transiciones no deja saltar todo → delivered: se recorre el camino.
  const entregar = async (id, fecha) => {
    for (const st of ["in_progress", "under_review", "completed"]) await db.query(`update produccion.ideas set status=$2 where id=$1`, [id, st]);
    await db.query(`update produccion.ideas set status='delivered', delivered_at=$2 where id=$1`, [id, fecha]);
  };

  let e = await estado(eBrief);
  eq("2 tareas vivas", Number(e.n_tareas), 2);
  eq("2 pendientes", Number(e.n_pendientes), 2);
  eq("sin entregar → greenlit_at null", e.greenlit_at, null);
  eq("…igual que el JS", await enJs(eBrief), null);

  const v = await estado(eVacio);
  eq("brief sin tareas: 0 tareas", Number(v.n_tareas), 0);
  eq("brief sin tareas NO es greenlit (por vacuidad)", v.greenlit_at, null);

  // Entregar UNA: sigue en curso
  await entregar(eIdea1, "2026-08-20T10:00:00Z");
  e = await estado(eBrief);
  eq("1 pendiente tras entregar una", Number(e.n_pendientes), 1);
  eq("una entregada de dos → sigue sin greenlit", e.greenlit_at, null);

  // Entregar la otra más tarde: greenlit = la ÚLTIMA entrega
  await entregar(eIdea2, "2026-08-25T10:00:00Z");
  e = await estado(eBrief);
  eq("0 pendientes", Number(e.n_pendientes), 0);
  eq("greenlit_at = la última entrega", iso(e.greenlit_at), "2026-08-25T10:00:00.000Z");
  eq("…igual que greenlitDeBundle()", iso(await enJs(eBrief)), iso(e.greenlit_at));

  // delivered SIN fecha (anómalo) cuenta como pendiente — igual que el JS
  await db.query(`update produccion.ideas set delivered_at=null where id=$1`, [eIdea2]);
  e = await estado(eBrief);
  eq("delivered sin fecha → pendiente", Number(e.n_pendientes), 1);
  eq("…y el JS tampoco lo da por greenlit", await enJs(eBrief), null);
  await db.query(`update produccion.ideas set delivered_at='2026-08-25T10:00:00Z' where id=$1`, [eIdea2]);

  // Papelera: una tarea sellada no cuenta (ni como pendiente ni como entregada)
  await db.query(`update produccion.ideas set deleted_at=now() where id=$1`, [eIdea1]);
  e = await estado(eBrief);
  eq("tarea en la papelera no cuenta", Number(e.n_tareas), 1);
  eq("…el brief queda greenlit por la viva", iso(e.greenlit_at), "2026-08-25T10:00:00.000Z");
  eq("…igual que el JS (board_tasks tampoco la ve)", iso(await enJs(eBrief)), iso(e.greenlit_at));

  // Brief sellado: desaparece de la vista
  await db.query(`update produccion.briefs set deleted_at=now() where id=$1`, [eBrief]);
  eq("brief en la papelera sale de brief_estado", (await q(`select 1 from produccion.brief_estado where brief_id=$1`, [eBrief])).length, 0);

  // (El grant público lo vigila el test "Candado RLS 0056", que barre TODAS las
  // relaciones de produccion justo tras las migraciones — incluida esta vista.)

  await db.query(`delete from produccion.briefs where id in ($1,$2)`, [eBrief, eVacio]);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} pass, ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);

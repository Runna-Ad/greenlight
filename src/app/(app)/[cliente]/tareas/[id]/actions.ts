"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canAdmin, canMoveStatus, canOverrideStatus } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { getCurrentUser } from "@/lib/identity";
import { assertCanActOnTask, assertCanActOnRow } from "@/lib/auth/task-scope";
import { ESTADOS_CERRADOS } from "@/lib/plantilla";
import { urlSegura } from "@/lib/url-segura";
import { combinarConsideraciones } from "@/lib/consideraciones";
import type { AssetStatus } from "@/lib/brand";
import { sinInventar, limpiarPegado, type PlanoParsed, type EstaticoParsed } from "@/lib/guion";
import { sinNegrita } from "@/lib/negrita";
import type { PlanoVista, EstaticoVista } from "@/components/tarea/preview-slide";

// Columnas que alimentan a PlanoVista/EstaticoVista (para devolver la fila creada
// al cliente y que actualice su estado sin recargar la página).
const COLS_PLANO = "id, orden, titulo, accion, copy_in, sfx, gfx, edicion, dialogo, es_cierre";
const COLS_ESTATICO =
  "id, copy_titulo, copy_subtitulo, copy_cta, legales_extra, referencia_url, referencia_nota";
const COLS_TEMA = "id, idea_id, tema, cuota, orden";
const COLS_COPY = "id, tema_id, headline, descripcion, orden";
import Anthropic from "@anthropic-ai/sdk";
import type { CopyTema, Copy } from "@/lib/database.types";

export type Tabla = "planos" | "estaticos";
/** Tablas cuyos campos autoguarda `guardarCampo` — incluye las de Copies. `Campo` y las
 *  correcciones usan `Tabla` (planos/estaticos); Copies usa su propio campo (CampoCopy). */
export type TablaGuardable = Tabla | "copies_temas" | "copies";

/**
 * Whitelist en el SERVIDOR. El nombre del campo llega del cliente y termina
 * dentro de un identificador SQL — jamás se interpola algo que no esté aquí.
 */
const CAMPOS: Record<TablaGuardable, Set<string>> = {
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

export type GuardarResultado =
  | { ok: true }
  | { ok: false; conflicto: true; valorActual: string | null }
  | { ok: false; conflicto?: false; error: string };

/**
 * Los campos de la CABECERA que se editan (no del cuerpo). Whitelist aparte
 * porque viven en `ideas`, no en la tabla de la plantilla. Todos son texto
 * suelto: `tamanos`/`plataformas`/`duracion` NO están porque cambiarlos crea o
 * borra archivos (operación estructural). `duracion` se edita con las pastillas
 * de `guardarDuraciones`, que reconcilia los assets.
 *
 * `url: true` valida el esquema http/https en el servidor: entrega_url se pinta
 * como href, así que un `javascript:…` guardado se volvería clicable.
 */
const CAMPOS_INTAKE: Record<string, { url?: boolean }> = {
  trend: {},
  notas: {},
  entrega_url: { url: true },
  entrega_num: {},
  legales_libres: {},
  nota_guion: {},
  // Vienen llenas del sheet y son editables: Resumen ← Concepto, Notas ←
  // Peloteo, Trend ← Referencias (esta última ya estaba arriba).
  concepto: {},
  peloteo_raw: {},
};

export type IntakeResultado =
  | { ok: true; filenames?: string[] }
  | { ok: false; conflicto: true; valorActual: string | null }
  | { ok: false; conflicto?: false; error: string };

/**
 * Guarda un campo de la cabecera, con el mismo compare-and-set del cuerpo.
 * (La duración ya no pasa por aquí: son pastillas y las reconcilia
 * `guardarDuraciones`, que devuelve los nombres recalculados por la base.)
 */
export async function guardarIntake(
  ideaId: string,
  campo: string,
  valorAnterior: string | null,
  valorNuevo: string | null,
): Promise<IntakeResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const regla = CAMPOS_INTAKE[campo];
  if (!regla) return { ok: false, error: `Campo no permitido: ${campo}` };

  const role = await getViewAs();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no edita la plantilla." };
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  // La liga de entrega se pinta como href — un javascript:/data: sería clicable.
  if (regla.url && valorNuevo?.trim() && !urlSegura(valorNuevo.trim())) {
    return { ok: false, error: "La liga debe empezar con http:// o https://" };
  }

  const db = supabaseAdmin();
  const { data: idea } = await db
    .from("ideas").select("status").eq("id", ideaId).maybeSingle();
  if (!idea) return { ok: false, error: "La tarea ya no existe." };

  const status = idea.status as AssetStatus;
  if (ESTADOS_CERRADOS.includes(status) && !canOverrideStatus(role)) {
    return { ok: false, error: "Esta tarea ya está cerrada. Pídele a un lead que la reabra." };
  }

  // Se guarda SIN recortar (como guardarCampo): el valor que el cliente recuerda
  // debe coincidir con el guardado, o el siguiente compare-and-set marca un
  // conflicto espurio y no escribe (pasa con un salto de línea final en textareas).
  const limpio = valorNuevo?.trim() ? valorNuevo : null;

  const base = db.from("ideas").update({ [campo]: limpio }).eq("id", ideaId);
  const { data, error } =
    valorAnterior === null
      ? await base.is(campo, null).select("id")
      : await base.eq(campo, valorAnterior).select("id");

  if (error) return { ok: false, error: error.message };

  if (!data?.length) {
    const { data: actual } = await db
      .from("ideas").select(campo).eq("id", ideaId).maybeSingle();
    const v = (actual as Record<string, string | null> | null)?.[campo] ?? null;
    if (v !== limpio) return { ok: false, conflicto: true, valorActual: v };
  }

  return { ok: true };
}

/**
 * Guarda las DURACIONES (pastillas) de una tarea. La reconciliación de los
 * entregables (agregar filas por duración nueva, quitar las de las duraciones
 * borradas) ocurre ATÓMICAMENTE en `rpc_set_duraciones` — una sola transacción,
 * con una guarda dura que ABORTA si se intenta quitar una duración cuya entrega
 * ya se subió o está en revisión (nunca destruye trabajo producido ni su
 * historial). Aquí sólo va la puerta de rol/estado; el resto lo hace la base.
 * Devuelve los nombres YA recalculados para que la pantalla no muestre un nombre
 * que la base no tiene.
 */
export async function guardarDuraciones(
  ideaId: string,
  duraciones: string[],
): Promise<{ ok: true; filenames: string[] } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const role = await getViewAs();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no edita la plantilla." };
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();
  const { data: idea } = await db
    .from("ideas").select("status").eq("id", ideaId).maybeSingle();
  if (!idea) return { ok: false, error: "La tarea ya no existe." };
  const status = (idea as { status: AssetStatus }).status;
  if (ESTADOS_CERRADOS.includes(status) && !canOverrideStatus(role)) {
    return { ok: false, error: "Esta tarea ya está cerrada. Pídele a un lead que la reabra." };
  }

  const { error } = await db.rpc("rpc_set_duraciones", {
    p_idea_id: ideaId,
    p_duraciones: duraciones,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/[cliente]/tareas/[id]", "page");
  const { data: archivos } = await db
    .from("assets")
    .select("filename")
    .eq("idea_id", ideaId)
    .order("tamano_code")
    .order("plataforma_code")
    .order("duracion_code")
    .returns<{ filename: string | null }[]>();
  return { ok: true, filenames: (archivos ?? []).map((a) => a.filename).filter(Boolean) as string[] };
}

/**
 * Guarda "Consideraciones" (Rünna tools): la caja única que combina Comentarios
 * del lead (comentarios_creativo) + Peloteo (peloteo_raw). Escribe TODO a
 * `peloteo_raw` y, en el mismo write, CONSOLIDA poniendo `comentarios_creativo`
 * a null — así en cargas siguientes no se vuelve a prepender (sin duplicar, sin
 * migración de datos).
 *
 * El compare-and-set NO es contra `peloteo_raw` crudo (que sería sólo la mitad),
 * sino contra el valor COMBINADO que vio la persona: se releen ambas columnas,
 * se combinan igual que en el cliente, y si no coincide con `valorAnterior` es
 * que alguien más lo tocó (conflicto), como en guardarIntake/guardarCampo.
 */
export async function guardarConsideraciones(
  ideaId: string,
  valorAnterior: string | null,
  valorNuevo: string | null,
): Promise<IntakeResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };

  const role = await getViewAs();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no edita la plantilla." };
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();
  const { data: idea } = await db
    .from("ideas")
    .select("status, comentarios_creativo, peloteo_raw")
    .eq("id", ideaId)
    .maybeSingle();
  if (!idea) return { ok: false, error: "La tarea ya no existe." };

  const status = idea.status as AssetStatus;
  if (ESTADOS_CERRADOS.includes(status) && !canOverrideStatus(role)) {
    return { ok: false, error: "Esta tarea ya está cerrada. Pídele a un lead que la reabra." };
  }

  const fila = idea as { comentarios_creativo: string | null; peloteo_raw: string | null };
  const combinadoActual = combinarConsideraciones(fila.comentarios_creativo, fila.peloteo_raw);
  // Se guarda SIN recortar (como guardarCampo): así el valor que el cliente
  // recuerda coincide con el guardado y no dispara un conflicto espurio.
  const limpio = valorNuevo?.trim() ? valorNuevo : null;

  // Ya vale lo que queremos → nada que hacer (idempotente).
  if ((combinadoActual ?? null) === (limpio ?? null)) return { ok: true };
  // Cambió desde que se cargó → conflicto (lo decide la persona).
  if ((valorAnterior ?? null) !== (combinadoActual ?? null)) {
    return { ok: false, conflicto: true, valorActual: combinadoActual };
  }

  // Consolidar de forma ATÓMICA: el UPDATE sólo escribe si las DOS columnas
  // siguen EXACTAMENTE como se leyeron (compare-and-set en el WHERE, no
  // read-modify-write). Si otra escritura ganó la carrera entre el SELECT y
  // este UPDATE, 0 filas → se re-lee y se reporta el conflicto. (Sin esto sería
  // un TOCTOU: dos asignados podrían pisarse sin aviso — la familia del
  // row_hash 'imported' que guardarCampo evita.)
  let q = db.from("ideas").update({ peloteo_raw: limpio, comentarios_creativo: null }).eq("id", ideaId);
  q = fila.peloteo_raw === null ? q.is("peloteo_raw", null) : q.eq("peloteo_raw", fila.peloteo_raw);
  q = fila.comentarios_creativo === null
    ? q.is("comentarios_creativo", null)
    : q.eq("comentarios_creativo", fila.comentarios_creativo);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: error.message };

  if (!data?.length) {
    const { data: fresca } = await db
      .from("ideas")
      .select("comentarios_creativo, peloteo_raw")
      .eq("id", ideaId)
      .maybeSingle();
    const f2 = (fresca ?? {}) as { comentarios_creativo: string | null; peloteo_raw: string | null };
    const combinado2 = combinarConsideraciones(f2.comentarios_creativo, f2.peloteo_raw);
    if ((combinado2 ?? null) === (limpio ?? null)) return { ok: true };
    return { ok: false, conflicto: true, valorActual: combinado2 };
  }

  revalidatePath("/[cliente]/tareas/[id]", "page");
  return { ok: true };
}

/** Campos editables del BRIEF (viven en `briefs`, no en `ideas`). */
const CAMPOS_BRIEF = new Set(["description"]);

/**
 * Guarda un campo del BRIEF (el "Resumen del brief" de la banda de marca), con
 * el mismo compare-and-set. Aparte de guardarIntake porque escribe otra tabla
 * y su permiso es de lead (el resumen lo pone quien arma el brief).
 */
export async function guardarBrief(
  briefId: string,
  campo: string,
  valorAnterior: string | null,
  valorNuevo: string | null,
): Promise<IntakeResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!CAMPOS_BRIEF.has(campo)) return { ok: false, error: `Campo no permitido: ${campo}` };

  const role = await getViewAs();
  if (!canOverrideStatus(role)) {
    return { ok: false, error: "Sólo un lead edita el resumen del brief." };
  }

  const db = supabaseAdmin();

  // Un lead es departamental: sólo edita briefs que tocan SU equipo. Los briefs no
  // llevan track propio, así que se mira si tienen alguna idea del track del lead.
  if (role === "lead") {
    const u = await getCurrentUser();
    const { data: suyo } = await db
      .from("ideas")
      .select("id")
      .eq("brief_id", briefId)
      .eq("track", u?.member?.track ?? "__none__")
      .limit(1)
      .maybeSingle();
    if (!suyo) return { ok: false, error: "Este brief es de otro equipo." };
  }

  const limpio = valorNuevo?.trim() ? valorNuevo.trim() : null;

  const base = db.from("briefs").update({ [campo]: limpio }).eq("id", briefId);
  const { data, error } =
    valorAnterior === null
      ? await base.is(campo, null).select("id")
      : await base.eq(campo, valorAnterior).select("id");

  if (error) return { ok: false, error: error.message };

  if (!data?.length) {
    const { data: actual } = await db
      .from("briefs").select(campo).eq("id", briefId).maybeSingle();
    const v = (actual as Record<string, string | null> | null)?.[campo] ?? null;
    if (v !== limpio) return { ok: false, conflicto: true, valorActual: v };
  }
  return { ok: true };
}

/**
 * Guarda UN campo, con compare-and-set.
 *
 * Nunca se manda el objeto entero: eso es read-modify-write, y con varias
 * personas asignadas a la misma tarea (52 asignaciones sobre 30 tareas) el
 * último en guardar borraría lo que el otro acaba de escribir, sin error y sin
 * rastro — la misma familia que el `row_hash: "imported"`.
 *
 * El `where <campo> is not distinct from $anterior` hace que 0 filas signifique
 * "alguien más tocó justo este campo". Se devuelve el valor real para que la
 * persona decida, en vez de descartar algo en silencio.
 *
 * Se compara por CAMPO y no por updated_at: el trigger de updated_at es por
 * fila, así que editar el campo A haría conflictar el campo B sin razón.
 */
// Campos de contenido de un plano que pueden recibir correcciones (para atribuir
// autoría al importar un guión). Excluye id/orden/es_cierre.
const PLANO_CONTENT = ["titulo", "accion", "copy_in", "sfx", "gfx", "edicion", "dialogo"];

// ¿El trabajo de esta persona cuenta como AUTORÍA? Sólo el equipo creativo, y por
// su IDENTIDAD REAL (soy.role), NO por el view-as: un especialista puede estar
// viendo la app como admin/lead y seguir siendo el autor de lo que escribe. Antes
// se filtraba por el view-as, así que trabajar bajo el rol admin por defecto no
// dejaba autoría — y la Evaluación salía en cero. null = default 'creative'.
const dejaAutoria = (soyRole: string | null | undefined): boolean =>
  !["lead", "admin", "master"].includes(soyRole ?? "creative");

/**
 * Registra la AUTORÍA (field_edits, 0035) de las secciones que una persona del
 * equipo CREATIVO escribió — para la Evaluación por autor. NO se llama para
 * revisores (su retoque no es autoría) ni sin identidad; el gate vive en cada
 * caller. Best-effort, fuera del path de respuesta (after): si falla, el contenido
 * ya está guardado.
 */
function registrarAutoria(
  db: ReturnType<typeof supabaseAdmin>,
  ideaId: string,
  tabla: "planos" | "estaticos",
  filas: { filaId: string | null; campo: string }[],
  memberId: string,
): void {
  if (!filas.length) return;
  const rows = filas.map((f) => ({
    idea_id: ideaId,
    tabla,
    fila_id: f.filaId,
    campo: f.campo,
    member_id: memberId,
  }));
  after(() => {
    void db.from("field_edits").insert(rows);
  });
}

export async function guardarCampo(
  tabla: TablaGuardable,
  filaId: string,
  campo: string,
  valorAnterior: string | null,
  valorNuevo: string | null,
): Promise<GuardarResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!CAMPOS[tabla]?.has(campo)) return { ok: false, error: `Campo no permitido: ${campo}` };

  const [role, soy] = await Promise.all([getViewAs(), getSoy()]);
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no edita la plantilla." };

  const db = supabaseAdmin();

  // ¿La tarea está cerrada? Un guión aprobado no debe cambiar después de
  // aprobado sin que nadie se entere.
  // idea_id de la fila. `copies` NO tiene idea_id (llega por tema_id) → 2 saltos.
  let ideaId: string | null;
  if (tabla === "copies") {
    const { data: c } = await db.from("copies").select("tema_id").eq("id", filaId).maybeSingle();
    const temaId = (c as { tema_id: string } | null)?.tema_id ?? null;
    if (!temaId) return { ok: false, error: "La fila ya no existe." };
    const { data: t } = await db.from("copies_temas").select("idea_id").eq("id", temaId).maybeSingle();
    ideaId = (t as { idea_id: string } | null)?.idea_id ?? null;
  } else {
    const { data: fila } = await db.from(tabla).select("idea_id").eq("id", filaId).maybeSingle();
    ideaId = (fila as { idea_id: string } | null)?.idea_id ?? null;
  }
  if (!ideaId) return { ok: false, error: "La fila ya no existe." };
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const { data: idea } = await db
    .from("ideas").select("status").eq("id", ideaId).maybeSingle();
  const status = idea?.status as AssetStatus | undefined;
  if (status && ESTADOS_CERRADOS.includes(status) && !canOverrideStatus(role)) {
    return { ok: false, error: "Esta tarea ya está cerrada. Pídele a un lead que la reabra." };
  }

  const limpio = valorNuevo?.trim() ? valorNuevo : null;

  // El compare-and-set: la fila sólo se actualiza si el campo sigue teniendo el
  // valor que la persona vio. supabase-js no expresa "is not distinct from", así
  // que el caso null va con .is() y el resto con .eq().
  const base = db.from(tabla).update({ [campo]: limpio }).eq("id", filaId);
  const { data, error } =
    valorAnterior === null
      ? await base.is(campo, null).select("id")
      : await base.eq(campo, valorAnterior).select("id");

  if (error) return { ok: false, error: error.message };

  // 0 filas y la fila existe (ya se comprobó arriba) = alguien más la tocó.
  if (!data?.length) {
    const { data: actual } = await db
      .from(tabla).select(campo).eq("id", filaId).maybeSingle();
    const v = (actual as Record<string, string | null> | null)?.[campo] ?? null;
    // Si ya vale lo que queríamos escribir, no hay nada que resolver.
    if (v === limpio) return { ok: true };
    return { ok: false, conflicto: true, valorActual: v };
  }

  // Autoría (0035): sólo el equipo CREATIVO (el retoque de un revisor NO es
  // autoría — si no, un lead que arregla un campo se robaría la corrección del
  // especialista) y sólo en planos/estáticos (donde caen las correcciones).
  if (soy?.id && dejaAutoria(soy.role) && (tabla === "planos" || tabla === "estaticos")) {
    registrarAutoria(db, ideaId, tabla, [{ filaId, campo }], soy.id);
  }

  // Empezar a escribir ES empezar a trabajar. Si la tarea seguía en "Por hacer",
  // se mueve sola — es lo que pidió Pedro: "una vez que el asignado le da click
  // y empieza a trabajar en ella se mueve en automático a en progreso".
  // Pasa por rpc_task_start (la única puerta), así que queda en el historial con
  // quién fue. Si falla, NO se tira el guardado: el texto ya está a salvo.
  if (status === "todo" && limpio) {
    const { error: movErr } = await db.rpc("rpc_task_start", {
      p_idea_id: ideaId,
      p_actor_member: soy?.id ?? null,
    });
    if (!movErr) revalidatePath("/mi-trabajo");
  }

  // La ruta lleva el id de la IDEA, no el de la fila (plano/estático). Antes
  // se revalidaba con filaId → una ruta inexistente, un no-op silencioso.
  // Se revalida el patrón de la ruta para no depender del slug del cliente.
  revalidatePath("/[cliente]/tareas/[id]", "page");
  return { ok: true };
}

/** Añadir un plano al final del guión. Operación estructural: explícita. */
export async function agregarPlano(
  ideaId: string,
): Promise<{ ok: true; plano: PlanoVista } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const role = await getViewAs();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no edita la plantilla." };
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();
  const { data: ultimo } = await db
    .from("planos").select("orden").eq("idea_id", ideaId)
    .order("orden", { ascending: false }).limit(1).maybeSingle();

  // Devuelve la fila creada para insertarla en el estado del editor sin recargar.
  const { data, error } = await db
    .from("planos").insert({ idea_id: ideaId, orden: (ultimo?.orden ?? 0) + 1 })
    .select(COLS_PLANO).single();
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo agregar el plano." };
  return { ok: true, plano: data as PlanoVista };
}

// ── Plantilla Copies (0046): temas con cuota + copies ──────────
// El tema (topic + cuota) lo define el lead; el copy llena headline + descripción.
// Mismo gate que editar (canMoveStatus + assertCanActOnTask/Row). El nombre del tema
// y los campos del copy autoguardan por `guardarCampo` (tablas en el whitelist arriba).

/** Añade un tema a un Copies task. Devuelve la fila para el estado del editor. */
export async function agregarTema(
  ideaId: string,
): Promise<{ ok: true; tema: CopyTema } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!canMoveStatus(await getViewAs())) return { ok: false, error: "Este rol no edita la plantilla." };
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };
  const db = supabaseAdmin();
  const { data: ultimo } = await db
    .from("copies_temas").select("orden").eq("idea_id", ideaId)
    .order("orden", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db
    .from("copies_temas")
    .insert({ idea_id: ideaId, orden: ((ultimo as { orden: number } | null)?.orden ?? 0) + 1 })
    .select(COLS_TEMA).single();
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo agregar el tema." };
  return { ok: true, tema: data as CopyTema };
}

/** Cambia la cuota (nº objetivo de copies) de un tema. */
export async function guardarCuota(
  temaId: string,
  cuota: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!canMoveStatus(await getViewAs())) return { ok: false, error: "Este rol no edita la plantilla." };
  const scope = await assertCanActOnRow("copies_temas", temaId);
  if (!scope.ok) return { ok: false, error: scope.error };
  const n = Math.max(0, Math.min(999, Math.round(Number.isFinite(cuota) ? cuota : 1)));
  const { error } = await supabaseAdmin().from("copies_temas").update({ cuota: n }).eq("id", temaId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Borra un tema (cascada a sus copies). */
export async function borrarTema(temaId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!canMoveStatus(await getViewAs())) return { ok: false, error: "Este rol no edita la plantilla." };
  const scope = await assertCanActOnRow("copies_temas", temaId);
  if (!scope.ok) return { ok: false, error: scope.error };
  const { error } = await supabaseAdmin().from("copies_temas").delete().eq("id", temaId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Añade un copy vacío a un tema. Devuelve la fila creada. */
export async function agregarCopy(
  temaId: string,
): Promise<{ ok: true; copy: Copy } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!canMoveStatus(await getViewAs())) return { ok: false, error: "Este rol no edita la plantilla." };
  const scope = await assertCanActOnRow("copies_temas", temaId);
  if (!scope.ok) return { ok: false, error: scope.error };
  const db = supabaseAdmin();
  const { data: ultimo } = await db
    .from("copies").select("orden").eq("tema_id", temaId)
    .order("orden", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db
    .from("copies")
    .insert({ tema_id: temaId, orden: ((ultimo as { orden: number } | null)?.orden ?? 0) + 1 })
    .select(COLS_COPY).single();
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo agregar el copy." };
  return { ok: true, copy: data as Copy };
}

/** Borra un copy. */
export async function borrarCopy(copyId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!canMoveStatus(await getViewAs())) return { ok: false, error: "Este rol no edita la plantilla." };
  const scope = await assertCanActOnRow("copies", copyId);
  if (!scope.ok) return { ok: false, error: scope.error };
  const { error } = await supabaseAdmin().from("copies").delete().eq("id", copyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function borrarPlano(planoId: string): Promise<GuardarResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const role = await getViewAs();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no edita la plantilla." };
  const scope = await assertCanActOnRow("planos", planoId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const { error } = await supabaseAdmin().from("planos").delete().eq("id", planoId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Vacía el guión: borra TODOS los planos de la tarea de un golpe ("Descartar guión" /
 * empezar de cero — p. ej. tras un "Crear guión" que no gustó). El trigger BEFORE DELETE
 * (0039) limpia las correcciones ancladas de cada plano. La confirmación (2 pasos) vive
 * en la UI. Mismo gate que editar: rol que edita + poder actuar sobre ESTA tarea.
 */
export async function vaciarGuion(ideaId: string): Promise<GuardarResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const role = await getViewAs();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no edita la plantilla." };
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const { error } = await supabaseAdmin().from("planos").delete().eq("idea_id", ideaId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Borra una TAREA (idea) entera — sólo master/admin (Pedro 2026-08-21). Es un
 * DELETE duro; los FKs con ON DELETE CASCADE limpian planos, estáticos, assets,
 * asignaciones, comentarios, referencias y snippets de la idea (verificado contra
 * el catálogo). Los objetos en el bucket de referencias quedan huérfanos (inocuo).
 * No se puede deshacer: la confirmación vive en la UI.
 */
export async function eliminarTarea(
  cliente: string,
  ideaId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const role = await getViewAs();
  if (!canAdmin(role)) return { ok: false, error: "Sólo un admin o master puede borrar una tarea." };

  const { error } = await supabaseAdmin().from("ideas").delete().eq("id", ideaId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${cliente}/tablero`);
  revalidatePath(`/${cliente}/briefs`);
  return { ok: true };
}

/**
 * Si la tarea está en "todo", la arranca (todo→in_progress) al importar contenido
 * — igual que guardarCampo con el primer texto. Sin esto, pegar un guión llenaba
 * los planos pero el botón seguía en "Empezar" en vez de "Mandar a revisión"
 * (Pedro). Revalida la página para que el nuevo status llegue a AccionesTarea.
 */
async function iniciarTareaSiTodo(db: ReturnType<typeof supabaseAdmin>, ideaId: string): Promise<void> {
  const { data: idea } = await db.from("ideas").select("status").eq("id", ideaId).maybeSingle();
  if ((idea?.status as AssetStatus | undefined) !== "todo") return;
  const soy = await getSoy();
  const { error } = await db.rpc("rpc_task_start", { p_idea_id: ideaId, p_actor_member: soy?.id ?? null });
  if (!error) revalidatePath("/mi-trabajo");
}

/**
 * Importa varios planos de un guión pegado (ya parseado en el cliente con
 * src/lib/guion.ts). Atómico vía rpc_import_planos: "replace" reemplaza todos,
 * "append" los agrega al final. El humano YA revisó/editó la vista previa antes
 * de confirmar; aquí sólo se escribe.
 */
export async function importarGuion(
  ideaId: string,
  planos: PlanoParsed[],
  modo: "append" | "replace",
): Promise<{ ok: true; planos: PlanoVista[] } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const role = await getViewAs();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no edita la plantilla." };
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };
  if (!planos.length) return { ok: false, error: "No hay planos que importar." };

  const db = supabaseAdmin();
  const { error } = await db.rpc("rpc_import_planos", {
    p_idea_id: ideaId,
    p_planos: planos,
    p_modo: modo,
  });
  if (error) return { ok: false, error: error.message };
  await iniciarTareaSiTodo(db, ideaId); // pegar contenido = empezar a trabajar
  revalidatePath("/[cliente]/tareas/[id]", "page");
  // Devuelve la lista COMPLETA resultante (replace o append) para que el editor
  // reemplace su estado sin recargar; los planos nuevos entran con animación.
  const { data } = await db.from("planos").select(COLS_PLANO).eq("idea_id", ideaId).order("orden");
  // Autoría (0035): pegar un guión ES escribirlo. Se atribuye cada sección con
  // contenido al que pegó (si es del equipo creativo). Sin esto, quien pega todo su
  // guión y no edita inline no autoraría nada y quedaría invisible en la Evaluación.
  const soy = await getSoy();
  if (soy?.id && dejaAutoria(soy.role)) {
    const filas: { filaId: string; campo: string }[] = [];
    for (const p of (data ?? []) as Record<string, unknown>[]) {
      for (const campo of PLANO_CONTENT) {
        const v = p[campo];
        if (typeof v === "string" && v.trim()) filas.push({ filaId: p.id as string, campo });
      }
    }
    registrarAutoria(db, ideaId, "planos", filas, soy.id);
  }
  return { ok: true, planos: (data ?? []) as PlanoVista[] };
}

/**
 * Importa el copy de un estático pegado (parseado con src/lib/guion.ts). Escribe
 * SÓLO los campos que el parser encontró — nunca pisa con vacío un campo que ya
 * tenía contenido (lección never-let-empty-overwrite-good-data).
 */
export async function importarEstatico(
  ideaId: string,
  campos: EstaticoParsed,
): Promise<{ ok: true; estatico: EstaticoVista | null } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const role = await getViewAs();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no edita la plantilla." };
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const CAMPOS_ESTATICO = ["copy_titulo", "copy_subtitulo", "copy_cta", "legales_extra"] as const;
  const patch: Record<string, string> = {};
  for (const k of CAMPOS_ESTATICO) {
    const v = campos[k]?.trim();
    if (v) patch[k] = v;
  }
  if (!Object.keys(patch).length) return { ok: false, error: "No se encontró copy que importar." };

  const db = supabaseAdmin();
  const { error } = await db.from("estaticos").update(patch).eq("idea_id", ideaId);
  if (error) return { ok: false, error: error.message };
  await iniciarTareaSiTodo(db, ideaId); // pegar copy = empezar a trabajar
  revalidatePath("/[cliente]/tareas/[id]", "page");
  // El update YA fue exitoso; si el refetch no trae fila (transitorio), NO es un
  // fallo de escritura — devolvemos null y el cliente recarga para reconciliar.
  const { data } = await db.from("estaticos").select(COLS_ESTATICO).eq("idea_id", ideaId).single();
  // Autoría (0035): pegar el copy ES escribirlo — cada campo escrito se atribuye al
  // que pegó (si es del equipo creativo).
  const soy = await getSoy();
  const estId = (data as { id?: string } | null)?.id;
  if (soy?.id && dejaAutoria(soy.role) && estId) {
    registrarAutoria(
      db,
      ideaId,
      "estaticos",
      Object.keys(patch).map((campo) => ({ filaId: estId, campo })),
      soy.id,
    );
  }
  return { ok: true, estatico: (data ?? null) as EstaticoVista | null };
}

/**
 * H.Ü.E — extractor format-agnostic. El parser determinista (parseGuion) maneja el
 * formato del deck sin IA; esto es el FALLBACK para cuando el pegado viene en
 * CUALQUIER otro formato (tabla, bullets, screenplay, etiquetas distintas, o el deck
 * con los saltos de línea perdidos). H.Ü.E lee el texto crudo y lo MAPEA a los campos
 * de plano de Greenlight, devolviendo planos estructurados (no texto con saltos).
 *
 * GUARDARRAÍL DURO (`sinInventar`): se acepta SÓLO si cada letra, dígito y signo de
 * legal/oferta (* % $) de lo extraído aparece en la entrada — H.Ü.E puede seleccionar
 * y reordenar el texto en campos, pero JAMÁS inventar, cambiar, traducir ni expandir
 * una palabra/número/legal. Si mete algo que no estaba, se rechaza. OMITIR contenido
 * lo caza la vista previa humana obligatoria (nunca escribe sin que el humano confirme).
 */
export async function extraerGuion(
  texto: string,
): Promise<{ ok: true; planos: PlanoParsed[] } | { ok: false; error: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "H.Ü.E no está configurado (falta la clave)." };
  }
  const role = await getViewAs();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no edita la plantilla." };
  if (!texto.trim()) return { ok: false, error: "No hay texto que leer." };

  // Limpia markdown/tabla (`**`, `|`, `<br>`) ANTES de mandarlo — así H.Ü.E recibe el
  // texto crudo del guión sin ruido de formato. El guard compara contra ESTE limpio.
  const limpio = limpiarPegado(texto);

  const CAMPO = { type: "string" as const };
  const schema = {
    type: "object" as const,
    properties: {
      planos: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            titulo: CAMPO, accion: CAMPO, copy_in: CAMPO,
            sfx: CAMPO, gfx: CAMPO, edicion: CAMPO, dialogo: CAMPO,
          },
          required: ["titulo", "accion", "copy_in", "sfx", "gfx", "edicion", "dialogo"],
          additionalProperties: false,
        },
      },
    },
    required: ["planos"],
    additionalProperties: false,
  };

  const prompt =
    "Te doy el texto crudo de un guión de anuncio, en el formato en que lo pegó el " +
    "usuario (puede ser una tabla, bullets, un screenplay, columnas, o el deck con los " +
    "saltos de línea perdidos). Tu tarea es LEERLO y mapearlo a los campos de un plano " +
    "de Greenlight, un objeto por cada plano/toma, con la herramienta emitir_planos.\n\n" +
    "Campos de cada plano:\n" +
    "- titulo: el encabezado del plano (ej. \"Plano 1 - int Sala - MCU\").\n" +
    "- accion: la descripción de lo que pasa en pantalla.\n" +
    "- copy_in: el texto que aparece SOBRE la pantalla (incluye el valor de \"Botón CTA\" si lo hay).\n" +
    "- sfx: efectos de sonido.\n" +
    "- gfx: gráficos / lettering.\n" +
    "- edicion: notas de edición o transición SÓLO si hay una etiqueta explícita; si no, cadena vacía.\n" +
    "- dialogo: lo que se habla, en el formato \"(Locutor) texto\" — envuelve el nombre/rol del " +
    "locutor en paréntesis y déjalo antes de su línea. Junta varios locutores con saltos de línea.\n\n" +
    "REGLAS ABSOLUTAS — el copy va tal cual al cliente:\n" +
    "- Copia las PALABRAS VERBATIM. NO inventes, NO reescribas, NO traduzcas, NO corrijas ortografía, " +
    "NO expandas abreviaturas (deja \"V.O\" como \"V.O\", nunca \"Voz en Off\"), NO cambies ningún número, " +
    "porcentaje, precio ni signo de legal (* % $).\n" +
    "- NO agregues palabras que no estén en el texto. Si un campo no aparece, déjalo como cadena vacía.\n" +
    "- Conserva los emoji (🧡 🤝 ✨ ⭐ 👀) EXACTAMENTE como están; nunca los traduzcas a palabras " +
    "ni los describas (no escribas \"orange heart\" ni \"clapping hands\"). Si ves un `:shortcode:`, déjalo igual.\n" +
    "- Conserva los marcadores de negrita markdown `**así**` EXACTAMENTE donde aparezcan (envuelven texto " +
    "en negrita); no los quites ni agregues.\n" +
    "- Sólo puedes MOVER el texto a su campo y agregar los paréntesis del formato de diálogo.\n\n" +
    "Texto:\n<<<\n" + limpio + "\n>>>";

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 16000,
      thinking: { type: "disabled" },
      tools: [{
        name: "emitir_planos",
        description: "Emite los planos extraídos del guión, un objeto por plano.",
        input_schema: schema,
      }],
      tool_choice: { type: "tool", name: "emitir_planos" },
      messages: [{ role: "user", content: prompt }],
    });

    const bloque = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const crudos = (bloque?.input as { planos?: unknown[] } | undefined)?.planos;
    if (!Array.isArray(crudos) || crudos.length === 0) {
      return { ok: false, error: "H.Ü.E no pudo leer ningún plano. Revisá el texto." };
    }

    const s = (v: unknown): string | null =>
      typeof v === "string" && v.trim() ? v.trim() : null;
    const planos: PlanoParsed[] = crudos.map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      return {
        titulo: s(o.titulo), accion: s(o.accion), copy_in: s(o.copy_in),
        sfx: s(o.sfx), gfx: s(o.gfx), edicion: s(o.edicion), dialogo: s(o.dialogo),
      };
    });

    // Guardarraíl: junta TODO lo extraído y verifica que no inventó nada. Se quitan
    // los marcadores de negrita `**` de AMBOS lados antes de comparar: si no, cada par
    // `**` infla el presupuesto de `*` del guard y dejaría colar un `*` legal inventado.
    // La negrita es formato (como la puntuación/emoji), no contenido — no se cuenta.
    const extraido = planos
      .flatMap((p) => Object.values(p).filter((x): x is string => !!x))
      .join(" ");
    if (!sinInventar(sinNegrita(limpio), sinNegrita(extraido))) {
      return {
        ok: false,
        error: "H.Ü.E cambió o agregó texto, así que no se aplicó. Pegá el guión o edítalo a mano.",
      };
    }

    return { ok: true, planos };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al llamar a H.Ü.E." };
  }
}

/** Asocia un snippet de la biblioteca (legal o selling point) a la tarea. */
export async function alternarSnippet(
  ideaId: string,
  snippetId: string,
  activar: boolean,
): Promise<GuardarResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const role = await getViewAs();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no edita la plantilla." };
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();
  const { error } = activar
    ? await db.from("idea_snippets").upsert({ idea_id: ideaId, snippet_id: snippetId })
    : await db.from("idea_snippets").delete().eq("idea_id", ideaId).eq("snippet_id", snippetId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

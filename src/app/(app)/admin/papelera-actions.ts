"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canHue } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";
// La constante y el tipo viven en lib/: un módulo "use server" sólo puede exportar
// funciones async (exportar aquí DIAS_RETENCION rompía el build).
import { DIAS_RETENCION, type ItemPapelera } from "@/lib/papelera";

/**
 * PAPELERA de 30 días (0057). Borrar sella `deleted_at` en vez de destruir; aquí
 * vive lo que se puede recuperar y lo que ya venció.
 *
 * SÓLO EL MASTER BUILDER (Pedro): admin/lead pueden BORRAR (mandar a la papelera),
 * pero restaurar y vaciar son suyos. Mismo gate que el H.Ü.E HUB (`canHue`).
 *
 * PURGA PEREZOSA (decisión de Pedro 2026-09-01): no hay cron. El borrado duro de lo
 * vencido ocurre al ABRIR la papelera (y a mano con "Vaciar"). Sin nada que agendar
 * ni monitorear — y un job que se cae en silencio no puede fallar si no existe. La
 * garantía real ("recuperable 30 días") se cumple igual; lo vencido simplemente deja
 * de listarse y se limpia en la siguiente visita.
 */

type Fail = { ok: false; error: string };
type Ok<T = object> = { ok: true } & T;

/** Gate: sólo master. null = pasa. */
async function noMaster(): Promise<Fail | null> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!canHue(await getViewAs())) {
    return { ok: false, error: "La papelera es sólo del Master Builder." };
  }
  return null;
}

/** El corte: nada anterior a esto sigue siendo recuperable. */
function corteISO(): string {
  return new Date(Date.now() - DIAS_RETENCION * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * BORRADO DURO de lo vencido. Los briefs van primero: su cascada se lleva sus tareas
 * (y todo lo que cuelga de ellas), así el segundo delete sólo barre tareas sueltas.
 * Best-effort: si fallara, la papelera igual se lista — no bloquea la pantalla.
 */
async function purgarVencidos(db: ReturnType<typeof supabaseAdmin>): Promise<void> {
  const corte = corteISO();
  const { error: eB } = await db.from("briefs").delete().lt("deleted_at", corte);
  if (eB) console.error("[papelera] purga de briefs vencidos falló:", eB.message);
  const { error: eI } = await db.from("ideas").delete().lt("deleted_at", corte);
  if (eI) console.error("[papelera] purga de tareas vencidas falló:", eI.message);
}

/** Lo recuperable (≤30 días), briefs y tareas, lo más reciente primero. */
export async function listarPapelera(): Promise<Ok<{ items: ItemPapelera[] }> | Fail> {
  const no = await noMaster();
  if (no) return no;
  const db = supabaseAdmin();

  await purgarVencidos(db); // perezosa: abrir la papelera es lo que limpia

  const corte = corteISO();
  const [rBriefs, rIdeas] = await Promise.all([
    db.from("briefs")
      .select("id, brief_name, code, brief_date, client_id, deleted_at, deleted_by")
      .not("deleted_at", "is", null).gte("deleted_at", corte)
      .order("deleted_at", { ascending: false }).limit(500),
    db.from("ideas")
      .select("id, code, naming_base, concepto, brief_id, deleted_at, deleted_by")
      .not("deleted_at", "is", null).gte("deleted_at", corte)
      .order("deleted_at", { ascending: false }).limit(500),
  ]);
  // Un error NO debe leerse como "papelera vacía" — eso invitaría a dar por perdido
  // algo que sí es recuperable. Fallar honesto.
  if (rBriefs.error) return { ok: false, error: `Briefs: ${rBriefs.error.message}` };
  if (rIdeas.error) return { ok: false, error: `Tareas: ${rIdeas.error.message}` };

  const briefs = (rBriefs.data ?? []) as {
    id: string; brief_name: string | null; code: string | null; brief_date: string | null;
    client_id: string; deleted_at: string; deleted_by: string | null;
  }[];
  const ideas = (rIdeas.data ?? []) as {
    id: string; code: string | null; naming_base: string | null; concepto: string | null;
    brief_id: string; deleted_at: string; deleted_by: string | null;
  }[];

  // Nombres para mostrar (cliente, brief padre, quién borró) en lote — sin N+1.
  const clientIds = [...new Set(briefs.map((b) => b.client_id))];
  const briefIds = [...new Set(ideas.map((i) => i.brief_id))];
  const autorIds = [...new Set([...briefs, ...ideas].map((r) => r.deleted_by).filter(Boolean))] as string[];
  const [rCli, rBriefsPadre, rAutores] = await Promise.all([
    clientIds.length ? db.from("clients").select("id, name").in("id", clientIds) : { data: [] },
    briefIds.length
      ? db.from("briefs").select("id, brief_name, code, client_id, deleted_at").in("id", briefIds)
      : { data: [] },
    autorIds.length ? db.from("profiles").select("id, full_name").in("id", autorIds) : { data: [] },
  ]);
  const cliName = new Map(((rCli.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const padre = new Map(
    ((rBriefsPadre.data ?? []) as {
      id: string; brief_name: string | null; code: string | null; client_id: string; deleted_at: string | null;
    }[]).map((b) => [b.id, b]),
  );
  const autor = new Map(
    ((rAutores.data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]),
  );

  const restantes = (iso: string) =>
    Math.max(0, DIAS_RETENCION - Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

  const items: ItemPapelera[] = [
    ...briefs.map((b) => ({
      id: b.id,
      tipo: "brief" as const,
      titulo: b.brief_name || b.code || "Brief sin nombre",
      contexto: cliName.get(b.client_id) ?? null,
      borradoEn: b.deleted_at,
      borradoPor: b.deleted_by ? autor.get(b.deleted_by) ?? null : null,
      diasRestantes: restantes(b.deleted_at),
      bloqueadaPorBrief: false,
    })),
    ...ideas.map((i) => {
      const p = padre.get(i.brief_id);
      const cli = p ? cliName.get(p.client_id) : null;
      const nombreBrief = p ? p.brief_name || p.code : null;
      return {
        id: i.id,
        tipo: "tarea" as const,
        titulo: i.naming_base || i.code || i.concepto?.slice(0, 60) || "Tarea",
        contexto: [cli, nombreBrief].filter(Boolean).join(" · ") || null,
        borradoEn: i.deleted_at,
        borradoPor: i.deleted_by ? autor.get(i.deleted_by) ?? null : null,
        diasRestantes: restantes(i.deleted_at),
        // Su brief también está en la papelera → restaurarla sola la dejaría invisible
        // (board_tasks exige brief vivo). Se restaura con el brief.
        bloqueadaPorBrief: !!p?.deleted_at,
      };
    }),
  ].sort((a, b) => (a.borradoEn < b.borradoEn ? 1 : -1));

  return { ok: true, items };
}

/** Restaura una TAREA suelta. Si su brief está en la papelera, se restaura ese. */
export async function restaurarTarea(ideaId: string): Promise<Ok | Fail> {
  const no = await noMaster();
  if (no) return no;
  const db = supabaseAdmin();

  const { data: idea, error: eLeer } = await db
    .from("ideas").select("brief_id, deleted_at").eq("id", ideaId).maybeSingle();
  if (eLeer) return { ok: false, error: eLeer.message };
  const i = idea as { brief_id: string; deleted_at: string | null } | null;
  if (!i) return { ok: false, error: "Esa tarea ya no existe (pudo purgarse a los 30 días)." };
  if (!i.deleted_at) return { ok: true }; // ya viva: idempotente

  const { data: brief } = await db
    .from("briefs").select("deleted_at").eq("id", i.brief_id).maybeSingle();
  if ((brief as { deleted_at: string | null } | null)?.deleted_at) {
    return {
      ok: false,
      error: "Su brief también está en la papelera. Restaura el brief y la tarea vuelve con él.",
    };
  }

  const { error } = await db
    .from("ideas").update({ deleted_at: null, deleted_by: null }).eq("id", ideaId);
  if (error) return { ok: false, error: error.message };
  revalidarTodo();
  return { ok: true };
}

/**
 * Restaura un BRIEF con el árbol que se fue con él. Se devuelven SÓLO las tareas
 * selladas en el MISMO instante que el brief: una tarea que ya estaba en la papelera
 * antes (borrada suelta) se queda ahí — restaurar es deshacer AQUEL borrado, no
 * resucitar todo lo que alguna vez se borró de ese brief.
 */
export async function restaurarBrief(briefId: string): Promise<Ok<{ tareas: number }> | Fail> {
  const no = await noMaster();
  if (no) return no;
  const db = supabaseAdmin();

  const { data: brief, error: eLeer } = await db
    .from("briefs").select("deleted_at").eq("id", briefId).maybeSingle();
  if (eLeer) return { ok: false, error: eLeer.message };
  const b = brief as { deleted_at: string | null } | null;
  if (!b) return { ok: false, error: "Ese brief ya no existe (pudo purgarse a los 30 días)." };
  if (!b.deleted_at) return { ok: true, tareas: 0 };

  const sello = b.deleted_at;
  const { data: vueltas, error: eIdeas } = await db
    .from("ideas")
    .update({ deleted_at: null, deleted_by: null })
    .eq("brief_id", briefId).eq("deleted_at", sello)
    .select("id");
  if (eIdeas) return { ok: false, error: eIdeas.message };

  const { error } = await db
    .from("briefs").update({ deleted_at: null, deleted_by: null }).eq("id", briefId);
  if (error) return { ok: false, error: error.message };

  revalidarTodo();
  return { ok: true, tareas: ((vueltas ?? []) as { id: string }[]).length };
}

/**
 * VACIAR: borrado duro INMEDIATO de todo lo que está en la papelera — con sus
 * cascadas (planos, estáticos, assets, comentarios, historial…). Irreversible de
 * verdad; la confirmación de dos pasos vive en la UI.
 */
export async function vaciarPapelera(): Promise<Ok<{ briefs: number; tareas: number }> | Fail> {
  const no = await noMaster();
  if (no) return no;
  const db = supabaseAdmin();

  // Briefs primero: su cascada se lleva las tareas que cuelgan de ellos.
  const { data: dB, error: eB } = await db
    .from("briefs").delete().not("deleted_at", "is", null).select("id");
  if (eB) return { ok: false, error: eB.message };
  const { data: dI, error: eI } = await db
    .from("ideas").delete().not("deleted_at", "is", null).select("id");
  if (eI) return { ok: false, error: eI.message };

  revalidarTodo();
  return {
    ok: true,
    briefs: ((dB ?? []) as { id: string }[]).length,
    tareas: ((dI ?? []) as { id: string }[]).length,
  };
}

/** Restaurar/purgar cambia lo que se ve en todas las superficies de trabajo. */
function revalidarTodo() {
  revalidatePath("/admin");
  revalidatePath("/mi-trabajo");
  revalidatePath("/entregas");
  revalidatePath("/[cliente]/tablero", "page");
  revalidatePath("/[cliente]/briefs", "page");
}

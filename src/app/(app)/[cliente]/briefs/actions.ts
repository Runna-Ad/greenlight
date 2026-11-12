"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canAdmin } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";
import { getCurrentUser } from "@/lib/identity";

/**
 * Manda un BRIEF entero a la PAPELERA, con TODAS sus tareas — sólo master/admin
 * (Pedro 2026-08-21).
 *
 * Ya NO es un DELETE duro (0057): sella `deleted_at`/`deleted_by` en el brief Y en
 * sus tareas. El árbol viaja JUNTO (decisión de Pedro 2026-09-01): restaurar el
 * brief devuelve exactamente las tareas que se fueron con él — por eso se sella
 * sólo lo que aún estaba vivo (`is deleted_at null`), para no resucitar una tarea
 * que ya estaba en la papelera por su cuenta.
 * El Master Builder restaura durante 30 días desde la Papelera.
 */
export async function eliminarBrief(
  cliente: string,
  briefId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const role = await getViewAs();
  if (!canAdmin(role)) return { ok: false, error: "Sólo un admin o master puede borrar un brief." };
  const actor = (await getCurrentUser())?.userId ?? null;

  const db = supabaseAdmin();
  const sello = { deleted_at: new Date().toISOString(), deleted_by: actor };

  // Las TAREAS primero: si fallara a media faena, un brief vivo con tareas selladas
  // se ve raro pero es recuperable; un brief sellado con tareas vivas dejaría trabajo
  // huérfano visible en el tablero sin brief detrás.
  const { error: eIdeas } = await db
    .from("ideas").update(sello).eq("brief_id", briefId).is("deleted_at", null);
  if (eIdeas) return { ok: false, error: eIdeas.message };

  const { error } = await db
    .from("briefs").update(sello).eq("id", briefId).is("deleted_at", null);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/${cliente}/briefs`);
  revalidatePath(`/${cliente}/tablero`);
  revalidatePath(`/${cliente}/portal`); // sus piezas publicadas salen del portal
  revalidatePath("/mi-trabajo");
  revalidatePath("/entregas");
  return { ok: true };
}

/**
 * Pone (o quita, con `null`) la FECHA DE ENTREGA de un paquete — sólo admin/master
 * (Pedro 2026-11-12: "due dates are set by admins"). La fecha del brief no se guarda:
 * es la más lejana de sus paquetes, así que se mueve sola.
 */
export async function ponerFechaPaquete(
  cliente: string,
  paqueteId: string,
  fecha: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const role = await getViewAs();
  if (!canAdmin(role)) return { ok: false, error: "Sólo un admin o master pone la fecha de un paquete." };
  // Una fecha de calendario real (31/02 no) entre 2020 y 2100: el navegador puede mandar
  // "0002-11-20" mientras se teclea el año.
  if (fecha !== null) {
    const d = new Date(`${fecha}T00:00:00Z`);
    const real = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
    const anio = Number(fecha.slice(0, 4));
    if (!real || anio < 2020 || anio > 2100) return { ok: false, error: "Fecha no válida." };
  }
  const actor = (await getCurrentUser())?.userId ?? null;
  const db = supabaseAdmin();

  // El paquete tiene que ser de ESTE cliente: el id viene del navegador.
  const { data: cli } = await db.from("clients").select("id").eq("slug", cliente).maybeSingle<{ id: string }>();
  if (!cli) return { ok: false, error: "Cliente no encontrado." };

  const { data, error } = await db
    .from("paquetes")
    .update({ fecha_entrega: fecha, fecha_por: actor, fecha_at: new Date().toISOString() })
    .eq("id", paqueteId)
    .eq("client_id", cli.id)
    .select("id");
  if (error) {
    console.error("ponerFechaPaquete:", error.message);
    return { ok: false, error: "No se pudo guardar la fecha. Intenta de nuevo." };
  }
  if (!data?.length) return { ok: false, error: "Paquete no encontrado." };

  revalidatePath(`/${cliente}/briefs`);
  revalidatePath(`/${cliente}/portal`);
  return { ok: true };
}

"use server";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getCurrentUser } from "@/lib/identity";
import { canCreateBrief } from "@/lib/roles";
import { classifyTab } from "@/lib/sheet-sync";
import { ejecutarImport, tieneIdeaViva, type ImportRow, type ImportResult } from "@/lib/import-lote";

// Los tipos viven en el módulo puro (un "use server" sólo exporta funciones async);
// se re-exportan para que la página de sync los siga importando de aquí.
export type { ImportRow, ImportResult, BlockedRow } from "@/lib/import-lote";

/**
 * Create real work from approved sheet rows. Aquí viven SÓLO las puertas (base
 * configurada, identidad, rol, track del lead, cliente); el write-path en lotes
 * está en src/lib/import-lote.ts, donde se prueba contra una base falsa.
 */
export async function importRows(
  clienteSlug: string,
  rows: ImportRow[],
): Promise<ImportResult> {
  const res: ImportResult = {
    ok: false, created: 0, assets: 0, skipped: 0, blocked: [], errors: [],
  };
  if (!hasSupabase()) {
    res.errors.push("La base de datos no está configurada.");
    return res;
  }
  if (!rows.length) {
    res.errors.push("No hay filas seleccionadas.");
    return res;
  }

  // Server-side gate: importar crea briefs/tareas → sólo lead/admin/master.
  const u = await getCurrentUser();
  if (!u || !canCreateBrief(u.role)) {
    res.errors.push("Sólo un lead o un admin puede importar del sheet.");
    return res;
  }
  // Un lead es DEPARTAMENTAL: sólo importa pestañas de sus track(s) otorgados (grant
  // multi-track) — igual que crearBrief. Admins/master son globales. Sin esto, un lead
  // de un track podía crear briefs/tareas del OTRO metiendo filas cuyo tab clasifica al
  // otro track (rows es un POST controlable por el cliente). (reap S1)
  if (u.role === "lead" && u.member) {
    const fuera = [...new Set(rows.map((r) => r.tab))].some((tab) => {
      const t = classifyTab(tab).track;
      return t != null && !u.member!.tracks.includes(t as "real" | "normal");
    });
    if (fuera) {
      res.errors.push("Un lead sólo importa pestañas de su propio equipo.");
      return res;
    }
  }

  const db = supabaseAdmin();

  const { data: client } = await db
    .from("clients").select("id").eq("slug", clienteSlug).maybeSingle();
  if (!client) {
    res.errors.push(`Cliente "${clienteSlug}" no encontrado.`);
    return res;
  }

  // Attribute the import to the authenticated user (login is on).
  return ejecutarImport(db, { clientId: client.id, actorId: u.userId }, rows);
}

/** naturalKey → rowHash for everything already imported, so sync skips it. */
export async function knownRows(clienteSlug: string): Promise<Record<string, string>> {
  if (!hasSupabase()) return {};
  const db = supabaseAdmin();
  const { data: client } = await db
    .from("clients").select("id").eq("slug", clienteSlug).maybeSingle();
  if (!client) return {};
  // MISMA regla que el dedup del import (tieneIdeaViva): una fila cuya tarea está en
  // la PAPELERA deja de contar como "ya conocida", para que la vista previa la muestre
  // como NUEVA y se pueda volver a importar. Si las dos no coincidieran, el preview
  // diría "sin cambios" y el import la aceptaría (o al revés) — la misma pregunta
  // respondida en dos sitios tiene que dar lo mismo.
  const { data } = await db
    .from("staged_rows")
    .select("natural_key, row_hash, idea_id, ideas(deleted_at)")
    .eq("client_id", client.id);
  const filas = (data ?? []) as unknown as {
    natural_key: string; row_hash: string; idea_id: string | null; ideas: unknown;
  }[];
  return Object.fromEntries(
    filas
      .filter((r) => tieneIdeaViva(r.ideas))
      .map((r) => [r.natural_key, r.row_hash]),
  );
}

// Revisor del cliente (0099) — lecturas de la base. UNA sola forma de leer el revisor y la
// lista de usuarios de la empresa, para el tablero, la tarea y el portal.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { revisorValido, type PersonaCliente } from "@/lib/revisor-cliente";

type Db = ReturnType<typeof supabaseAdmin>;

export type { PersonaCliente };

/** Usuarios activos (Partner) de una empresa, por nombre: las opciones del selector. */
export async function usuariosCliente(clientId: string, db: Db = supabaseAdmin()): Promise<PersonaCliente[]> {
  const { data, error } = await db
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "client")
    .eq("active", true)
    .eq("client_id", clientId)
    .order("full_name", { ascending: true })
    .returns<{ id: string; full_name: string | null; email: string | null }[]>();
  if (error) console.error("usuariosCliente:", error.message);
  return (data ?? []).map((p) => ({ id: p.id, name: nombreDe(p) }));
}

function nombreDe(p: { full_name: string | null; email: string | null }): string {
  return p.full_name?.trim() || p.email?.split("@")[0] || "Usuario";
}

/**
 * Revisor VÁLIDO de cada tarea (id → persona, o null = «Sin asignar»). Un revisor dado de
 * baja, movido de empresa o que ya no es cliente cuenta como «Sin asignar» (se valida al leer).
 * `clientId` es la empresa de esas tareas (todas las pantallas que lo usan son de un cliente).
 */
export async function revisoresDe(
  ideaIds: string[],
  clientId: string | null,
  db: Db = supabaseAdmin(),
): Promise<Record<string, PersonaCliente | null>> {
  const out: Record<string, PersonaCliente | null> = {};
  const ids = [...new Set(ideaIds)];
  for (const id of ids) out[id] = null;
  if (!ids.length || !clientId) return out;

  // Por tandas: una lista larga de ids en la URL de PostgREST tiene tope.
  const filas: { id: string; revisor_cliente_id: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from("ideas")
      .select("id, revisor_cliente_id")
      .in("id", ids.slice(i, i + 200))
      .not("revisor_cliente_id", "is", null)
      .returns<{ id: string; revisor_cliente_id: string | null }[]>();
    if (error) {
      console.error("revisoresDe:", error.message);
      return out; // sin revisores la pantalla se ve igual («Sin asignar»), no se rompe
    }
    filas.push(...(data ?? []));
  }
  const perfilIds = [...new Set(filas.map((f) => f.revisor_cliente_id).filter((x): x is string => !!x))];
  if (!perfilIds.length) return out;
  const { data: perfiles, error: e2 } = await db
    .from("profiles")
    .select("id, full_name, email, role, active, client_id")
    .in("id", perfilIds)
    .returns<{ id: string; full_name: string | null; email: string | null; role: string; active: boolean; client_id: string | null }[]>();
  if (e2) {
    console.error("revisoresDe perfiles:", e2.message);
    return out;
  }
  const porId = new Map((perfiles ?? []).map((p) => [p.id, p]));
  for (const f of filas) {
    const p = f.revisor_cliente_id ? porId.get(f.revisor_cliente_id) : undefined;
    out[f.id] = p && revisorValido(p, clientId) ? { id: p.id, name: nombreDe(p) } : null;
  }
  return out;
}

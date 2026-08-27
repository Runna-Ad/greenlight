import Link from "next/link";
import { UserRound, Lock } from "lucide-react";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getSoy } from "@/lib/soy";
import { getViewAs } from "@/lib/view-as";
import { ROLE_LABEL, canSee } from "@/lib/roles";
import { STATUS_LABEL, STATUS_TOKEN, type AssetStatus } from "@/lib/brand";
import { MyTasks, type MyTask } from "@/components/board/my-tasks";

export const dynamic = "force-dynamic";

/**
 * Correcciones PRIMERO. Es el punto del flujo: una tarea devuelta no puede
 * quedar enterrada bajo el trabajo nuevo, o se pierde.
 */
const ORDEN: AssetStatus[] = ["in_corrections", "in_progress", "todo", "under_review"];

export default async function MiTrabajoPage() {
  const [soy, role] = await Promise.all([getSoy(), getViewAs()]);

  if (!canSee(role, "mi-trabajo")) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
        <Lock className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-3 text-sm text-foreground">
          Un {ROLE_LABEL[role]} no tiene tareas asignadas aquí.
        </p>
      </div>
    );
  }

  if (!soy) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
        <UserRound className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-3 text-sm text-foreground">Inicia sesión</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Entra con tu cuenta de Rünna para ver las tareas asignadas a ti.
        </p>
      </div>
    );
  }

  let tasks: MyTask[] = [];
  if (hasSupabase()) {
    const db = supabaseAdmin();
    const { data } = await db
      .from("board_tasks")
      .select("*")
      .contains("member_ids", [soy.id])
      .limit(300)
      .returns<MyTask[]>();
    tasks = data ?? [];

    // Cambios del CLIENTE son cancha del LEAD: para un especialista (creative), una
    // tarea en in_corrections con cambios del cliente sin resolver NO es suya hasta que
    // se la reasignen — fuera de su lista. El lead SÍ la ve (se marca "Cambios del cliente").
    const enCorr = tasks.filter((t) => t.status === "in_corrections").map((t) => t.id);
    if (enCorr.length) {
      const { data: pend } = await db
        .from("comments")
        .select("idea_id")
        .in("idea_id", enCorr)
        .eq("kind", "client_change")
        .not("ronda", "is", null)
        .is("resolved_at", null)
        .returns<{ idea_id: string }[]>();
      const conCambios = new Set((pend ?? []).map((r) => r.idea_id));
      tasks = tasks
        .map((t) => ({ ...t, clientChangesPending: conCambios.has(t.id) }))
        .filter((t) => !(role === "creative" && t.clientChangesPending));
    }
  }

  const grupos = ORDEN.map((status) => ({
    status,
    items: tasks.filter((t) => t.status === status),
  })).filter((g) => g.items.length > 0);

  const pendientes = tasks.filter((t) => t.status !== "under_review").length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            <span className="size-2 rounded-full" style={{ backgroundColor: soy.color }} />
            {soy.name}{soy.track ? ` · ${soy.track}` : ""}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Mi trabajo</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          {tasks.length === 0
            ? "Sin tareas asignadas"
            : `${pendientes} pendiente${pendientes === 1 ? "" : "s"} de ${tasks.length}`}
        </p>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No tienes tareas asignadas ahora mismo.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Aparecen aquí en cuanto alguien te asigne una en el tablero.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map(({ status, items }) => (
            <section key={status}>
              <h3
                className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"
                style={{ color: `var(--status-${STATUS_TOKEN[status]})` }}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: `var(--status-${STATUS_TOKEN[status]})` }}
                />
                {status === "in_corrections" ? "Cambios pedidos" : STATUS_LABEL[status]}
                <span className="text-muted-foreground">({items.length})</span>
              </h3>
              <MyTasks tasks={items} soyId={soy.id} role={role} />
            </section>
          ))}
        </div>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        ¿Buscas el panorama completo?{" "}
        <Link href="/clientes" className="underline underline-offset-2">
          Ir a los tableros
        </Link>
      </p>
    </div>
  );
}

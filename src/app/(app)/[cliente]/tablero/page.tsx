import Link from "next/link";
import { RefreshCw, Lock } from "lucide-react";
import { ROLE_LABEL, canSee } from "@/lib/roles";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { Button } from "@/components/ui/button";
import { Board, type BriefOption, type Member, type Task } from "@/components/board/board";

export const dynamic = "force-dynamic";

/**
 * A CARD is one sheet row — one unit of work, one set of people, one status.
 * Its Tamaño × Plataforma files are counted inside it, never split into cards.
 */
type BoardData = { tasks: Task[]; members: Member[]; briefs: BriefOption[] };

async function loadBoard(clienteSlug: string): Promise<BoardData | null> {
  if (!hasSupabase()) return null;
  const db = supabaseAdmin();

  const { data: client } = await db
    .from("clients")
    .select("id")
    .eq("slug", clienteSlug)
    .maybeSingle();

  const empty: BoardData = { tasks: [], members: [], briefs: [] };
  if (!client) return empty;

  // board_tasks already carries the people and the file count (migration 0008),
  // so the board is one query instead of one-per-card.
  const [{ data: tasks }, { data: members }, { data: briefs }] = await Promise.all([
    db
      .from("board_tasks")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: true })
      .limit(500)
      .returns<Task[]>(),
    db
      .from("track_members")
      .select("id, name, color, track")
      .eq("active", true)
      .order("track")
      .order("sort_order")
      .returns<Member[]>(),
    db
      .from("briefs")
      .select("id, title, source_tab")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .returns<{ id: string; title: string | null; source_tab: string | null }[]>(),
  ]);

  return {
    tasks: tasks ?? [],
    members: members ?? [],
    briefs: (briefs ?? []).map((b) => ({ id: b.id, title: b.title, tab: b.source_tab })),
  };
}

export default async function TableroPage({
  params,
}: {
  params: Promise<{ cliente: string }>;
}) {
  const { cliente } = await params;
  const [role, soy] = await Promise.all([getViewAs(), getSoy()]);

  // Quitar la entrada del menú no basta: la URL sigue siendo tecleable, y una
  // vista previa que se salta escribiendo la ruta no prueba nada.
  if (!canSee(role, "tablero")) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
        <Lock className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-3 text-sm text-foreground">
          Un {ROLE_LABEL[role]} no entra al tablero de producción.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Estás en una vista previa. Vuelve a tu rol en la franja de arriba.
        </p>
      </div>
    );
  }

  const data = await loadBoard(cliente);
  const totalFiles = (data?.tasks ?? []).reduce((n, t) => n + t.file_count, 0);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            {cliente} · Tablero
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-foreground">Producción</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {data === null
            ? "Base de datos no configurada"
            : `${data.tasks.length} tarea${data.tasks.length === 1 ? "" : "s"} · ${totalFiles} archivos`}
        </p>
      </div>

      {data !== null && data.tasks.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Todavía no hay tareas. Trae un proyecto del Google Sheet para empezar.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={`/${cliente}/sync`}>
              <RefreshCw className="size-4" /> Sincronizar
            </Link>
          </Button>
        </div>
      ) : (
        <Board
          cliente={cliente}
          tasks={data?.tasks ?? []}
          members={data?.members ?? []}
          briefs={data?.briefs ?? []}
          role={role}
          soyId={soy?.id ?? null}
        />
      )}
    </div>
  );
}

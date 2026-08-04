import Link from "next/link";
import { RefreshCw, Files } from "lucide-react";
import { KANBAN_STATUSES, STATUS_LABEL, STATUS_TOKEN, type AssetStatus } from "@/lib/brand";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { Button } from "@/components/ui/button";

/**
 * A CARD is one sheet row — one unit of work, one assignee, one status.
 * Its Tamaño × Plataforma files are listed inside it, not as separate cards.
 */
type Task = {
  id: string;
  code: string | null;
  status: AssetStatus;
  track: "real" | "normal";
  naming_base: string | null;
  concepto: string | null;
  tipo_asset: string | null;
  formato_code: string | null;
  duracion: string | null;
  tamanos: string[] | null;
  plataformas: string[] | null;
  fileCount: number;
};

async function loadTasks(clienteSlug: string): Promise<Task[] | null> {
  if (!hasSupabase()) return null;
  const db = supabaseAdmin();

  const { data: client } = await db
    .from("clients").select("id").eq("slug", clienteSlug).maybeSingle();
  if (!client) return [];

  const { data: briefs } = await db
    .from("briefs").select("id").eq("client_id", client.id);
  const briefIds = (briefs ?? []).map((b) => b.id);
  if (!briefIds.length) return [];

  const { data: ideas } = await db
    .from("ideas")
    .select("id, code, status, track, naming_base, concepto, tipo_asset, formato_code, duracion, tamanos, plataformas")
    .in("brief_id", briefIds)
    .order("created_at", { ascending: true })
    .limit(500);

  // one query for all file counts, then group in memory
  const { data: assets } = await db
    .from("assets").select("idea_id").in("brief_id", briefIds).limit(5000);
  const counts = new Map<string, number>();
  for (const a of assets ?? []) counts.set(a.idea_id, (counts.get(a.idea_id) ?? 0) + 1);

  return (ideas ?? []).map((i) => ({
    ...i,
    fileCount: counts.get(i.id) ?? 0,
  })) as Task[];
}

export default async function TableroPage({
  params,
}: {
  params: Promise<{ cliente: string }>;
}) {
  const { cliente } = await params;
  const tasks = await loadTasks(cliente);
  const totalFiles = (tasks ?? []).reduce((n, t) => n + t.fileCount, 0);

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
          {tasks === null
            ? "Base de datos no configurada"
            : `${tasks.length} tarea${tasks.length === 1 ? "" : "s"} · ${totalFiles} archivos`}
        </p>
      </div>

      {tasks !== null && tasks.length === 0 && (
        <div className="mb-5 flex flex-col items-center rounded-xl border border-dashed border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Todavía no hay tareas. Trae un proyecto del Google Sheet para empezar.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={`/${cliente}/sync`}>
              <RefreshCw className="size-4" /> Sincronizar
            </Link>
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:overflow-x-auto lg:pb-2">
        {KANBAN_STATUSES.map((status) => {
          const token = STATUS_TOKEN[status];
          const items = (tasks ?? []).filter((t) => t.status === status);
          return (
            <div key={status} className="w-full lg:w-72 lg:shrink-0">
              <div
                className="flex items-center justify-between rounded-t-lg border-t-[3px] px-3 py-2"
                style={{
                  borderColor: `var(--status-${token})`,
                  backgroundColor: `color-mix(in srgb, var(--status-${token}) 8%, var(--card))`,
                }}
              >
                <span className="text-sm font-semibold" style={{ color: `var(--status-${token})` }}>
                  {STATUS_LABEL[status]}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                  style={{ backgroundColor: `var(--status-${token})` }}
                >
                  {items.length}
                </span>
              </div>

              <div className="min-h-[120px] space-y-2 rounded-b-lg border border-t-0 border-border bg-secondary/25 p-2">
                {items.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">Sin tarjetas</p>
                ) : (
                  items.map((t) => (
                    <article
                      key={t.id}
                      className="rounded-lg border border-border bg-card p-2.5 shadow-[0_1px_2px_rgba(45,43,85,0.04)]"
                    >
                      <div className="flex items-center gap-1.5">
                        {t.code && (
                          <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-secondary-foreground">
                            {t.code}
                          </span>
                        )}
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
                          style={{
                            color: `var(--type-${t.track === "real" ? "real" : "normal"})`,
                            backgroundColor: `color-mix(in srgb, var(--type-${t.track === "real" ? "real" : "normal"}) 12%, transparent)`,
                          }}
                        >
                          {t.track}
                        </span>
                        {/* the files this ONE task delivers */}
                        <span
                          className="ml-auto flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground"
                          title={`${(t.tamanos ?? []).join(", ")} × ${(t.plataformas ?? []).join(", ")}`}
                        >
                          <Files className="size-2.5" />
                          {t.fileCount}
                        </span>
                      </div>

                      <p className="mt-1.5 font-mono text-[11px] font-semibold text-foreground">
                        {t.naming_base ?? "—"}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
                        {t.concepto ?? "Sin concepto"}
                      </p>

                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {t.tipo_asset && (
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                            {t.tipo_asset}
                          </span>
                        )}
                        {t.formato_code && (
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                            {t.formato_code}
                          </span>
                        )}
                        {t.duracion && (
                          <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-secondary-foreground">
                            {t.duracion}
                          </span>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

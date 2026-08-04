"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw, Check, AlertTriangle, FileWarning, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  listProjects,
  previewProjects,
  type ProjectPreview,
} from "@/app/(app)/[cliente]/sync/actions";
import type { SheetRow, TabInfo } from "@/lib/sheet-sync";
import { StagedCard } from "./staged-card";
import { importRows, knownRows } from "@/app/(app)/[cliente]/sync/import";

export function SyncPanel({ cliente }: { cliente: string }) {
  const [tabs, setTabs] = useState<TabInfo[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [previews, setPreviews] = useState<ProjectPreview[] | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  // Per-row corrections the lead makes before approving. Persisted to
  // staged_rows.edited once Supabase is wired; the sheet is never touched.
  const [edits, setEdits] = useState<Record<string, Partial<SheetRow>>>({});

  const editField = (key: string, field: keyof SheetRow, value: string) =>
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));

  const resetField = (key: string, field: keyof SheetRow) =>
    setEdits((prev) => {
      const row = { ...prev[key] };
      delete row[field];
      const next = { ...prev };
      if (Object.keys(row).length === 0) delete next[key];
      else next[key] = row;
      return next;
    });
  const [loadingTabs, startList] = useTransition();
  const [syncing, startSync] = useTransition();
  const [creating, startCreate] = useTransition();

  // Load the tab list on mount; preselect the two newest projects.
  useEffect(() => {
    startList(async () => {
      const res = await listProjects();
      setTabs(res.tabs);
      setListError(res.error ?? null);
      const newest = res.tabs.filter((t) => t.kind === "project").slice(0, 2);
      setChosen(new Set(newest.map((t) => t.name)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projects = tabs?.filter((t) => t.kind === "project") ?? [];
  const unrecognized = tabs?.filter((t) => t.kind === "unrecognized") ?? [];
  const excluded = tabs?.filter((t) => t.kind === "template" || t.kind === "control") ?? [];

  const run = () =>
    startSync(async () => {
      const picked = projects.filter((p) => chosen.has(p.name));
      const known = await knownRows(cliente);
      const res = await previewProjects(picked, known);
      setPreviews(res);
      const fresh = new Set<string>();
      res.forEach((p) => p.rows.filter((r) => r.status !== "unchanged").forEach((r) => fresh.add(r.key)));
      setAccepted(fresh);

      const total = res.reduce((n, p) => n + p.nuevas + p.actualizadas, 0);
      const failed = res.filter((p) => p.error);
      if (failed.length) toast.error(`${failed.length} proyecto(s) con error`);
      else if (total === 0) toast.success("Todo al día — no hay nada nuevo");
      else toast.success(`${total} tarea(s) por revisar`);
    });

  const doImport = () =>
    startCreate(async () => {
      const chosenRows = importable
        .filter((r) => accepted.has(r.key))
        .map((r) => ({
          key: r.key,
          hash: r.hash,
          rowNumber: r.rowNumber,
          tab: r.tab,
          data: r.data,
          edited: edits[r.key],
        }));

      const result = await importRows(cliente, chosenRows);
      if (result.errors.length) {
        toast.error(`${result.created} creadas, ${result.errors.length} con error`, {
          description: result.errors.slice(0, 2).join(" · "),
        });
      } else {
        toast.success(`${result.created} tareas · ${result.assets} entregables`, {
          description: "Ya están en el tablero.",
        });
      }
      // drop what was imported from the review list
      setPreviews((prev) =>
        prev?.map((p) => ({
          ...p,
          rows: p.rows.filter((r) => !accepted.has(r.key)),
        })) ?? null,
      );
      setAccepted(new Set());
    });

  const importable =
    previews?.flatMap((p) =>
      p.rows
        .filter((r) => r.status !== "unchanged")
        .map((r) => ({ ...r, tab: p.name, label: p.label, track: p.track })),
    ) ?? [];

  return (
    <div className="space-y-5">
      {/* 1 — pick projects */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            1 · ¿Qué proyectos quieres traer?
          </h3>
          {projects.length > 0 && (
            <div className="flex gap-2 text-xs">
              <button className="text-primary hover:underline" onClick={() => setChosen(new Set(projects.map((p) => p.name)))}>
                Todos
              </button>
              <span className="text-muted-foreground">·</span>
              <button className="text-muted-foreground hover:underline" onClick={() => setChosen(new Set())}>
                Ninguno
              </button>
            </div>
          )}
        </div>

        {loadingTabs && <p className="text-sm text-muted-foreground">Leyendo la hoja…</p>}

        {listError && (
          <p className="flex items-start gap-2 rounded-lg border border-status-corrections/30 bg-status-corrections/5 p-3 text-sm text-status-corrections">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {listError}
          </p>
        )}

        {!loadingTabs && !listError && (
          <>
            <ul className="space-y-1.5">
              {projects.map((p) => {
                const on = chosen.has(p.name);
                return (
                  <li key={p.name}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setChosen((prev) => {
                          const next = new Set(prev);
                          next.has(p.name) ? next.delete(p.name) : next.add(p.name);
                          return next;
                        })
                      }
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                        on ? "border-primary bg-primary/5" : "border-input hover:border-primary",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                        )}
                      >
                        {on && <Check className="size-3" />}
                      </span>
                      <span className="font-medium text-foreground">{p.label}</span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "uppercase text-[10px]",
                          p.track === "real" ? "bg-type-real/15 text-type-real" : "bg-type-normal/15 text-type-normal",
                        )}
                      >
                        {p.track}
                      </Badge>
                      <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">
                        {p.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {projects.length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No se encontraron proyectos con el formato esperado.
              </p>
            )}

            {/* Naming mistakes must be visible, not silently skipped */}
            {unrecognized.length > 0 && (
              <div className="mt-4 rounded-lg border border-status-progress/30 bg-status-progress/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-status-progress">
                  <FileWarning className="size-3.5" />
                  {unrecognized.length} pestaña(s) con nombre fuera de convención
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  No se pueden traer hasta que se renombren como{" "}
                  <span className="font-mono">Real (Card/Préstamos | Brief DD/MM)</span>.
                </p>
                <ul className="mt-2 space-y-0.5">
                  {unrecognized.map((t) => (
                    <li key={t.name} className="truncate font-mono text-[11px] text-muted-foreground">
                      {t.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {excluded.length > 0 && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                Excluidas automáticamente: {excluded.map((t) => t.name).join(" · ")}
              </p>
            )}

            <div className="mt-4 flex items-center gap-3">
              <Button onClick={run} disabled={syncing || chosen.size === 0}>
                <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
                {syncing ? "Buscando…" : `Sincronizar ${chosen.size || ""}`}
              </Button>
              <span className="text-xs text-muted-foreground">
                Solo lee la hoja. Nada se crea hasta que apruebes.
              </span>
            </div>
          </>
        )}
      </section>

      {/* 2 — summary */}
      {previews && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            2 · Lo que encontramos
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {previews.map((p) => (
              <div key={p.name} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Layers className="size-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{p.label}</span>
                  <Badge variant="secondary" className="uppercase text-[10px]">{p.track}</Badge>
                </div>
                {p.error ? (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-status-corrections">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    {p.error}
                  </p>
                ) : (
                  <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    <span className="font-semibold text-status-completed">{p.nuevas} nuevas</span>
                    {p.actualizadas > 0 && (
                      <span className="font-semibold text-status-progress">{p.actualizadas} actualizadas</span>
                    )}
                    <span className="text-muted-foreground">{p.sinCambios} sin cambios</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3 — review */}
      {previews && importable.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              3 · Revisa antes de crear
            </h3>
            <div className="flex gap-2 text-xs">
              <button className="text-primary hover:underline" onClick={() => setAccepted(new Set(importable.map((r) => r.key)))}>
                Seleccionar todo
              </button>
              <span className="text-muted-foreground">·</span>
              <button className="text-muted-foreground hover:underline" onClick={() => setAccepted(new Set())}>
                Ninguno
              </button>
            </div>
          </div>

          <ul className="space-y-2">
            {importable.map((r) => (
              <StagedCard
                key={r.key}
                row={r}
                edits={edits[r.key] ?? {}}
                included={accepted.has(r.key)}
                expanded={open === r.key}
                onToggleIncluded={() =>
                  setAccepted((prev) => {
                    const next = new Set(prev);
                    next.has(r.key) ? next.delete(r.key) : next.add(r.key);
                    return next;
                  })
                }
                onToggleExpanded={() => setOpen(open === r.key ? null : r.key)}
                onEdit={(field, value) => editField(r.key, field, value)}
                onResetField={(field) => resetField(r.key, field)}
              />
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-end gap-3">
            <span className="text-xs text-muted-foreground">
              {accepted.size} de {importable.length} seleccionadas
            </span>
            <Button disabled={accepted.size === 0 || creating} onClick={doImport}>
              {creating
                ? "Creando…"
                : `Crear ${accepted.size} tarea${accepted.size === 1 ? "" : "s"}`}
            </Button>
          </div>
        </section>
      )}

      {previews && importable.length === 0 && !previews.some((p) => p.error) && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Todo al día. No hay filas nuevas ni cambios en los proyectos seleccionados.
        </p>
      )}
    </div>
  );
}

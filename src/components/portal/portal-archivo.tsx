"use client";

import Link from "next/link";
import { ChevronLeft, ArrowRight, CheckCircle2, Archive } from "lucide-react";
import type { ArchivoBrief } from "@/app/(app)/[cliente]/portal/portal-data";

/**
 * Pestaña ARCHIVO del portal — los briefs COMPLETADOS (todas sus piezas aprobadas) hace más de
 * 15 días. Salen del panel de inicio y viven aquí, agrupados por mes de completado, para
 * siempre. Cada uno abre el brief (ya aprobado, read-only). El split (≤15d panel / >15d archivo)
 * usa `estadoBriefPanel` — la MISMA fuente que el panel, así ningún brief se pierde ni duplica.
 */
export function PortalArchivo({
  cliente,
  archivadas,
}: {
  cliente: { name: string; logoUrl: string | null; brandColor: string };
  /** Los briefs archivados (metadata, SIN tareas) — ya filtrados y ordenados (reciente primero)
   *  en cargarPortal. La carga del panel no trae el histórico; esta lista sale del índice. */
  archivadas: ArchivoBrief[];
}) {
  // Agrupar por mes de completado (greenlit_at) — preserva el orden ya ordenado.
  const grupos: { mes: string; items: ArchivoBrief[] }[] = [];
  for (const b of archivadas) {
    const mes = mesLabel(b.greenlitAt);
    const g = grupos.at(-1);
    if (g && g.mes === mes) g.items.push(b);
    else grupos.push({ mes, items: [b] });
  }

  return (
    <div className="mx-auto max-w-3xl px-1">
      <header className="mb-6 flex items-center gap-3 gl-rise-in">
        <Link
          href="?"
          aria-label="Volver al inicio"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:border-primary/40 hover:bg-secondary"
        >
          <ChevronLeft className="size-4" />
        </Link>
        <div>
          <p className="gl-eyebrow">{cliente.name}</p>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <Archive className="size-5 text-muted-foreground" /> Archivo
          </h1>
        </div>
      </header>

      {archivadas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Archive className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Aún no hay briefs archivados. Un brief completado pasa aquí a los 15 días.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map((g) => (
            <section key={g.mes}>
              <h2 className="mb-2 px-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{g.mes}</h2>
              <ul className="space-y-2">
                {g.items.map((b) => (
                  <ArchivoRow key={b.id} brief={b} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── módulo-nivel (react-hooks/static-components) ── */

function mesLabel(iso: string | null): string {
  if (!iso) return "Sin fecha";
  const s = new Date(iso).toLocaleDateString("es", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fechaCorta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function ArchivoRow({ brief }: { brief: ArchivoBrief }) {
  const n = brief.nTareas;
  return (
    <li>
      <Link
        href={`?brief=${brief.id}`}
        className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-colors hover:border-primary/40 hover:bg-secondary/40"
      >
        <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--status-completed)" }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-foreground">{brief.label}</span>
          <span className="block text-xs text-muted-foreground">
            {n} {n === 1 ? "pieza" : "piezas"} · completado {fechaCorta(brief.greenlitAt)}
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </Link>
    </li>
  );
}

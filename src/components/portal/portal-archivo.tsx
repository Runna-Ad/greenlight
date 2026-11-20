"use client";

import Link from "next/link";
import { ChevronLeft, ArrowRight, CheckCircle2, Archive, FolderOpen, ExternalLink, Package } from "lucide-react";
import type { ArchivoBrief, ArchivoPaquete } from "@/app/(app)/[cliente]/portal/portal-data";
import { esNovedad } from "@/lib/archivo-novedad";

/**
 * Pestaña ARCHIVO del portal (Pedro 2026-11-19): cada paquete APROBADO (todas sus piezas
 * Greenlit) desde el día en que se cerró, por mes, con su carpeta de Google Drive para que
 * el cliente revise que sus archivos estén, en orden y bien nombrados. La carpeta llega
 * después, cuando el equipo la pega; mientras, dice «Carpeta en preparación».
 * Abajo, los briefs viejos SIN paquetes (de antes de los paquetes), como antes: >15 días.
 */
export function PortalArchivo({
  cliente,
  paquetes,
  archivadas,
  vistoAt = undefined,
}: {
  cliente: { name: string; logoUrl: string | null; brandColor: string };
  /** Los paquetes Greenlit, ya ordenados (reciente primero) en cargarArchivoPaquetes. */
  paquetes: ArchivoPaquete[];
  /** Briefs archivados que no tienen paquetes (metadata, SIN tareas). */
  archivadas: ArchivoBrief[];
  /** Su visita anterior al Archivo (0101), para marcar «Nuevo». `undefined` = no es el
   *  cliente quien mira (el Master): sin etiquetas. */
  vistoAt?: string | null;
}) {
  const grupos: { mes: string; items: ArchivoPaquete[] }[] = [];
  for (const p of paquetes) {
    const mes = mesLabel(`${p.entregadoEl}T12:00:00Z`);
    const g = grupos.at(-1);
    if (g && g.mes === mes) g.items.push(p);
    else grupos.push({ mes, items: [p] });
  }
  const vacio = paquetes.length === 0 && archivadas.length === 0;

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
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Tus paquetes aprobados. Abre la carpeta de cada uno para revisar que estén todos tus archivos.
          </p>
        </div>
      </header>

      {vacio ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Archive className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Aún no hay paquetes aprobados. Un paquete llega aquí cuando apruebas todas sus piezas.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map((g) => (
            <section key={g.mes}>
              <h2 className="mb-2 px-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{g.mes}</h2>
              <ul className="space-y-2">
                {g.items.map((p) => (
                  <PaqueteRow key={p.id} p={p} nuevo={vistoAt !== undefined && esNovedad(p.novedadAt, vistoAt)} />
                ))}
              </ul>
            </section>
          ))}
          {archivadas.length > 0 && (
            <section>
              <h2 className="mb-2 px-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Briefs anteriores</h2>
              <ul className="space-y-2">
                {archivadas.map((b) => (
                  <ArchivoRow key={b.id} brief={b} />
                ))}
              </ul>
            </section>
          )}
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

function PaqueteRow({ p, nuevo }: { p: ArchivoPaquete; nuevo: boolean }) {
  return (
    <li className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--status-completed)" }} />
        <Link href={`?brief=${p.unidad}`} className="group min-w-0 flex-1 basis-48">
          <span className="flex items-center gap-1.5 truncate font-semibold text-foreground group-hover:text-primary">
            <Package className="size-3.5 shrink-0 text-muted-foreground" /> {p.nombre}
            {nuevo && (
              <span className="shrink-0 rounded-full bg-[#e5484d] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white">
                Nuevo
              </span>
            )}
          </span>
          <span className="block text-xs text-muted-foreground">{p.briefLabel} · {p.lineaIdeas}</span>
          <span className="block text-xs text-muted-foreground">{p.lineaPiezas}</span>
          {p.nota && <span className="block text-xs text-muted-foreground">{p.nota}</span>}
        </Link>
        {p.driveUrl ? (
          <a
            href={p.driveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <FolderOpen className="size-3.5" /> Abrir carpeta en Drive <ExternalLink className="size-3" />
          </a>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground">
            <FolderOpen className="size-3.5" /> Carpeta en preparación
          </span>
        )}
      </div>
    </li>
  );
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
            {n} {n === 1 ? "idea" : "ideas"} · completado {fechaCorta(brief.greenlitAt)}
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </Link>
    </li>
  );
}

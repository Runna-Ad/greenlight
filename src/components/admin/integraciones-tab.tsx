"use client";

import { FileSpreadsheet, KeyRound, BookText, CheckCircle2, XCircle } from "lucide-react";
import type { IntegracionesEstado } from "@/lib/admin-tipos";

function fecha(iso: string | null): string {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function IntegracionesTab({ estado }: { estado: IntegracionesEstado }) {
  return (
    <div className="space-y-4">
      {/* Google Sheets */}
      <section className="gl-card rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="size-4 text-primary" />
          <h3 className="font-medium text-foreground">Google Sheets</h3>
          <Pill on={estado.sheetConfigurado} onLabel="Conectado" offLabel="Sin conectar" />
        </div>
        <dl className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
          <Dato label="Última sincronización" valor={fecha(estado.ultimaSync)} />
          <Dato label="Tareas importadas" valor={String(estado.tareasImportadas)} />
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          La sincronización se hace desde <strong>Sincronizar</strong> en cada cliente.
        </p>
      </section>

      {/* Rotación del secreto */}
      <section className="rounded-xl border border-status-corrections/40 bg-[color-mix(in_srgb,var(--status-corrections)_6%,transparent)] p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-status-corrections" />
          <h3 className="font-medium text-foreground">Secreto del Sheet — pendiente de rotar</h3>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          El <code className="rounded bg-secondary px-1 text-xs">SHEETS_SCRIPT_SECRET</code> estuvo
          expuesto ~4 min y no se ha rotado. Rotarlo es manual, en dos lados:
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Apps Script → <em>Configuración del proyecto ▸ Propiedades del script</em> → nuevo valor de <code className="rounded bg-secondary px-1 text-xs">GREENLIGHT_SECRET</code>.</li>
          <li>Vercel → <em>Environment Variables</em> → mismo valor en <code className="rounded bg-secondary px-1 text-xs">SHEETS_SCRIPT_SECRET</code>, y re-deploy.</li>
        </ol>
      </section>

      {/* Notion */}
      <section className="gl-card rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <BookText className="size-4 text-muted-foreground" />
          <h3 className="font-medium text-foreground">Notion — Biblioteca central</h3>
          <Pill on={estado.notionConfigurado} onLabel="Conectado" offLabel="Sin conectar" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Espejo de la biblioteca de legales/selling points desde Notion. Pendiente del token de
          integración + el ID de la base (F6).
        </p>
      </section>
    </div>
  );
}

function Pill({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return (
    <span
      className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        on ? "bg-status-completed/10 text-status-completed" : "bg-secondary text-muted-foreground"
      }`}
    >
      {on ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
      {on ? onLabel : offLabel}
    </span>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{valor}</dd>
    </div>
  );
}

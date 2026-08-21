"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, KeyRound, BookText, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { IntegracionesEstado } from "@/lib/admin-tipos";
import { sincronizarLegales } from "@/app/(app)/admin/legales-actions";

function fecha(iso: string | null): string {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function IntegracionesTab({ estado }: { estado: IntegracionesEstado }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const sync = () =>
    start(async () => {
      const r = await sincronizarLegales();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const partes = [`${r.nuevos} nuevos`, `${r.actualizados} actualizados`];
      if (r.desactivados) partes.push(`${r.desactivados} desactivados`);
      toast.success(`Legales sincronizados — ${partes.join(" · ")}`);
      if (r.sinMarca.length) {
        toast.warning(`${r.sinMarca.length} sin marca reconocible: ${r.sinMarca.join("; ")}`);
      }
      router.refresh();
    });

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

      {/* Notion — Legales */}
      <section className="gl-card rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <BookText className="size-4 text-muted-foreground" />
          <h3 className="font-medium text-foreground">Notion — Legales</h3>
          <Pill on={estado.notionConfigurado} onLabel="Conectado" offLabel="Sin conectar" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Notion es la fuente de verdad de los legales. Sincroniza para traer los últimos a la
          Biblioteca, etiquetados por marca (Card / Préstamos). Los legales creados a mano no se tocan.
        </p>
        <div className="mt-3 flex items-center gap-3 border-t border-border pt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!estado.notionConfigurado || pend}
            onClick={sync}
            className="gap-1.5"
          >
            <RefreshCw className={cn("size-3.5", pend && "animate-spin")} />
            {pend ? "Sincronizando…" : "Sincronizar"}
          </Button>
          {!estado.notionConfigurado && (
            <span className="text-[11px] text-muted-foreground">Falta NOTION_TOKEN en el entorno.</span>
          )}
        </div>
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

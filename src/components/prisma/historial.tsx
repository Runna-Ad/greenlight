"use client";

import { Clock, ImageIcon, Loader2 } from "lucide-react";
import { JOB_LABEL, TOOL_LABEL, UI, tx, type Lang } from "@/lib/prisma/copy";
import type { JobType, Tool } from "@/lib/prisma/spec";
import { JOB_KIND } from "@/lib/prisma/spec";

/** Lo que el servidor manda al rail (ya firmado y recortado). */
export type ItemHistorialUI = {
  specId: string;
  job: JobType;
  tool: Tool;
  idea: string;
  thumb: string | null;
  fecha: string; // ISO
  valido: boolean | null;
};

export function Historial({ items, lang, onAbrir, abriendo }: { items: ItemHistorialUI[]; lang: Lang; onAbrir: (specId: string) => void; abriendo: string | null }) {
  return (
    <aside className="rounded-xl border border-border bg-card p-3" aria-label={tx(UI.historial, lang)}>
      <p className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Clock className="size-3.5" /> {tx(UI.historial, lang)}
      </p>
      {items.length === 0 ? (
        <p className="mt-3 px-1 text-xs text-muted-foreground">{tx(UI.sinHistorial, lang)}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((it) => (
            <li key={it.specId}>
              <button
                type="button"
                onClick={() => onAbrir(it.specId)}
                disabled={abriendo !== null}
                aria-busy={abriendo === it.specId}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary disabled:cursor-wait disabled:opacity-70"
              >
                {abriendo === it.specId ? (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                  </span>
                ) : it.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.thumb} alt="" className="size-9 shrink-0 rounded-md object-cover" />
                ) : (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                    <ImageIcon className="size-4" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm text-foreground">{it.idea || tx(JOB_LABEL[it.job], lang)}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {tx(JOB_LABEL[it.job], lang)} · {tx(TOOL_LABEL[it.tool], lang)} · {JOB_KIND[it.job]}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

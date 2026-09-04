"use client";

import { useState } from "react";
import { ImagePlus, Loader2, X, Eye } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { analizarImagen, type RefEntrada } from "@/app/(app)/prisma/actions";
import { REF_LABEL, UI, tx, type Lang } from "@/lib/prisma/copy";
import type { RefRole } from "@/lib/prisma/spec";

/** Una referencia ya subida y leída, con su URL firmada para el thumbnail. */
export type RefLocal = RefEntrada & { url: string; aviso: string | null };

/**
 * Un slot de referencia: arrastrar/elegir → sube → H.Ü.E la lee (caption + ADN).
 * Muestra el thumbnail y, debajo, lo que H.Ü.E entendió, para que el diseñador
 * vea que la máquina "vio" lo correcto antes de generar.
 */
export function RefUploader({
  role,
  opcional,
  value,
  onChange,
  lang,
}: {
  role: RefRole;
  opcional?: boolean;
  value: RefLocal | null;
  onChange: (v: RefLocal | null) => void;
  lang: Lang;
}) {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [flash, setFlash] = useState(false); // destello al recibir la imagen (se apaga solo)

  const subir = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await analizarImagen(form);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      onChange({ role, storage_path: r.storage_path, caption: r.caption, dna: r.dna, url: r.url, aviso: r.aviso });
      setFlash(true);
      if (r.aviso) toast.message(lang === "es" ? "La imagen subió, pero H.Ü.E no pudo leerla." : "Image uploaded, but H.Ü.E could not read it.");
    } finally {
      setBusy(false);
    }
  };

  const label = tx(REF_LABEL[role], lang);

  // Sólo hex reales se pintan como muestra: el ADN también puede traer nombres ("warm beige").
  const swatches = (value?.dna?.paleta ?? []).filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 5);

  if (value) {
    return (
      <div className={cn("p-enter rounded-xl border border-border bg-card p-3", flash && "p-drop-flash")} onAnimationEnd={() => setFlash(false)}>
        <div className="flex items-start gap-3">
          {/* Thumbnail firmado (bucket privado). <img> a propósito: URL firmada, tamaño libre. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value.url} alt={value.caption ?? label} className="size-20 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
              <button
                type="button"
                onClick={() => onChange(null)}
                aria-label={`${tx(UI.quitar, lang)} ${label}`}
                className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            {value.caption ? (
              <p className="mt-1 flex items-start gap-1.5 text-sm text-foreground">
                <Eye className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>{value.caption}</span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">{value.aviso ?? "—"}</p>
            )}
            {value.dna && (
              <p className="mt-1 text-xs text-muted-foreground">
                {value.dna.luz}
                {value.dna.lente ? ` · ${value.dna.lente}` : ""}
                {value.dna.mood ? ` · ${value.dna.mood}` : ""}
              </p>
            )}
            {swatches.length > 0 && (
              <ul className="mt-2 flex items-center gap-1.5" aria-label={lang === "es" ? "Paleta de la referencia" : "Reference palette"}>
                {swatches.map((c) => (
                  <li key={c} className="p-swatch" style={{ backgroundColor: c }} title={c} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  // <label>, no <button>: un input (aunque sea sr-only) dentro de un botón es HTML
  // inválido (interactivo anidado). El label abre el selector al click y el input
  // sigue siendo enfocable por teclado; el anillo de foco se pinta en el label.
  return (
    <label
      aria-busy={busy}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void subir(f);
      }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-4 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        over ? "border-primary bg-primary/8" : "border-border bg-card/50 hover:border-primary",
        busy && "cursor-wait opacity-70",
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">
          {label}
          {opcional && <span className="ml-1 text-xs font-normal text-muted-foreground">({lang === "es" ? "opcional" : "optional"})</span>}
        </span>
        <span className="block text-xs text-muted-foreground">{busy ? tx(UI.generando, lang) : tx(UI.subirRef, lang)}</span>
      </span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        aria-label={label}
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void subir(f);
        }}
      />
    </label>
  );
}

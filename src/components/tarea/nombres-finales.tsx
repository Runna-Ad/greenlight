"use client";

import { useState } from "react";
import { ChevronDown, Copy, Check } from "lucide-react";

/**
 * El nombre final. Es lo más importante del intake — el equipo lo copia literal
 * al entregar, y equivocarse ahí rompe la entrega. Por eso va arriba de todo en
 * "Rünna details".
 *
 * Una tarea entrega VARIOS archivos (uno por Tamaño × Plataforma): se muestra el
 * primero con su leyenda y los demás se despliegan. Salen calculados por la BD
 * (trigger build_filename), no se escriben a mano.
 */
export function NombresFinales({ filenames }: { filenames: string[] }) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  const copiar = (f: string) => {
    void navigator.clipboard?.writeText(f);
    setCopiado(f);
    setTimeout(() => setCopiado(null), 1500);
  };

  return (
    <div>
      <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
        Nombres de archivos
      </p>

      {!filenames.length ? (
        <p className="text-[11px] text-muted-foreground/70">Sin archivos generados todavía</p>
      ) : (
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => copiar(filenames[0])}
              title="Copiar"
              className="group inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-tight text-foreground hover:text-primary"
            >
              {filenames[0]}
              {copiado === filenames[0] ? (
                <Check className="size-3 text-status-completed" />
              ) : (
                <Copy className="size-3 opacity-40 transition-opacity group-hover:opacity-70" />
              )}
            </button>
            {filenames.length > 1 && (
              <button
                onClick={() => setAbierto((v) => !v)}
                className="inline-flex items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
              >
                +{filenames.length - 1}
                <ChevronDown className={`size-3 transition-transform ${abierto ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>

          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground/70">
            topic _ format _ duration _ gender _ kvfocus _ filetype _ idea# _ rrss _ v# _ monthyy _ rn
          </p>

          {abierto && (
            <ul className="mt-2 space-y-0.5 border-t border-border/60 pt-2">
              {filenames.slice(1).map((f) => (
                <li key={f}>
                  <button
                    onClick={() => copiar(f)}
                    className="group flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left font-mono text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    {f}
                    {copiado === f ? (
                      <Check className="size-2.5 shrink-0 text-status-completed" />
                    ) : (
                      <Copy className="size-2.5 shrink-0 opacity-0 group-hover:opacity-60" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

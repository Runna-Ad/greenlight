"use client";

import { useState } from "react";
import { ChevronDown, Copy, Check, Copy as CopyAll } from "lucide-react";

/**
 * El nombre final. Es lo más importante del intake — el equipo lo copia literal
 * al entregar, y equivocarse ahí rompe la entrega.
 *
 * Una tarea entrega VARIOS archivos (uno por Tamaño × Plataforma): se muestra el
 * primero con su leyenda y los demás se despliegan. Salen calculados por la BD
 * (trigger build_filename), no se escriben a mano.
 *
 * Se puede copiar uno por uno (clic en el nombre) o TODOS de una vez ("Copiar
 * todos"). Los nombres son largos: cada uno se trunca dentro de su caja (nombre
 * completo en el tooltip y al copiar) para que NUNCA se salgan en pantallas
 * chicas — el ícono de copiar queda siempre a la vista.
 */
export function NombresFinales({ filenames }: { filenames: string[] }) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  const copiar = (f: string, clave = f) => {
    void navigator.clipboard?.writeText(f);
    setCopiado(clave);
    setTimeout(() => setCopiado(null), 1500);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
          Nombres de archivos
        </p>
        {filenames.length > 0 && (
          <button
            onClick={() => copiar(filenames.join("\n"), "__todos__")}
            title="Copiar todos los nombres"
            className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-primary hover:opacity-80"
          >
            {copiado === "__todos__" ? (
              <>
                <Check className="size-3" /> Copiados
              </>
            ) : (
              <>
                <CopyAll className="size-3" /> Copiar todos
              </>
            )}
          </button>
        )}
      </div>

      {!filenames.length ? (
        <p className="text-[11px] text-muted-foreground/70">Sin archivos generados todavía</p>
      ) : (
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <FilaNombre
            f={filenames[0]}
            destacado
            copiado={copiado === filenames[0]}
            onCopiar={() => copiar(filenames[0])}
          />
          {filenames.length > 1 && (
            <button
              onClick={() => setAbierto((v) => !v)}
              className="mt-1 inline-flex items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
            >
              +{filenames.length - 1}
              <ChevronDown className={`size-3 transition-transform ${abierto ? "rotate-180" : ""}`} />
            </button>
          )}

          <p className="mt-1 font-mono text-[9px] uppercase tracking-wide text-muted-foreground/70">
            topic _ format _ duration _ gender _ kvfocus _ filetype _ idea# _ rrss _ v# _ monthyy _ rn
          </p>

          {abierto && (
            <ul className="mt-2 space-y-0.5 border-t border-border/60 pt-2">
              {filenames.slice(1).map((f) => (
                <li key={f}>
                  <FilaNombre f={f} copiado={copiado === f} onCopiar={() => copiar(f)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Una fila de nombre: el nombre TRUNCADO (nunca se sale) + botón de copiar fijo. */
function FilaNombre({
  f,
  destacado,
  copiado,
  onCopiar,
}: {
  f: string;
  destacado?: boolean;
  copiado: boolean;
  onCopiar: () => void;
}) {
  return (
    <button
      onClick={onCopiar}
      title={f}
      className={`group flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-secondary ${
        destacado ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <span className={`min-w-0 flex-1 truncate font-mono ${destacado ? "text-[11px] tracking-tight" : "text-[10px]"}`}>
        {f}
      </span>
      {copiado ? (
        <Check className={`shrink-0 text-status-completed ${destacado ? "size-3" : "size-2.5"}`} />
      ) : (
        <Copy
          className={`shrink-0 opacity-40 transition-opacity group-hover:opacity-70 ${
            destacado ? "size-3" : "size-2.5"
          }`}
        />
      )}
    </button>
  );
}

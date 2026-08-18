"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { guardarDuraciones } from "@/app/(app)/[cliente]/tareas/[id]/actions";
import { DURACION as SUGERENCIAS } from "@/lib/vocab";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/**
 * Las DURACIONES como pastillas editables. Cada pastilla es un rango (o un valor
 * suelto como "45s") y cada una despliega su propio juego de archivos
 * (tamaño × plataforma × duración). El botón "Agregar" abre un combobox: se
 * ELIGE de las sugerencias (10-15s, 20-30s…) O se ESCRIBE un número libre (45s)
 * — lo escrito aparece como "Agregar «45s»". Guardar reconcilia los entregables
 * (guardarDuraciones) y refresca para que "Nombre de archivos" tome los nuevos
 * nombres. De sólo lectura muestra las pastillas sin controles.
 */
export function CampoDuraciones({
  ideaId,
  valorInicial,
  soloLectura,
}: {
  ideaId: string;
  valorInicial: string[];
  soloLectura?: boolean;
}) {
  const router = useRouter();
  const [durs, setDurs] = useState<string[]>(valorInicial);
  const [query, setQuery] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [pending, start] = useTransition();

  const guardar = (next: string[]) =>
    start(async () => {
      const prev = durs;
      setDurs(next); // optimista
      const res = await guardarDuraciones(ideaId, next);
      if (!res.ok) {
        setDurs(prev); // revertir
        toast.error(res.error);
      } else {
        // Refrescar para que "Nombre de archivos" tome los nombres recalculados.
        router.refresh();
      }
    });

  const yaEsta = (v: string) => durs.some((d) => d.toLowerCase() === v.toLowerCase());

  const agregar = (v: string) => {
    const t = v.trim();
    setQuery("");
    setAbierto(false);
    if (!t || yaEsta(t)) return;
    guardar([...durs, t]);
  };
  const quitar = (d: string) => guardar(durs.filter((x) => x !== d));

  if (soloLectura) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {durs.length ? (
          durs.map((d) => (
            <span
              key={d}
              className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-[12px] font-medium text-secondary-foreground"
            >
              {d}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted-foreground/70">—</span>
        )}
      </div>
    );
  }

  // Sugerencias que faltan por agregar, filtradas por lo que se escribe.
  const q = query.trim().toLowerCase();
  const disponibles = SUGERENCIAS.filter((s) => !yaEsta(s)).filter((s) =>
    s.toLowerCase().includes(q),
  );
  // "Agregar «45s»": sólo cuando hay texto que no es ya una pastilla ni coincide
  // exactamente con una sugerencia (para no duplicar la opción de la lista).
  const puedeCrear =
    query.trim().length > 0 &&
    !yaEsta(query) &&
    !SUGERENCIAS.some((s) => s.toLowerCase() === q);

  return (
    <div className="space-y-2">
      {durs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {durs.map((d) => (
            <span
              key={d}
              className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pl-3 pr-1.5 text-[12px] font-medium text-secondary-foreground"
            >
              {d}
              <button
                type="button"
                onClick={() => quitar(d)}
                disabled={pending}
                aria-label={`Quitar ${d}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-status-corrections disabled:opacity-50"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <Popover open={abierto} onOpenChange={setAbierto}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
          >
            <Plus className="size-3.5" /> Agregar duración
            <ChevronDown className="size-3.5 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Elige o escribe (p. ej. 45s)…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {!puedeCrear && disponibles.length === 0 && (
                <CommandEmpty>Sin sugerencias.</CommandEmpty>
              )}
              {disponibles.length > 0 && (
                <CommandGroup heading="Sugerencias">
                  {disponibles.map((s) => (
                    <CommandItem key={s} value={s} onSelect={() => agregar(s)}>
                      {s}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {puedeCrear && (
                <CommandGroup heading="Escribir">
                  <CommandItem value={`__crear__${query}`} onSelect={() => agregar(query)}>
                    <Plus className="mr-1 size-3.5" /> Agregar «{query.trim()}»
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, LayoutGrid, Loader2 } from "lucide-react";
import { buscar, type ResultadoBusqueda } from "@/app/(app)/buscar-actions";

/**
 * Buscador global del topbar. Antes era un input muerto (placeholder, sin handler).
 * Ahora consulta `buscar` (acotado por identidad en el servidor) con debounce y
 * muestra un dropdown navegable por teclado. No se muestra al cliente (su topbar no
 * lo necesita) — el llamador lo omite para role="client". (reap 2026-09-02)
 */
export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resultados, setResultados] = useState<ResultadoBusqueda[]>([]);
  const [activo, setActivo] = useState(0);
  const [buscando, start] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  // Debounce 250ms. Cada corrida lleva un número: si vuelve una vieja después de una
  // nueva, se descarta (evita que un resultado tardío pise al reciente).
  useEffect(() => {
    const term = q.trim();
    const id = ++seq.current;
    // Todo el setState vive DENTRO del timeout (asíncrono), no en el cuerpo del
    // efecto — así no dispara renders en cascada al teclear.
    const t = setTimeout(() => {
      if (id !== seq.current) return;
      if (term.length < 2) {
        setResultados([]);
        setAbierto(false);
        return;
      }
      start(async () => {
        const res = await buscar(term);
        if (id !== seq.current) return;
        setResultados(res);
        setActivo(0);
        setAbierto(true);
      });
    }, term.length < 2 ? 0 : 250);
    return () => clearTimeout(t);
  }, [q]);

  // Cerrar al hacer click fuera.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const ir = (r: ResultadoBusqueda) => {
    setAbierto(false);
    setQ("");
    if (r.href !== "#") router.push(r.href);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!abierto || !resultados.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActivo((i) => (i + 1) % resultados.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((i) => (i - 1 + resultados.length) % resultados.length); }
    else if (e.key === "Enter") { e.preventDefault(); ir(resultados[activo]); }
    else if (e.key === "Escape") { setAbierto(false); }
  };

  return (
    <div ref={boxRef} className="relative hidden sm:block">
      {buscando ? (
        <Loader2 className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      )}
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKey}
        onFocus={() => { if (resultados.length) setAbierto(true); }}
        placeholder="Buscar idea o brief…"
        aria-label="Buscar"
        role="combobox"
        aria-expanded={abierto}
        aria-controls="search-results"
        className="h-9 w-64 rounded-md border border-input bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {abierto && (
        <div
          id="search-results"
          role="listbox"
          className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
        >
          {resultados.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              {buscando ? "Buscando…" : "Nada que coincida."}
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {resultados.map((r, i) => (
                <li key={`${r.tipo}-${r.id}`} role="option" aria-selected={i === activo}>
                  <button
                    type="button"
                    onMouseEnter={() => setActivo(i)}
                    onClick={() => ir(r)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${
                      i === activo ? "bg-secondary" : ""
                    }`}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
                      {r.tipo === "tarea" ? <LayoutGrid className="size-3.5" /> : <FileText className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{r.titulo}</span>
                      {r.sub && <span className="block truncate text-[11px] text-muted-foreground">{r.sub}</span>}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {r.tipo}
                    </span>
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

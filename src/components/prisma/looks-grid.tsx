"use client";

import { Aperture, Box, Camera, CircleDot, Clapperboard, Coffee, Droplets, Film, Gem, LayoutGrid, Layers, Mic, Moon, Palette, Plane, Shirt, Smartphone, Smile, Sparkles, Sun, Sunset, Tv, Type, User, Video, ZoomIn, Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { UI, tx, type Lang } from "@/lib/prisma/copy";
import { FOTOS_LISTAS, type Look } from "@/lib/prisma/looks";

/** El ícono de respaldo de cada look (mientras no exista su foto, o debajo de ella). */
const ICONO: Record<string, LucideIcon> = { coffee: Coffee, box: Box, gem: Gem, grid: LayoutGrid, sun: Sun, zoom: ZoomIn, sparkles: Sparkles, layers: Layers, camera: Camera, aperture: Aperture, shirt: Shirt, moon: Moon, sunset: Sunset, film: Film, smile: Smile, palette: Palette, type: Type, droplets: Droplets, circle: CircleDot, video: Video, clapperboard: Clapperboard, smartphone: Smartphone, plane: Plane, mic: Mic, user: User, tv: Tv };

/**
 * El grid de looks del paso 2: tarjetas con foto, nombre y una línea. Una tarjeta = una receta
 * completa; la que H.Ü.E sugiere lleva su insignia (y el porqué), las que la marca ya usa
 * llevan la suya. Botones con aria-pressed: el estado nunca va sólo en el color.
 */
export function LooksGrid({ looks, activo, sugerido, habituales, lang, onElegir }: { looks: Look[]; activo: string | null; sugerido: { id: string; porque: string | null } | null; habituales: string[]; lang: Lang; onElegir: (l: Look) => void }) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{tx(UI.lookTitulo, lang)}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{tx(UI.lookAyuda, lang)}</p>
      {/* Dos columnas también en el celular: una tarjeta de foto a todo lo ancho hacía 8 pantallas de scroll. */}
      <ul className="p-stagger mt-3 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3" aria-label={tx(UI.lookTitulo, lang)}>
        {looks.map((l, i) => {
          const on = activo === l.id;
          const esSugerido = sugerido?.id === l.id;
          const habitual = habituales.includes(l.id);
          const Icono = ICONO[l.icono] ?? Camera;
          return (
            <li key={l.id} style={{ "--i": i } as React.CSSProperties}>
              <button
                type="button"
                onClick={() => onElegir(l)}
                aria-pressed={on}
                className={cn(
                  "group flex w-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary",
                )}
              >
                {/* Miniatura: la foto manda; si falta, queda el degradado de atrás (sin imagen rota). */}
                <span className="relative block aspect-[4/3] w-full overflow-hidden" style={{ backgroundImage: `linear-gradient(135deg, ${l.tono[0]}, ${l.tono[1]})` }}>
                  <span className="absolute inset-0 flex items-center justify-center text-white/80 drop-shadow" aria-hidden="true">
                    <Icono className="size-8" />
                  </span>
                  {FOTOS_LISTAS && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.thumb} alt="" loading="lazy" className="relative size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  )}
                  {on && (
                    <span className="absolute top-2 right-2 inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow" aria-hidden="true">
                      <Check className="size-3.5" />
                    </span>
                  )}
                  {esSugerido && (
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-primary/90 px-2 py-0.5 text-[11px] font-medium text-primary-foreground shadow">
                      <Sparkles className="size-3" aria-hidden="true" /> {tx(UI.lookSugiere, lang)}
                    </span>
                  )}
                </span>
                <span className="block px-2.5 py-2 sm:px-3 sm:py-2.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{tx(l.nombre, lang)}</span>
                    {on && <span className="sr-only">({tx(UI.lookElegido, lang)})</span>}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{tx(l.descripcion, lang)}</span>
                  {(habitual || (esSugerido && sugerido?.porque)) && (
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {habitual && <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{tx(UI.lookHabitual, lang)}</span>}
                      {esSugerido && sugerido?.porque && <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{tx(UI.lookPor, lang).replace("{p}", sugerido.porque)}</span>}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

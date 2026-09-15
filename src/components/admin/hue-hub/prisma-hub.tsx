"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PrismaReglas } from "./prisma-reglas";
import { PrismaInforme } from "./prisma-informe";
import { PrismaHerramientas } from "./prisma-herramientas";

const VISTAS = { conocimiento: "Conocimiento", herramientas: "Herramientas", informe: "Informe" } as const;
type Vista = keyof typeof VISTAS;

/** Hub › Prisma: el conocimiento vivo (notas y reglas), los datos de cada herramienta (F6a) y el
 *  informe de uso (F5a). */
export function PrismaHub() {
  const [vista, setVista] = useState<Vista>("conocimiento");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Prisma">
        {(Object.keys(VISTAS) as Vista[]).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={vista === v} onClick={() => setVista(v)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", vista === v ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
            {VISTAS[v]}
          </button>
        ))}
      </div>
      {vista === "conocimiento" ? <PrismaReglas /> : vista === "herramientas" ? <PrismaHerramientas /> : <PrismaInforme />}
    </div>
  );
}

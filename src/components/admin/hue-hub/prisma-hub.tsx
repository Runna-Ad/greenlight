"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PrismaReglas } from "./prisma-reglas";
import { PrismaInforme } from "./prisma-informe";

/** Hub › Prisma: el conocimiento vivo (notas y reglas) y, desde F5a, el informe de uso. */
export function PrismaHub() {
  const [vista, setVista] = useState<"conocimiento" | "informe">("conocimiento");
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5" role="tablist" aria-label="Prisma">
        {(["conocimiento", "informe"] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={vista === v} onClick={() => setVista(v)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", vista === v ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
            {v === "conocimiento" ? "Conocimiento" : "Informe"}
          </button>
        ))}
      </div>
      {vista === "conocimiento" ? <PrismaReglas /> : <PrismaInforme />}
    </div>
  );
}

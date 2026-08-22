"use client";

import { useState } from "react";
import { BarChart3, GraduationCap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { HueIntelligence } from "./hue-intelligence";
import { HueTraining } from "./hue-training";

/**
 * El H.Ü.E HUB (master-only). Dos áreas: Inteligencia (analítica de "qué está
 * funcionando") + Entrenamiento (el Cerebro, la Biblioteca de Ganadores, el KB y el
 * loop de auto-aprendizaje). Se auto-carga vía server actions gateadas por canHue —
 * el admin-shell sólo monta esta pestaña si el usuario es master.
 */
export function HueHubTab() {
  const [sub, setSub] = useState<"intel" | "entrenar">("intel");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">H.Ü.E HUB</h2>
        <p className="text-sm text-muted-foreground">
          Mide y entrena a H.Ü.E: qué está funcionando, y qué le enseñas para que mejore.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        <SubTab active={sub === "intel"} onClick={() => setSub("intel")} icon={BarChart3} label="Inteligencia" />
        <SubTab active={sub === "entrenar"} onClick={() => setSub("entrenar")} icon={GraduationCap} label="Entrenamiento" />
      </div>

      {sub === "intel" ? <HueIntelligence /> : <HueTraining />}
    </div>
  );
}

function SubTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors",
        active
          ? "border-primary font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
}

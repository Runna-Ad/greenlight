"use client";

import { UserRound } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { chipTextColor } from "@/lib/vocab";

type Soy = { id: string; name: string; color: string; track: string } | null;

// En la beta sin login, "tu perfil" = la persona que elegiste en "¿Quién eres?".
// Cuando el login se encienda, esto mostrará tu cuenta real.
export function PerfilTab({ soy }: { soy: Soy }) {
  if (!soy) {
    return (
      <EmptyState
        icon={UserRound}
        titulo="No te has identificado"
        descripcion="Elige quién eres en “¿Quién eres?”, arriba a la derecha, para ver tu perfil."
      />
    );
  }

  return (
    <div className="gl-card rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span
          className="flex size-11 items-center justify-center rounded-full text-sm font-semibold"
          style={{ backgroundColor: soy.color, color: chipTextColor(soy.color) }}
        >
          {soy.name.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <p className="text-lg font-semibold text-foreground">{soy.name}</p>
          <p className="text-xs text-muted-foreground">
            Equipo {soy.track === "real" ? "Real" : "Normal"}
          </p>
        </div>
      </div>
      <p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
        Durante la beta tu identidad se elige en “¿Quién eres?”. Cuando el login se
        encienda, aquí estará tu cuenta (correo, notificaciones, etc.).
      </p>
    </div>
  );
}

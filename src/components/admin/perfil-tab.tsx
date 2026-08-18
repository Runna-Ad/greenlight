"use client";

import { useState, useTransition } from "react";
import { UserRound } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { chipTextColor } from "@/lib/vocab";
import { guardarMiPerfil } from "@/app/(app)/admin/actions";

type Soy = {
  id: string;
  name: string;
  color: string;
  track: string;
  notify_email: boolean;
  notify_slack: boolean;
} | null;

// En la beta sin login, "tu perfil" = la persona que elegiste en "¿Quién eres?".
// Editable: nombre + notificaciones (email y/o Slack). Los avisos in-app siempre
// llegan; esto sólo cambia correo y Slack.
export function PerfilTab({ soy }: { soy: Soy }) {
  const [nombre, setNombre] = useState(soy?.name ?? "");
  const [email, setEmail] = useState(soy?.notify_email ?? true);
  const [slack, setSlack] = useState(soy?.notify_slack ?? true);
  const [pending, start] = useTransition();

  if (!soy) {
    return (
      <EmptyState
        icon={UserRound}
        titulo="No te has identificado"
        descripcion="Elige quién eres en “¿Quién eres?”, en el menú de la izquierda, para ver y editar tu perfil."
      />
    );
  }

  const guardar = (patch: {
    name?: string;
    notify_email?: boolean;
    notify_slack?: boolean;
  }) =>
    start(async () => {
      const res = await guardarMiPerfil(patch);
      if (!res.ok) {
        toast.error(res.error);
        if (patch.name !== undefined) setNombre(soy.name);
        if (patch.notify_email !== undefined) setEmail(soy.notify_email);
        if (patch.notify_slack !== undefined) setSlack(soy.notify_slack);
      } else {
        toast.success("Perfil actualizado");
      }
    });

  const guardarNombre = () => {
    const limpio = nombre.trim();
    if (!limpio || limpio === soy.name) {
      setNombre(soy.name);
      return;
    }
    guardar({ name: limpio });
  };

  return (
    <div className="gl-card max-w-lg rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span
          className="flex size-11 items-center justify-center rounded-full text-sm font-semibold"
          style={{ backgroundColor: soy.color, color: chipTextColor(soy.color) }}
        >
          {(nombre || soy.name).slice(0, 2).toUpperCase()}
        </span>
        <div>
          <p className="text-lg font-semibold text-foreground">{soy.name}</p>
          <p className="text-xs text-muted-foreground">
            Equipo {soy.track === "real" ? "Real" : "Normal"}
          </p>
        </div>
      </div>

      <label className="mt-5 block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Nombre
        </span>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onBlur={guardarNombre}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          disabled={pending}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
      </label>

      <div className="mt-5 border-t border-border pt-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Notificaciones
        </p>
        <label className="flex items-center justify-between py-1.5">
          <span className="text-sm text-foreground">Correo</span>
          <Switch
            checked={email}
            disabled={pending}
            onCheckedChange={(v) => {
              setEmail(v);
              guardar({ notify_email: v });
            }}
          />
        </label>
        <label className="flex items-center justify-between py-1.5">
          <span className="text-sm text-foreground">
            Slack{" "}
            <span className="text-[11px] font-normal text-muted-foreground">· pronto</span>
          </span>
          <Switch
            checked={slack}
            disabled={pending}
            onCheckedChange={(v) => {
              setSlack(v);
              guardar({ notify_slack: v });
            }}
          />
        </label>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Los avisos dentro de la app siempre te llegan; esto sólo cambia el correo y Slack.
        </p>
      </div>
    </div>
  );
}

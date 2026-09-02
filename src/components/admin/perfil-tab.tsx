"use client";

import { useState, useTransition } from "react";
import { UserRound } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { chipTextColor } from "@/lib/vocab";
import { cn } from "@/lib/utils";
import {
  guardarMiPerfil,
  guardarPrefEvento,
  guardarNotifScope,
  guardarWatchAll,
} from "@/app/(app)/admin/actions";
import {
  NOTIF_EVENTOS,
  eventosParaRol,
  SCOPES,
  type NotifScope,
  type MisPrefs,
} from "@/lib/notif-eventos";
import type { ViewRole } from "@/lib/roles";

type Soy = {
  id: string;
  name: string;
  color: string;
  track: string | null;
  notify_email: boolean;
  notify_slack: boolean;
} | null;

// "Tu perfil" = la persona ligada a tu sesión (vacío si no has iniciado sesión).
// Editable: nombre + notificaciones (email y/o Slack). Los avisos in-app siempre
// llegan; esto sólo cambia correo y Slack.
export function PerfilTab({
  soy,
  notif,
  role,
}: {
  soy: Soy;
  /** Preferencias de notificación de la persona (0050). Sólo se pasan en Mi perfil. */
  notif?: MisPrefs | null;
  role?: ViewRole;
}) {
  const [nombre, setNombre] = useState(soy?.name ?? "");
  const [email, setEmail] = useState(soy?.notify_email ?? true);
  const [slack, setSlack] = useState(soy?.notify_slack ?? true);
  const [prefs, setPrefs] = useState<Record<string, boolean>>(notif?.prefs ?? {});
  const [scope, setScope] = useState<NotifScope>(notif?.scope ?? "my_track");
  const [watchAll, setWatchAll] = useState(notif?.watchAll ?? false);
  const [pending, start] = useTransition();

  if (!soy) {
    return (
      <EmptyState
        icon={UserRound}
        titulo="Inicia sesión"
        descripcion="Entra con tu cuenta de Rünna para ver y editar tu perfil."
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

  // ── Preferencias de notificación (0050) ──
  const esGlobal = role === "admin" || role === "master" || role === "lead";
  const eventos = role ? eventosParaRol(role) : [];
  // Opciones de alcance por rol: el lead elige su equipo o todo; el admin (sin track)
  // elige todo o sólo lo suyo; el especialista no elige (siempre sólo lo suyo).
  const scopeOpts =
    role === "lead"
      ? SCOPES.filter((s) => s.key === "my_track" || s.key === "all")
      : role === "admin" || role === "master"
        ? SCOPES.filter((s) => s.key === "all" || s.key === "only_mine")
        : [];

  const togglePref = (ev: string, v: boolean) =>
    start(async () => {
      setPrefs((p) => ({ ...p, [ev]: v }));
      const res = await guardarPrefEvento(ev, v);
      if (!res.ok) {
        toast.error(res.error);
        setPrefs((p) => ({ ...p, [ev]: !v }));
      }
    });
  const cambiarScope = (s: NotifScope) =>
    start(async () => {
      const prev = scope;
      setScope(s);
      const res = await guardarNotifScope(s);
      if (!res.ok) {
        toast.error(res.error);
        setScope(prev);
      }
    });
  const toggleWatch = (v: boolean) =>
    start(async () => {
      setWatchAll(v);
      const res = await guardarWatchAll(v);
      if (!res.ok) {
        toast.error(res.error);
        setWatchAll(!v);
      }
    });

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
            {soy.track ? `Equipo ${soy.track === "real" ? "Real" : "Normal"}` : "Vista global"}
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
          {/* Apagado hasta que exista el envío por Slack: el switch decía "pronto" pero
              guardaba de verdad — un control vivo que no hace nada. */}
          <Switch
            checked={slack}
            disabled
            aria-label="Slack (próximamente)"
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

      {/* Preferencias por evento (0050): la campana muestra TODO tu alcance; aquí
          eliges qué además te llega por CORREO. Sólo en Mi perfil (notif presente). */}
      {notif && role && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Qué me llega por correo
          </p>
          <p className="mb-3 text-[11px] text-muted-foreground">
            La campana te muestra toda tu actividad dentro de tu alcance; aquí eliges qué además
            te llega por correo.
          </p>

          {scopeOpts.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[11px] font-medium text-foreground">Alcance</p>
              <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-[12px] font-medium shadow-sm">
                {scopeOpts.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    disabled={pending}
                    onClick={() => cambiarScope(s.key)}
                    aria-pressed={scope === s.key}
                    title={s.hint}
                    className={cn(
                      "rounded-md px-3 py-1.5 transition-colors disabled:opacity-60",
                      scope === s.key
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {esGlobal && (
            <label className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-sm text-foreground">
                Avísame de cada movimiento
                <span className="block text-[11px] font-normal text-muted-foreground">
                  Recibe todos los eventos dentro de tu alcance
                </span>
              </span>
              <Switch checked={watchAll} disabled={pending} onCheckedChange={toggleWatch} />
            </label>
          )}

          <div className="mt-1 divide-y divide-border/60">
            {eventos.map((key) => {
              const meta = NOTIF_EVENTOS.find((e) => e.key === key)!;
              return (
                <label key={key} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm text-foreground">
                    {meta.label}
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {meta.hint}
                    </span>
                  </span>
                  <Switch
                    checked={!!prefs[key]}
                    disabled={pending}
                    onCheckedChange={(v) => togglePref(key, v)}
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

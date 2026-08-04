"use client";

import { useTransition } from "react";
import { Eye, Check } from "lucide-react";
import { setViewAs } from "@/app/(app)/view-as-actions";
import {
  DEFAULT_ROLE,
  ROLE_HINT,
  ROLE_LABEL,
  VIEW_ROLES,
  type ViewRole,
} from "@/lib/roles";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export function ViewAsSwitch({ role }: { role: ViewRole }) {
  const [pending, startTransition] = useTransition();
  const previewing = role !== DEFAULT_ROLE;

  const pick = (r: ViewRole) => startTransition(() => void setViewAs(r));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={previewing ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={pending}
        >
          <Eye className="size-3.5" />
          <span className="hidden sm:inline">Ver como</span> {ROLE_LABEL[role]}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-1">
        <p className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          Ver la app como
        </p>
        {VIEW_ROLES.map((r) => (
          <button
            key={r}
            onClick={() => pick(r)}
            className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-secondary"
          >
            <span className="mt-0.5 w-3.5 shrink-0">
              {r === role && <Check className="size-3.5 text-primary" />}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium text-foreground">
                {ROLE_LABEL[r]}
                {r === DEFAULT_ROLE && (
                  <span className="ml-1.5 font-normal text-muted-foreground">· tú</span>
                )}
              </span>
              <span className="block text-[11px] leading-snug text-muted-foreground">
                {ROLE_HINT[r]}
              </span>
            </span>
          </button>
        ))}
        <p className="border-t border-border px-2 py-2 text-[10px] leading-snug text-muted-foreground">
          Es una vista previa: tu cuenta no cambia de rol. Con el login apagado
          prueba las <strong>pantallas</strong>, no todavía los permisos de la base.
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** Franja permanente mientras se mira la app con otros ojos. */
export function PreviewBanner({ role }: { role: ViewRole }) {
  const [pending, startTransition] = useTransition();
  if (role === DEFAULT_ROLE) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-amber-500/40 bg-amber-500/12 px-4 py-1.5 text-xs text-foreground md:px-6">
      <Eye className="size-3.5 shrink-0 text-amber-700" />
      <span>
        Estás viendo la app como <strong>{ROLE_LABEL[role]}</strong>. No es tu rol real.
      </span>
      <button
        onClick={() => startTransition(() => void setViewAs(DEFAULT_ROLE))}
        disabled={pending}
        className="ml-auto rounded px-2 py-0.5 font-medium text-amber-800 underline underline-offset-2 hover:bg-amber-500/20"
      >
        Volver a ser {ROLE_LABEL[DEFAULT_ROLE]}
      </button>
    </div>
  );
}

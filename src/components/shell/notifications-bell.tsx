"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { listAvisos, marcarLeidas, type Aviso } from "@/app/(app)/notification-actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

/**
 * El contador inicial llega del servidor para que no parpadee; al abrir se
 * refrescan los últimos. Sin Realtime por ahora: con 14 personas, refrescar al
 * abrir y al navegar alcanza — y `produccion` no está en la publicación de
 * Realtime, configurarla es otro frente.
 */
export function NotificationsBell({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [avisos, setAvisos] = useState<Aviso[] | null>(null);
  const [, startTransition] = useTransition();

  const abrir = (open: boolean) => {
    if (!open) return;
    startTransition(async () => setAvisos(await listAvisos()));
  };

  const leerTodas = () =>
    startTransition(async () => {
      await marcarLeidas();
      setCount(0);
      setAvisos((prev) =>
        prev?.map((a) => ({ ...a, read_at: a.read_at ?? new Date().toISOString() })) ?? null,
      );
    });

  return (
    <Popover onOpenChange={abrir}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones">
          <Bell className="size-4" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-status-corrections px-1 text-[9px] font-bold text-white">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Avisos
          </span>
          {count > 0 && (
            <button
              onClick={leerTodas}
              className="text-[11px] text-primary hover:underline"
            >
              Marcar todas como leídas
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {avisos === null && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">Cargando…</p>
          )}
          {avisos?.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nada por ahora. Aquí llegan las tareas listas para revisar y los
              cambios que te pidan.
            </p>
          )}
          {avisos?.map((a) => {
            const cuerpo = (
              <>
                <p className="text-[12px] font-medium leading-snug text-foreground">{a.title}</p>
                {a.body && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {a.body}
                  </p>
                )}
              </>
            );
            return (
              <div
                key={a.id}
                className={`border-b border-border/60 px-3 py-2 last:border-0 ${
                  a.read_at ? "opacity-60" : "bg-primary/4"
                }`}
              >
                {a.url ? (
                  <Link href={a.url} className="block hover:opacity-80">
                    {cuerpo}
                  </Link>
                ) : (
                  cuerpo
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

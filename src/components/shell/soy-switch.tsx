"use client";

import { useTransition } from "react";
import { UserRound, Check } from "lucide-react";
import { setSoy } from "@/app/(app)/soy-actions";
import type { Soy } from "@/lib/soy";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export type PoolMember = { id: string; name: string; color: string; track: "real" | "normal" };

const TRACK_LABEL: Record<"real" | "normal", string> = {
  real: "Real",
  normal: "Normal",
};

export function SoySwitch({ soy, pool }: { soy: Soy | null; pool: PoolMember[] }) {
  const [pending, startTransition] = useTransition();
  const pick = (id: string | null) => startTransition(() => void setSoy(id));

  const byTrack = (["real", "normal"] as const).map((t) => ({
    track: t,
    people: pool.filter((p) => p.track === t),
  }));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={soy ? "outline" : "default"}
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={pending}
        >
          {soy ? (
            <>
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: soy.color }}
              />
              {soy.name}
            </>
          ) : (
            <>
              <UserRound className="size-3.5" /> ¿Quién eres?
            </>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 p-1">
        <p className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          Soy
        </p>
        <div className="max-h-80 overflow-y-auto">
          {byTrack.map(({ track, people }) => (
            <div key={track}>
              <p className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                {TRACK_LABEL[track]}
              </p>
              {people.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pick(p.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-secondary"
                >
                  <span className="w-3.5 shrink-0">
                    {p.id === soy?.id && <Check className="size-3.5 text-primary" />}
                  </span>
                  <span
                    className="size-3 shrink-0 rounded-sm border border-black/10"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="flex-1">{p.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {soy && (
          <button
            onClick={() => pick(null)}
            className="mt-1 w-full rounded border-t border-border px-2 py-2 text-left text-[11px] text-muted-foreground hover:bg-secondary"
          >
            No soy {soy.name}
          </button>
        )}
        <p className="border-t border-border px-2 py-2 text-[10px] leading-snug text-muted-foreground">
          Mientras no haya login esto es de confianza: nadie comprueba que seas
          quien dices.
        </p>
      </PopoverContent>
    </Popover>
  );
}

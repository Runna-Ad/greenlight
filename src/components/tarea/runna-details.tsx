"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ExternalLink, Crown, Check, Pencil } from "lucide-react";
import { toast } from "sonner";

import { setLeads } from "@/app/(app)/[cliente]/tablero/actions";
import { CampoIntake } from "./campo-intake";
import { NombresFinales } from "./nombres-finales";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export type Persona = { id: string; name: string; color: string; es_lead: boolean };

/**
 * "Rünna details" del wireframe: la franja de info INTERNA de la tarea. El
 * cliente jamás la ve — no por CSS, sino porque la página no construye este
 * componente para el rol cliente (ver page.tsx). Colapsable, como en el deck.
 *
 * Contiene: quién es lead, quién es equipo, la liga de entrega (Drive/Dropbox)
 * y la prioridad. El lead puede marcar quién es lead entre los ya asignados;
 * añadir o quitar gente sigue viviendo en el tablero (no se duplica).
 */
export function RunnaDetails({
  ideaId,
  personas,
  entregaUrl,
  entregaNum,
  filenames,
  puedeEditar,
}: {
  ideaId: string;
  personas: Persona[];
  entregaUrl: string | null;
  entregaNum: string | null;
  /** Los nombres finales que entrega la tarea, ya calculados por la BD. */
  filenames: string[];
  /** El lead edita; el especialista sólo lee. */
  puedeEditar: boolean;
}) {
  const [abierto, setAbierto] = useState(true);

  const leads = personas.filter((p) => p.es_lead);
  const team = personas.filter((p) => !p.es_lead);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-secondary/30">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-1.5 px-4 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
      >
        Rünna details
        <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-[8px] font-semibold normal-case tracking-normal">
          sólo interno
        </span>
        <ChevronDown className={`ml-auto size-4 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-border/60 px-4 py-3">
          {/* Lo más importante, hasta arriba: el nombre final + los demás. */}
          <NombresFinales filenames={filenames} />

          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-[1fr_1fr_auto]">
          {/* Lead + Team */}
          <div className="space-y-2">
            <GrupoPersonas
              titulo="Lead asignado"
              personas={leads}
              vacio="Sin lead marcado"
            />
            <GrupoPersonas titulo="Team asignado" personas={team} vacio="Sin equipo" />
            {puedeEditar && personas.length > 0 && (
              <EditorLeads ideaId={ideaId} personas={personas} />
            )}
          </div>

          {/* Liga de entrega */}
          <div className="space-y-1">
            <CampoIntake
              ideaId={ideaId}
              campo="entrega_url"
              label="Link de entrega"
              valorInicial={entregaUrl}
              placeholder="https://drive.google.com/…"
              soloLectura={!puedeEditar}
            />
            {entregaUrl && (
              <a
                href={entregaUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <ExternalLink className="size-3" /> Abrir entregable
              </a>
            )}
          </div>

            {/* Prioridad */}
            <CampoIntake
              ideaId={ideaId}
              campo="entrega_num"
              label="Prioridad de entrega"
              valorInicial={entregaNum}
              placeholder="1ra"
              ancho="w-24"
              soloLectura={!puedeEditar}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function GrupoPersonas({
  titulo,
  personas,
  vacio,
}: {
  titulo: string;
  personas: Persona[];
  vacio: string;
}) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {personas.length === 0 ? (
          <span className="text-[11px] text-muted-foreground/70">{vacio}</span>
        ) : (
          personas.map((p) => <ChipPersona key={p.id} persona={p} />)
        )}
      </div>
    </div>
  );
}

function ChipPersona({ persona }: { persona: Persona }) {
  // Fondo tenue + texto y punto sólidos: el patrón de contraste AA del tablero.
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        backgroundColor: `color-mix(in srgb, ${persona.color} 26%, transparent)`,
        color: persona.color,
      }}
    >
      {persona.es_lead && <Crown className="size-2.5" />}
      {persona.name}
    </span>
  );
}

/** Marcar quién es lead entre los asignados. No agrega gente (eso es el tablero). */
function EditorLeads({ ideaId, personas }: { ideaId: string; personas: Persona[] }) {
  const [pending, startTransition] = useTransition();
  const [sel, setSel] = useState<Set<string>>(
    new Set(personas.filter((p) => p.es_lead).map((p) => p.id)),
  );

  const alternar = (id: string) =>
    setSel((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const guardar = () =>
    startTransition(async () => {
      const res = await setLeads(ideaId, [...sel]);
      if (!res.ok) toast.error(res.error ?? "No se pudo guardar.");
      else toast.success("Leads actualizados.");
    });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
          <Pencil className="size-3" /> Marcar leads
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <p className="mb-1.5 px-1 text-[10px] text-muted-foreground">
          ¿Quién es lead de esta tarea?
        </p>
        <ul className="space-y-0.5">
          {personas.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => alternar(p.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-secondary"
              >
                <span
                  className="flex size-4 items-center justify-center rounded border"
                  style={{ borderColor: p.color }}
                >
                  {sel.has(p.id) && <Check className="size-3" style={{ color: p.color }} />}
                </span>
                {p.name}
              </button>
            </li>
          ))}
        </ul>
        <Button size="sm" className="mt-2 w-full" disabled={pending} onClick={guardar}>
          Guardar
        </Button>
      </PopoverContent>
    </Popover>
  );
}

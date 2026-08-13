"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ExternalLink, Crown, Check, Pencil, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

import { setLeads } from "@/app/(app)/[cliente]/tablero/actions";
import { CampoIntake } from "./campo-intake";
import { NombresFinales } from "./nombres-finales";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";

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
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-1.5 px-4 py-2 text-left gl-eyebrow hover:text-foreground"
      >
        Rünna details
        <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal">
          sólo interno
        </span>
        <ChevronDown className={`ml-auto size-4 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-border/60 px-4 py-3">
          {/* Lo más importante, hasta arriba: el nombre final + los demás. */}
          <NombresFinales filenames={filenames} />

          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-[1fr_auto]">
            {/* Lead + Team */}
            <div className="space-y-2">
              <GrupoPersonas titulo="Lead asignado" personas={leads} vacio="Sin lead marcado" />
              <GrupoPersonas titulo="Team asignado" personas={team} vacio="Sin equipo" />
              {puedeEditar && personas.length > 0 && (
                <EditorLeads ideaId={ideaId} personas={personas} />
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

          {/* Link de entrega — destacado: es donde el lead pega el link final
              (Drive/Dropbox), y de aquí sale el botón "Abrir entregable" que
              verá el CLIENTE en su portal. Caja obvia para que se lea "pega
              aquí el link". */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center gap-1.5">
              <LinkIcon className="size-3.5 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
                Link de entrega
              </span>
            </div>
            <p className="mt-0.5 mb-2 text-[10px] text-muted-foreground">
              Pega aquí el link del entregable (Drive / Dropbox). El cliente verá
              un botón <b>Abrir entregable</b> que abre este link.
            </p>
            <CampoIntake
              ideaId={ideaId}
              campo="entrega_url"
              label=""
              valorInicial={entregaUrl}
              placeholder="https://drive.google.com/…"
              caja
              soloLectura={!puedeEditar}
            />
            {entregaUrl && (
              <a
                href={entregaUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground hover:opacity-90"
              >
                <ExternalLink className="size-3.5" /> Abrir entregable
              </a>
            )}
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
  // Tinte del color + TINTA OSCURA (no el color como texto: eso fallaba AA, 1.2–1.5:1).
  // Lead → corona; si no, un punto del color para conservar la identidad visual.
  return (
    <Pill color={persona.color} dot={!persona.es_lead}>
      {persona.es_lead && <Crown className="size-2.5" style={{ color: persona.color }} />}
      {persona.name}
    </Pill>
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

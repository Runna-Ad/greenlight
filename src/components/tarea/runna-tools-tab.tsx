"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Crown, Check, Pencil } from "lucide-react";
import { toast } from "sonner";

import { setLeads } from "@/app/(app)/[cliente]/tablero/actions";
import { guardarConsideraciones } from "@/app/(app)/[cliente]/tareas/[id]/actions";
import { combinarConsideraciones } from "@/lib/consideraciones";
import { CampoIntake } from "./campo-intake";
import { NombresFinales } from "./nombres-finales";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";

export type Persona = { id: string; name: string; color: string; es_lead: boolean };

/**
 * La pestaña "Rünna tools" (mockup): la info INTERNA de la tarea — jamás la ve
 * el cliente. La página no la construye para el rol cliente (se decide en el
 * servidor, no con CSS, para no filtrar nombres/ligas en el payload RSC), y las
 * pestañas la ocultan en "Vista cliente".
 *
 * Izquierda: Lead / Team asignado + Consideraciones. Derecha: Link de entrega +
 * Nombre de archivos.
 */
export function RunnaToolsTab({
  ideaId,
  personas,
  entregaUrl,
  filenames,
  comentariosCreativo,
  peloteo,
  puedeEditar,
  soloLectura,
}: {
  ideaId: string;
  personas: Persona[];
  entregaUrl: string | null;
  filenames: string[];
  /** Las dos fuentes de "Consideraciones" (se combinan en una caja). */
  comentariosCreativo: string | null;
  peloteo: string | null;
  /** El lead edite (leads + link); el especialista sólo lee esos. */
  puedeEditar: boolean;
  /** Estado cerrado (bloquea Consideraciones para quien no es lead). */
  soloLectura: boolean;
}) {
  const leads = personas.filter((p) => p.es_lead);
  const team = personas.filter((p) => !p.es_lead);
  const consideracionesInicial = combinarConsideraciones(comentariosCreativo, peloteo);

  return (
    <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
      {/* Columna izquierda: gente + consideraciones */}
      <div className="space-y-4">
        <GrupoPersonas titulo="Lead asignado" personas={leads} vacio="Sin lead marcado" />
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Team asignado
            </p>
            {puedeEditar && personas.length > 0 && (
              <EditorLeads ideaId={ideaId} personas={personas} />
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {team.length === 0 ? (
              <span className="text-[11px] text-muted-foreground/70">Sin equipo</span>
            ) : (
              team.map((p) => <ChipPersona key={p.id} persona={p} />)
            )}
          </div>
        </div>

        <div className="leading-tight">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Consideraciones
          </span>
          <div className="mt-1.5">
            <CampoIntake
              ideaId={ideaId}
              campo="peloteo_raw"
              label=""
              valorInicial={consideracionesInicial}
              placeholder="Campo para que el lead le deje comentarios al equipo asignado…"
              rows={5}
              caja
              soloLectura={soloLectura}
              accion={(anterior, nuevo) => guardarConsideraciones(ideaId, anterior, nuevo)}
            />
          </div>
        </div>
      </div>

      {/* Columna derecha: link de entrega + nombres */}
      <div className="space-y-4">
        <div className="leading-tight">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Link de entrega
          </span>
          <div className="mt-1.5">
            <CampoIntake
              ideaId={ideaId}
              campo="entrega_url"
              label=""
              valorInicial={entregaUrl}
              placeholder="www."
              caja
              soloLectura={!puedeEditar}
            />
            {entregaUrl && (
              <a
                href={entregaUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" /> Abrir entregable
              </a>
            )}
          </div>
        </div>

        <NombresFinales filenames={filenames} />
      </div>
    </div>
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
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
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

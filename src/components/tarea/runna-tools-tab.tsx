"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Crown, Check, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { asignarTarea } from "@/app/(app)/[cliente]/tablero/actions";
import { guardarConsideraciones } from "@/app/(app)/[cliente]/tareas/[id]/actions";
import { combinarConsideraciones } from "@/lib/consideraciones";
import { CampoIntake } from "./campo-intake";
import { NombresFinales } from "./nombres-finales";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";

export type Persona = { id: string; name: string; color: string; es_lead: boolean };
export type PoolPersona = { id: string; name: string; color: string };

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
  puedeAsignar,
  leadsPool,
  especialistasPool,
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
  /** Puede cambiar la asignación (lead/admin/master). */
  puedeAsignar: boolean;
  /** Pool vivo por rol+track (lead/creative de este track) para el editor. */
  leadsPool: PoolPersona[];
  especialistasPool: PoolPersona[];
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
        {/* Asignación — Lead + Especialistas del pool VIVO por rol+track (Phase 2).
            Editable por lead/admin/master; funciona aunque no haya nadie asignado
            (arregla el hueco de "sin lead → no se podía asignar después"). */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Asignación
            </p>
            {puedeAsignar && (
              <EditorAsignacion
                ideaId={ideaId}
                leadActual={leads[0] ?? null}
                especialistasActuales={team}
                leadsPool={leadsPool}
                especialistasPool={especialistasPool}
              />
            )}
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/60">
              Lead
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {leads.length === 0 ? (
                <span className="text-[11px] text-muted-foreground/70">Sin lead marcado</span>
              ) : (
                leads.map((p) => <ChipPersona key={p.id} persona={p} />)
              )}
            </div>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/60">
              Especialistas
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {team.length === 0 ? (
                <span className="text-[11px] text-muted-foreground/70">Sin equipo</span>
              ) : (
                team.map((p) => <ChipPersona key={p.id} persona={p} />)
              )}
            </div>
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

function ChipPersona({ persona }: { persona: Persona }) {
  return (
    <Pill color={persona.color} dot={!persona.es_lead}>
      {persona.es_lead && <Crown className="size-2.5" style={{ color: persona.color }} />}
      {persona.name}
    </Pill>
  );
}

/** Marcar quién es lead entre los asignados. No agrega gente (eso es el tablero). */
/**
 * Editor de asignación (Phase 2): elige el LEAD (uno, del pool de Leads de este
 * track) y los ESPECIALISTAS (varios, del pool de Especialistas del track). Guarda
 * ambos de una vez con `asignarTarea`, que re-valida rol+track en el SERVIDOR.
 * Funciona aunque la tarea no tenga a nadie asignado.
 */
function EditorAsignacion({
  ideaId,
  leadActual,
  especialistasActuales,
  leadsPool,
  especialistasPool,
}: {
  ideaId: string;
  leadActual: Persona | null;
  especialistasActuales: Persona[];
  leadsPool: PoolPersona[];
  especialistasPool: PoolPersona[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [leadId, setLeadId] = useState<string | null>(leadActual?.id ?? null);
  const [esp, setEsp] = useState<Set<string>>(
    new Set(especialistasActuales.map((p) => p.id)),
  );

  const toggleEsp = (id: string) =>
    setEsp((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const guardar = () =>
    startTransition(async () => {
      const res = await asignarTarea(ideaId, leadId, [...esp]);
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo asignar.");
        return;
      }
      toast.success("Asignación guardada.");
      router.refresh();
    });

  const hayAlgo = Boolean(leadActual) || especialistasActuales.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
          <UserPlus className="size-3" /> {hayAlgo ? "Editar" : "Asignar"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Lead <span className="font-normal normal-case text-muted-foreground/60">· uno</span>
        </p>
        {leadsPool.length === 0 ? (
          <p className="px-1 py-1 text-[11px] text-muted-foreground/70">
            No hay Leads en este track.
          </p>
        ) : (
          <ul className="space-y-0.5">
            <li>
              <button
                onClick={() => setLeadId(null)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-secondary"
              >
                <Radio activo={leadId === null} />
                Sin lead
              </button>
            </li>
            {leadsPool.map((l) => (
              <li key={l.id}>
                <button
                  onClick={() => setLeadId(l.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-secondary"
                >
                  <Radio activo={leadId === l.id} />
                  <Crown className="size-3" style={{ color: l.color }} /> {l.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="mb-1 mt-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Especialistas <span className="font-normal normal-case text-muted-foreground/60">· varios</span>
        </p>
        {especialistasPool.length === 0 ? (
          <p className="px-1 py-1 text-[11px] text-muted-foreground/70">
            No hay Especialistas en este track.
          </p>
        ) : (
          <ul className="max-h-40 space-y-0.5 overflow-y-auto">
            {especialistasPool.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => toggleEsp(e.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-secondary"
                >
                  <span
                    className="flex size-4 items-center justify-center rounded border"
                    style={{ borderColor: e.color }}
                  >
                    {esp.has(e.id) && <Check className="size-3" style={{ color: e.color }} />}
                  </span>
                  {e.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        <Button size="sm" className="mt-2 w-full" disabled={pending} onClick={guardar}>
          Guardar asignación
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** Círculo estilo radio (lead = uno solo). */
function Radio({ activo }: { activo: boolean }) {
  return (
    <span
      className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
        activo ? "border-primary bg-primary" : "border-muted-foreground/40"
      }`}
    >
      {activo && <span className="size-1.5 rounded-full bg-white" />}
    </span>
  );
}

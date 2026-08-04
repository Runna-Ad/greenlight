"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { buildFilename, namingKindForTipo } from "@/lib/filename";
import { SIZE_PLATFORMS } from "@/lib/brand";
import { ChipSelect } from "./chip-select";
import {
  ASIGNACION,
  ENTREGA,
  FORMATO,
  GENERO,
  MARCA,
  PLACEHOLDER,
  PLATAFORMA,
  PLATAFORMA_LABEL,
  TAMANO,
  TIPO_ASSET,
  TRACK_HINT,
  TRACK_LABEL,
  type Track,
} from "@/lib/vocab";

// Platforms whose size rules are actually documented. Anything else — EC
// (extra channel) or a value the team typed — is a special case and stays
// unrestricted, because those are rare and can be anything.
const RULED_PLATFORMS = new Set(["GG", "FB", "TT"]);

function isAllowed(media: "video" | "static", size: string, plat: string) {
  if (!RULED_PLATFORMS.has(plat)) return true; // EC / custom → open
  const allowed = SIZE_PLATFORMS[media]?.[size];
  if (!allowed) return true; // unknown size (2736 x 1260, custom) → open
  return allowed.includes(plat as never);
}

// Column names are VERBATIM from the DiDi sheet — do not rename.
export function IntakeForm({ cliente }: { cliente: string }) {
  const [track, setTrack] = useState<Track>("real");

  // — Entrega —
  const [entrega, setEntrega] = useState<string[]>([]);
  const [asignacion, setAsignacion] = useState<string[]>([]);
  const [marca, setMarca] = useState<string[]>([]);
  const [mes, setMes] = useState("");
  const [briefName, setBriefName] = useState("");
  const [entregaFinal, setEntregaFinal] = useState("");

  // — Contenido —
  const [comCreativo, setComCreativo] = useState("");
  const [comProduccion, setComProduccion] = useState("");
  const [comDiseno, setComDiseno] = useState("");
  const [peloteo, setPeloteo] = useState("");
  const [concepto, setConcepto] = useState("");
  const [sellingPoints, setSellingPoints] = useState("");
  const [referencias, setReferencias] = useState("");

  // — Especificaciones —
  const [plataforma, setPlataforma] = useState<string[]>([]);
  const [tipoAsset, setTipoAsset] = useState<string[]>([]);
  const [formato, setFormato] = useState<string[]>([]);
  const [tamano, setTamano] = useState<string[]>([]);
  const [duracion, setDuracion] = useState("");
  const [numIdea, setNumIdea] = useState("");
  const [version, setVersion] = useState("V1");
  const [genero, setGenero] = useState<string[]>([]);
  const [naming, setNaming] = useState("");

  // Switching track resets the fields whose option pools differ.
  const switchTrack = (t: Track) => {
    if (t === track) return;
    setTrack(t);
    setAsignacion([]);
    setFormato([]);
    setTipoAsset([]);
  };

  const tipo = tipoAsset[0] ?? "";
  const namingKind = tipo ? namingKindForTipo(tipo) : "real";
  const media = namingKind === "static" ? "static" : "video";
  const mesToken = mes ? `${mes.toUpperCase()}26` : "";
  const versionNum = Number(version.replace(/\D/g, "")) || 1;

  // Every valid tamaño × plataforma pair becomes one deliverable.
  const deliverables = useMemo(() => {
    const out: { size: string; plat: string; filename: string }[] = [];
    for (const size of tamano) {
      for (const plat of plataforma) {
        if (!isAllowed(media, size, plat)) continue;
        out.push({
          size,
          plat,
          filename: buildFilename({
            kind: namingKind,
            base: naming,
            tamano: size,
            duracion,
            genero: genero[0],
            formato: formato[0],
            idea: numIdea,
            plataforma: plat,
            version: versionNum,
            mes: mesToken,
          }),
        });
      }
    }
    return out;
  }, [tamano, plataforma, media, namingKind, naming, duracion, genero, formato, numIdea, versionNum, mesToken]);

  const blocked = useMemo(() => {
    const out: string[] = [];
    for (const size of tamano) {
      for (const plat of plataforma) {
        if (!isAllowed(media, size, plat)) {
          out.push(`${size} × ${PLATAFORMA_LABEL[plat] ?? plat}`);
        }
      }
    }
    return out;
  }, [tamano, plataforma, media]);

  // Formato feeds the filename for everything except Real Person (which uses REAL).
  const needsFormato = namingKind !== "real";
  const missing: string[] = [];
  if (!naming.trim()) missing.push("Naming");
  if (!numIdea.trim()) missing.push("# Idea");
  if (!mes.trim()) missing.push("Mes");
  if (!tipo) missing.push("Tipo de Asset");
  if (needsFormato && !formato[0]) missing.push("Formato");
  if (deliverables.length === 0) missing.push("Tamaño + Plataforma");
  const ready = missing.length === 0;

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
        {cliente} · Nueva solicitud
      </div>
      <h2 className="mb-5 text-2xl font-semibold text-foreground">Capturar brief</h2>

      {/* Track switch — drives which option pools appear */}
      <div className="mb-5 rounded-xl border border-border bg-card p-4">
        <Label className="mb-2 block">¿Real o Normal?</Label>
        <div className="flex flex-wrap gap-2">
          {(["real", "normal"] as Track[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchTrack(t)}
              aria-pressed={track === t}
              className={cn(
                "flex-1 min-w-[200px] rounded-lg border p-3 text-left transition-colors",
                track === t
                  ? "border-primary bg-primary/10"
                  : "border-input hover:border-primary",
              )}
            >
              <span className="flex items-center gap-2 font-semibold text-foreground">
                {track === t && <Check className="size-4 text-primary" />}
                {TRACK_LABEL[t]}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {TRACK_HINT[t]}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Cambia las opciones de Asignación, Tipo de Asset y Formato.
        </p>
      </div>

      <div className="space-y-5">
        <Card title="Entrega">
          <Row label="# Entrega">
            <ChipSelect ariaLabel="# Entrega" options={ENTREGA} selected={entrega} onChange={setEntrega} />
          </Row>
          <Row label="Asignación" hint="Puede ser más de una persona">
            <ChipSelect
              ariaLabel="Asignación"
              multi
              options={ASIGNACION[track].map((p) => ({ value: p.name, color: p.color }))}
              selected={asignacion}
              onChange={setAsignacion}
            />
          </Row>
          <Row label="Marca">
            <ChipSelect ariaLabel="Marca" options={MARCA} selected={marca} onChange={setMarca} />
          </Row>
          <div className="grid gap-4 sm:grid-cols-3">
            <Text label="Mes" value={mes} onChange={setMes} placeholder={PLACEHOLDER.mes} mono />
            <Text label="Brief Name" value={briefName} onChange={setBriefName} placeholder={PLACEHOLDER.brief_name} />
            <Text label="Entrega final" value={entregaFinal} onChange={setEntregaFinal} placeholder={PLACEHOLDER.entrega_final} />
          </div>
        </Card>

        <Card title="Contenido">
          <Text label="Concepto" value={concepto} onChange={setConcepto} placeholder={PLACEHOLDER.concepto} full />
          <Row label="Comentarios Leads">
            <div className="grid w-full gap-3 sm:grid-cols-3">
              <Area label="Creativo" value={comCreativo} onChange={setComCreativo} small />
              <Area label="Producción" value={comProduccion} onChange={setComProduccion} small />
              <Area label="Diseño" value={comDiseno} onChange={setComDiseno} small />
            </div>
          </Row>
          <Area label="Peloteo" value={peloteo} onChange={setPeloteo} placeholder={PLACEHOLDER.peloteo} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Area label="Selling Points" value={sellingPoints} onChange={setSellingPoints} placeholder={PLACEHOLDER.selling_points} />
            <Area label="Referencias" value={referencias} onChange={setReferencias} placeholder={PLACEHOLDER.referencias} />
          </div>
        </Card>

        <Card title="Especificaciones">
          <Row label="Plataforma" hint="EC = extra channel">
            <ChipSelect
              ariaLabel="Plataforma"
              multi
              options={PLATAFORMA.map((p) => ({ value: p, label: `${p} · ${PLATAFORMA_LABEL[p]}` }))}
              selected={plataforma}
              onChange={setPlataforma}
            />
          </Row>
          <Row label="Tipo de Asset">
            <ChipSelect ariaLabel="Tipo de Asset" options={TIPO_ASSET[track]} selected={tipoAsset} onChange={setTipoAsset} />
          </Row>
          <Row label="Formato">
            <ChipSelect ariaLabel="Formato" options={FORMATO[track]} selected={formato} onChange={setFormato} />
          </Row>
          <Row label="Tamaño" hint="Puede ser más de uno">
            <ChipSelect ariaLabel="Tamaño" multi options={TAMANO} selected={tamano} onChange={setTamano} />
          </Row>
          <Row label="Género">
            <ChipSelect ariaLabel="Género" options={GENERO} selected={genero} onChange={setGenero} />
          </Row>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Text label="Duración" value={duracion} onChange={setDuracion} placeholder={PLACEHOLDER.duracion} mono />
            <Text label="# Idea" value={numIdea} onChange={(v) => setNumIdea(v.toUpperCase())} placeholder={PLACEHOLDER.idea} mono />
            <Text label="Versión" value={version} onChange={(v) => setVersion(v.toUpperCase())} placeholder={PLACEHOLDER.version} mono />
            <Text label="Naming" value={naming} onChange={(v) => setNaming(v.toUpperCase())} placeholder={PLACEHOLDER.naming} mono />
          </div>
        </Card>

        <Card title="Entregables">
          {deliverables.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
              Elige Tamaño y Plataforma (y completa Naming, # Idea y Mes) para ver los nombres de archivo.
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Se crearán {deliverables.length} entregable{deliverables.length === 1 ? "" : "s"}
              </p>
              <ul className="space-y-1">
                {deliverables.map((d) => (
                  <li
                    key={`${d.size}|${d.plat}`}
                    className="overflow-x-auto whitespace-nowrap rounded-md bg-[#2d2b55] px-3 py-1.5 font-mono text-[12px] text-[#d9d2f0]"
                  >
                    {d.filename}
                  </li>
                ))}
              </ul>
            </>
          )}
          {blocked.length > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-md bg-[color-mix(in_srgb,var(--status-corrections)_10%,transparent)] p-2.5 text-xs text-status-corrections">
              <Ban className="mt-0.5 size-3.5 shrink-0" />
              <span>
                No válidas para esta plataforma (se omiten): {blocked.join(" · ")}
              </span>
            </p>
          )}
        </Card>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        {!ready && (
          <span className="text-xs text-muted-foreground">
            Falta: {missing.join(" · ")}
          </span>
        )}
        <Button
          disabled={!ready}
          onClick={() =>
            toast.success(`${deliverables.length} entregables creados (demo)`, {
              description: "Al conectar Supabase esto llama a rpc_generate_assets.",
            })
          }
        >
          Crear entregables y asignar
        </Button>
      </div>
    </div>
  );
}

// ── layout helpers ──
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 border-b border-border pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[160px_1fr] sm:gap-4">
      <div className="pt-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  placeholder,
  mono,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  full?: boolean;
}) {
  const id = label.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
  return (
    <div className={full ? "w-full" : ""}>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
          mono && "font-mono",
        )}
      />
    </div>
  );
}

function Area({
  label,
  value,
  onChange,
  placeholder,
  small,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  small?: boolean;
}) {
  const id = label.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "mt-1 w-full resize-y rounded-md border border-input bg-background p-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
          small ? "min-h-[68px]" : "min-h-[88px]",
        )}
      />
    </div>
  );
}

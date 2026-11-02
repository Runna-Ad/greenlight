"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { guardarHerramientaPrisma, hubPrismaHerramientas } from "@/app/(app)/admin/hue-actions";
import { CATALOGO_BASE, ETIQUETA_FORTALEZA, MAX_MODELOS, MIN_PALABRAS, ROLES_MODELO, catalogoDesdeFilas, refsMinimas, fortalezasDe, validarFicha, type Catalogo, type FichaHerramienta, type Fortaleza, type RolModelo } from "@/lib/prisma/catalogo";
import { elegirHerramienta } from "@/lib/prisma/routing";
import { ASPECTS, TOOLS, type Aspect, type Tool } from "@/lib/prisma/spec";
import { TOOL_INFO } from "@/lib/prisma/tools";

/** Costo en texto (se escribe): vacío = sin dato. `conCosto` false = no sabemos si cobra. */
type ModeloB = { id: string; etiqueta: string; rol: RolModelo; es: string; en: string; url: string; conCosto: boolean; ilimitado: boolean; tipico: string; min: string; max: string; tabla: string };
/** El formulario en texto (los números se escriben): se convierte a la forma de la tabla al validar. */
type Borrador = { duraciones: string; maxPalabras: string; maxCaracteres: string; aspects: Aspect[]; refsMax: string; audio: boolean; fortalezas: Record<Fortaleza, number>; modelos: ModeloB[]; fuenteUrl: string; fuenteFecha: string };

const aBorrador = (f: FichaHerramienta): Borrador => ({
  duraciones: f.limites.duraciones.join(", "),
  maxPalabras: f.limites.maxPalabras === null ? "" : String(f.limites.maxPalabras),
  maxCaracteres: f.limites.maxCaracteres === null ? "" : String(f.limites.maxCaracteres),
  aspects: [...f.limites.aspects],
  refsMax: String(f.limites.refsMax),
  audio: f.limites.audio,
  fortalezas: { ...f.fortalezas },
  modelos: f.modelos.map((m) => ({
    id: m.id, etiqueta: m.etiqueta, rol: m.rol, es: m.comoLlegar.es, en: m.comoLlegar.en, url: m.url ?? "",
    conCosto: !!m.costo, ilimitado: !!m.costo?.ilimitado,
    tipico: m.costo?.tipico != null && !m.costo.ilimitado ? String(m.costo.tipico) : "",
    min: m.costo?.min != null && !m.costo.ilimitado ? String(m.costo.min) : "",
    max: m.costo?.max != null && !m.costo.ilimitado ? String(m.costo.max) : "",
    tabla: m.costo?.porDuracion?.length && !m.costo.ilimitado ? m.costo.porDuracion.map((f) => `${f.s}=${m.costo?.porDuracion?.some((x) => x.p480 != null) ? `${f.p480 ?? "-"}/` : ""}${f.p720}/${f.p1080 ?? "-"}/${f.p4k ?? "-"}`).join(", ") : "",
  })),
  fuenteUrl: f.fuente?.url ?? "",
  fuenteFecha: f.fuente?.fecha ?? "",
});

/** Vacío = sin tope (null); lo demás, número (un NaN lo rechaza la validación con su porqué). */
const numero = (s: string): number | null => (s.trim() === "" ? null : Number(s));

/** "4=29/29/44, 6=44/44/66" (segundos = 720p/1080p/4K; "-" = sin 4K) o con 480p al frente "4=12/26/36/-"
 *  → la lista que valida el servidor. Una fila
 *  mal escrita viaja como segundos inválidos para que la validación diga el porqué (no se tira en silencio). */
function aTabla(txt: string) {
  const filas = txt.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
  if (!filas.length) return null;
  return filas.map((f) => {
    const m = /^(\d+)\s*s?\s*=\s*(?:([\d.]+|-)\s*\/\s*)?([\d.]+)\s*\/\s*([\d.]+|-)\s*\/\s*([\d.]+|-)$/.exec(f);
    if (!m) return { segundos: Number.NaN, p720: 0, p1080: 0, p4k: null };
    const n = (x: string | undefined) => (x === undefined || x === "-" ? null : Number(x));
    return { segundos: Number(m[1]), p480: n(m[2]), p720: Number(m[3]), p1080: n(m[4]), p4k: n(m[5]) };
  });
}

/** La forma que valida el servidor (validarFicha) — la misma que se guarda en la tabla. */
function aEntrada(tool: Tool, b: Borrador) {
  return {
    limites: {
      duraciones: b.duraciones.split(/[,\s]+/).filter(Boolean).map(Number),
      max_palabras: numero(b.maxPalabras),
      max_caracteres: numero(b.maxCaracteres),
      aspects: b.aspects,
      refs_max: b.refsMax.trim() === "" ? Number.NaN : Number(b.refsMax),
      audio: b.audio,
    },
    fortalezas: Object.fromEntries(fortalezasDe(tool).map((k) => [k, b.fortalezas[k]])),
    modelos: b.modelos.map((m) => ({
      id: m.id.trim(), etiqueta: m.etiqueta, rol: m.rol, como_llegar_es: m.es, como_llegar_en: m.en, url: m.url.trim() || null,
      costo: m.conCosto ? { ilimitado: m.ilimitado, creditos_tipicos: numero(m.tipico), creditos_min: numero(m.min), creditos_max: numero(m.max), creditos_por_duracion: m.ilimitado ? null : aTabla(m.tabla) } : null,
    })),
    fuente_url: b.fuenteUrl.trim() || null,
    fuente_fecha: b.fuenteFecha || null,
  };
}

/** Los casos que cada número decide: así se ve QUÉ cambia al mover una fortaleza, antes de guardar. */
function comoElige(cat: Catalogo, tool: Tool): { cuando: string; va: string }[] {
  const n = (x: Tool) => TOOL_INFO[x].nombre;
  if (!TOOL_INFO[tool].video) {
    const foto = { job: "foto_producto" as const, destino: "ig_feed" as const, tieneDialogo: false, tieneRefs: true, movimientoMarcado: false };
    return [
      { cuando: "Foto con texto", va: n(elegirHerramienta({ ...foto, tieneTexto: true }, cat).tool) },
      { cuando: "Foto sin texto", va: n(elegirHerramienta({ ...foto, tieneTexto: false }, cat).tool) },
    ];
  }
  const video = { job: "animar_foto" as const, destino: "yt" as const, tieneDialogo: false, tieneRefs: true, movimientoMarcado: false, tieneTexto: false };
  return [
    { cuando: "Video con diálogo", va: n(elegirHerramienta({ ...video, tieneDialogo: true }, cat).tool) },
    { cuando: "Movimiento de cámara marcado", va: n(elegirHerramienta({ ...video, movimientoMarcado: true }, cat).tool) },
    { cuando: "Clip vertical corto sin voz", va: n(elegirHerramienta({ ...video, destino: "tiktok" }, cat).tool) },
  ];
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
const selectCls = "mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Hub › Prisma › Herramientas (F6a): lo que Prisma sabe de CADA herramienta — límites, en qué es
 * mejor (fortalezas 0–5, las lee el routing) y sus modelos (los lee "Úsalo en…"). Guardar = vivo
 * en la siguiente generación, sin deploy. `demo` (sólo desarrollo) enseña los valores del código
 * sin sesión y sin guardar.
 */
export function PrismaHerramientas({ demo = null }: { demo?: Catalogo | null }) {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(demo);
  const [sinTabla, setSinTabla] = useState(false);
  const [editado, setEditado] = useState<Partial<Record<Tool, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("nanobanana");
  const [borrador, setBorrador] = useState<Borrador | null>(demo ? aBorrador(demo.nanobanana) : null);
  const [guardando, setGuardando] = useState(false);

  /** Tras guardar: vuelve a leer la tabla y se queda en la herramienta `sel`. */
  const recargar = (sel: Tool) => {
    hubPrismaHerramientas().then((r) => {
      if (!r.ok) return setError(r.error);
      setError(null);
      setCatalogo(r.catalogo);
      setSinTabla(r.sinTabla);
      setEditado(r.editado);
      setBorrador(aBorrador(r.catalogo[sel]));
    });
  };
  // La primera lectura (la demo ya trae su catálogo). `vivo`: si se cierra la pestaña antes de que
  // responda, la respuesta tardía no pisa nada.
  useEffect(() => {
    if (demo) return;
    let vivo = true;
    hubPrismaHerramientas().then((r) => {
      if (!vivo) return;
      if (!r.ok) return setError(r.error);
      setCatalogo(r.catalogo);
      setSinTabla(r.sinTabla);
      setEditado(r.editado);
      setBorrador(aBorrador(r.catalogo.nanobanana));
    });
    return () => {
      vivo = false;
    };
  }, [demo]);

  const sucio = !!catalogo && !!borrador && JSON.stringify(borrador) !== JSON.stringify(aBorrador(catalogo[tool]));
  const v = borrador ? validarFicha(tool, aEntrada(tool, borrador)) : null;
  // Con los cambios aún sin guardar: el mismo cálculo que hará el estudio.
  const catVista = catalogo && v?.ok ? { ...catalogo, [tool]: catalogoDesdeFilas([v.fila])[tool] } : catalogo;
  const casos = catVista ? comoElige(catVista, tool) : [];
  const antes = catalogo ? comoElige(catalogo, tool) : [];

  const elegir = (t: Tool) => {
    if (t === tool || !catalogo) return;
    if (sucio && !window.confirm(`Hay cambios sin guardar en ${TOOL_INFO[tool].nombre}. ¿Descartarlos?`)) return;
    setTool(t);
    setBorrador(aBorrador(catalogo[t]));
  };
  const set = <K extends keyof Borrador>(k: K, valor: Borrador[K]) => setBorrador((b) => (b ? { ...b, [k]: valor } : b));
  const setModelo = (i: number, cambio: Partial<ModeloB>) => setBorrador((b) => (b ? { ...b, modelos: b.modelos.map((m, j) => (j === i ? { ...m, ...cambio } : m)) } : b));

  const guardar = async () => {
    if (!borrador || !v?.ok || demo) return;
    setGuardando(true);
    try {
      const r = await guardarHerramientaPrisma(tool, aEntrada(tool, borrador));
      if (!r.ok) return toast.error(r.error);
      toast.success(`${TOOL_INFO[tool].nombre}: guardado. La próxima generación ya lo usa.`);
      recargar(tool);
    } finally {
      setGuardando(false);
    }
  };

  const video = TOOL_INFO[tool].video;

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Herramientas</h3>
        <p className="text-xs text-muted-foreground">
          Lo que Prisma sabe de cada herramienta: sus límites, en qué es mejor y sus modelos. Cambiarlo aquí no necesita deploy: la
          siguiente generación ya lo usa. Cuando salga un modelo nuevo o una herramienta mejore en algo, se ajusta aquí con su fuente.
        </p>
      </div>

      {error && <p className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-foreground">{error}</p>}
      {(sinTabla || demo) && (
        <p className="flex items-center gap-1.5 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-foreground">
          <AlertTriangle className="size-3.5 shrink-0 text-status-warning" />
          {demo ? "Demo (sólo desarrollo): los valores del código, sin guardar." : "Falta aplicar la migración 0071: estos son los valores del código y todavía no se pueden guardar."}
        </p>
      )}

      <div role="tablist" aria-label="Herramienta" className="flex flex-wrap gap-1.5">
        {TOOLS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tool === t} onClick={() => elegir(t)} className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors", tool === t ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
            <span className="size-2 rounded-full" style={{ background: TOOL_INFO[t].color }} aria-hidden="true" />
            {TOOL_INFO[t].nombre}
          </button>
        ))}
      </div>

      {!catalogo || !borrador ? (
        !error && <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : (
        <div className="space-y-5 rounded-xl border border-border bg-card p-4">
          <div className="rounded-lg bg-secondary/60 px-3 py-2 text-xs" aria-live="polite">
            <p className="font-medium text-foreground">Así elige Prisma{sucio ? " con tus cambios" : " hoy"}</p>
            <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-3">
              {casos.map((c, i) => (
                <li key={c.cuando}>
                  <span className="text-muted-foreground">{c.cuando} →</span> <strong className="font-medium text-foreground">{c.va}</strong>
                  {antes[i] && antes[i].va !== c.va && <span className="text-status-warning"> (antes {antes[i].va})</span>}
                </li>
              ))}
            </ul>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">En qué es mejor (0–5)</legend>
            <p className="text-xs text-muted-foreground">Prisma sugiere la herramienta con más puntos en lo que pide la idea; en un empate, la de siempre.</p>
            {fortalezasDe(tool).map((k) => (
              <div key={k} className="flex flex-wrap items-center justify-between gap-2">
                <span id={`fortaleza-${k}`} className="text-sm text-foreground">
                  {ETIQUETA_FORTALEZA[k].es}
                  {k === "voz" && !borrador.audio && <span className="ml-1.5 text-xs text-muted-foreground">(sin audio: 0)</span>}
                </span>
                <div role="group" aria-labelledby={`fortaleza-${k}`} className="flex gap-1">
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" aria-pressed={borrador.fortalezas[k] === n} aria-label={`${n} de 5`} disabled={k === "voz" && !borrador.audio && n > 0} onClick={() => set("fortalezas", { ...borrador.fortalezas, [k]: n })} className={cn("size-9 cursor-pointer rounded-md border text-xs tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40", borrador.fortalezas[k] === n ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Límites</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {video && (
                <label className="block text-xs text-muted-foreground">
                  Duraciones (segundos; la primera es la de siempre)
                  <Input value={borrador.duraciones} onChange={(e) => set("duraciones", e.target.value)} className="mt-1 h-8 text-sm" placeholder="8, 6, 4" />
                  {tool === "veo" && <span className="mt-1 block text-[11px]">Con imágenes de referencia Veo siempre genera 8 s: el 8 se queda en la lista.</span>}
                </label>
              )}
              <label className="block text-xs text-muted-foreground">
                Referencias máximas (mín. {refsMinimas(tool)})
                <Input value={borrador.refsMax} onChange={(e) => set("refsMax", e.target.value)} className="mt-1 h-8 text-sm" inputMode="numeric" />
              </label>
              <label className="block text-xs text-muted-foreground">
                Tope de palabras (mín. {MIN_PALABRAS}; vacío = sin tope)
                <Input value={borrador.maxPalabras} onChange={(e) => set("maxPalabras", e.target.value)} className="mt-1 h-8 text-sm" inputMode="numeric" placeholder="sin tope" />
              </label>
              <label className="block text-xs text-muted-foreground">
                Tope de caracteres (vacío = sin tope)
                <Input value={borrador.maxCaracteres} onChange={(e) => set("maxCaracteres", e.target.value)} className="mt-1 h-8 text-sm" inputMode="numeric" placeholder="sin tope" />
              </label>
              <label className="flex items-center justify-between gap-2 self-end rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground">
                Genera voz y sonido
                <Switch checked={borrador.audio} onCheckedChange={(a) => setBorrador((b) => (b ? { ...b, audio: a, fortalezas: a ? b.fortalezas : { ...b.fortalezas, voz: 0 } } : b))} aria-label="Genera voz y sonido" />
              </label>
            </div>
            <div>
              <p id="formatos" className="text-xs text-muted-foreground">Formatos que acepta</p>
              <div role="group" aria-labelledby="formatos" className="mt-1 flex flex-wrap gap-1.5">
                {ASPECTS.map((a) => {
                  const on = borrador.aspects.includes(a);
                  return (
                    <button key={a} type="button" aria-pressed={on} onClick={() => set("aspects", on ? borrador.aspects.filter((x) => x !== a) : ASPECTS.filter((x) => x === a || borrador.aspects.includes(x)))} className={cn("cursor-pointer rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors", on ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
                      {a}
                    </button>
                  );
                })}
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Modelos</legend>
            <p className="text-xs text-muted-foreground">
              El primero de cada rol es el que Prisma recomienda: <strong className="font-medium text-foreground">rápido</strong> para iterar,{" "}
              <strong className="font-medium text-foreground">fino</strong> para cerrar (texto exacto, logos, voz). Los demás sólo salen en &quot;¿en cuál lo generaste?&quot;.
            </p>
            {borrador.modelos.map((m, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-border/70 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_8rem_auto]">
                  <label className="block text-xs text-muted-foreground">
                    Id (el que da la herramienta)
                    <Input value={m.id} onChange={(e) => setModelo(i, { id: e.target.value })} className="mt-1 h-8 font-mono text-sm" placeholder="gpt-image-3" />
                  </label>
                  <label className="block text-xs text-muted-foreground">
                    Nombre
                    <Input value={m.etiqueta} onChange={(e) => setModelo(i, { etiqueta: e.target.value })} className="mt-1 h-8 text-sm" maxLength={60} />
                  </label>
                  <label className="block text-xs text-muted-foreground">
                    Rol
                    <select value={m.rol} onChange={(e) => setModelo(i, { rol: e.target.value as RolModelo })} className={selectCls}>
                      {ROLES_MODELO.map((r) => (
                        <option key={r} value={r}>
                          {r === "rapido" ? "Rápido" : "Fino"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={() => set("modelos", borrador.modelos.filter((_, j) => j !== i))} aria-label={`Quitar ${m.etiqueta || "modelo"}`} className="self-end rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-xs text-muted-foreground">
                    Cómo llegar (ES)
                    <Textarea value={m.es} onChange={(e) => setModelo(i, { es: e.target.value })} rows={2} maxLength={300} className="mt-1 text-sm" />
                  </label>
                  <label className="block text-xs text-muted-foreground">
                    How to get there (EN)
                    <Textarea value={m.en} onChange={(e) => setModelo(i, { en: e.target.value })} rows={2} maxLength={300} className="mt-1 text-sm" />
                  </label>
                </div>
                <label className="block text-xs text-muted-foreground">
                  Página del modelo en Higgsfield (el botón &quot;Abrir&quot; la usa; vacío = la de la herramienta)
                  <Input value={m.url} onChange={(e) => setModelo(i, { url: e.target.value })} className="mt-1 h-8 font-mono text-sm" type="url" maxLength={300} placeholder="https://higgsfield.ai/ai/image?model=…" />
                </label>
                {/* Paso 2: lo que cuesta un intento en NUESTRO plan (Prisma lo usa para desempatar y para el estimado). */}
                <div className="grid items-end gap-2 sm:grid-cols-[auto_auto_1fr_1fr_1fr]">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={m.conCosto} onCheckedChange={(on) => setModelo(i, { conCosto: on })} aria-label={`Sabemos el costo de ${m.etiqueta || "este modelo"}`} />
                    Costo conocido
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={m.ilimitado} disabled={!m.conCosto} onCheckedChange={(on) => setModelo(i, { ilimitado: on })} aria-label={`${m.etiqueta || "Este modelo"} es ilimitado en nuestro plan`} />
                    Ilimitado en el plan
                  </label>
                  {(["tipico", "min", "max"] as const).map((k) => (
                    <label key={k} className="block text-xs text-muted-foreground">
                      {k === "tipico" ? "Créditos típicos" : k === "min" ? "Mínimo" : "Máximo"}
                      <Input value={m[k]} onChange={(e) => setModelo(i, { [k]: e.target.value })} disabled={!m.conCosto || m.ilimitado} className="mt-1 h-8 text-sm" inputMode="decimal" placeholder="sin dato" />
                    </label>
                  ))}
                </div>
                <label className="block text-xs text-muted-foreground">
                  Créditos por duración (del botón Generate) — <span className="font-mono">segundos=720p/1080p/4K</span> (o <span className="font-mono">480p/720p/1080p/4K</span>), separados por coma; &quot;-&quot; si no existe esa resolución. Vacío = se usa el típico.
                  <Input value={m.tabla} onChange={(e) => setModelo(i, { tabla: e.target.value })} disabled={!m.conCosto || m.ilimitado} className="mt-1 h-8 font-mono text-sm" maxLength={1500} placeholder="4=29/29/44, 6=44/44/66, 8=58/58/88" />
                </label>
              </div>
            ))}
            <Button size="sm" variant="outline" className="gap-1.5" disabled={borrador.modelos.length >= MAX_MODELOS} onClick={() => set("modelos", [...borrador.modelos, { id: "", etiqueta: "", rol: "fino", es: "", en: "", url: "", conCosto: false, ilimitado: false, tipico: "", min: "", max: "", tabla: "" }])}>
              <Plus className="size-3.5" /> Agregar modelo
            </Button>
          </fieldset>

          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-3">Fuente</legend>
            <label className="block text-xs text-muted-foreground sm:col-span-2">
              Liga (la doc o el anuncio del proveedor)
              <Input value={borrador.fuenteUrl} onChange={(e) => set("fuenteUrl", e.target.value)} className="mt-1 h-8 text-sm" type="url" placeholder="https://…" />
            </label>
            <label className="block text-xs text-muted-foreground">
              Fecha de la fuente
              <Input value={borrador.fuenteFecha} onChange={(e) => set("fuenteFecha", e.target.value)} className="mt-1 h-8 text-sm" type="date" />
            </label>
          </fieldset>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
            <p className={cn("text-xs", v && !v.ok ? "text-destructive" : "text-muted-foreground")} role={v && !v.ok ? "alert" : undefined}>
              {v && !v.ok ? v.error : sucio ? "Cambios sin guardar." : editado[tool] ? `Editado el ${fecha(editado[tool] as string)}.` : "Valores del código."}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setBorrador(aBorrador(CATALOGO_BASE[tool]))} title="Rellena el formulario con los valores del código (no guarda)">
                <RotateCcw className="size-3.5" /> Valores del código
              </Button>
              <Button size="sm" onClick={guardar} disabled={guardando || !sucio || !v?.ok || !!demo || sinTabla}>
                {guardando ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

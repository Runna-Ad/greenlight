"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Upload, Trash2, Building2, Plus, Sparkles, X, Type, Loader2, Lock, Users } from "lucide-react";
import { toast } from "sonner";

import { subirLogoMarca, quitarLogoMarca, crearMarca, eliminarMarca, subirTipografiaCliente, borrarTipografia, cambiarExclusiva } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import type { ClienteConMarcas, MarcaLogo, TipografiaGuardada, TipografiasEstado } from "@/lib/admin-tipos";
import { TIPOGRAFIA_MAX_BYTES } from "@/lib/prisma/formatos/tipografias";
import type { PresetGuardado } from "@/lib/prisma/preset";
import { PresetPrismaEditor, resumenPreset } from "./prisma-preset";
import { prismaActivo } from "@/lib/prisma/flags";

/**
 * Panel "Marcas": sube el logo de cada sub-marca. Un cliente tiene varias marcas
 * (DiDi → Card / Préstamos) y cada una lleva su propio logo, que aparece en la
 * cabecera de la tarea. Sube/reemplaza/quita, guardado inmediato.
 */
export function MarcasTab({ clientes: inicial, tipografiasGoogle }: { clientes: ClienteConMarcas[]; tipografiasGoogle: TipografiasEstado }) {
  const [clientes, setClientes] = useState(inicial);
  const [google, setGoogle] = useState(tipografiasGoogle);

  const setLogo = (marcaId: string, logo_url: string | null) =>
    setClientes((prev) =>
      prev.map((c) => ({
        ...c,
        marcas: c.marcas.map((m) => (m.id === marcaId ? { ...m, logo_url } : m)),
      })),
    );

  const setPreset = (marcaId: string, prisma_preset: PresetGuardado) =>
    setClientes((prev) =>
      prev.map((c) => ({
        ...c,
        marcas: c.marcas.map((m) => (m.id === marcaId ? { ...m, prisma_preset } : m)),
      })),
    );

  const setTipos = (clientId: string, cambio: (antes: TipografiaGuardada[]) => TipografiaGuardada[]) =>
    setClientes((prev) => prev.map((c) => (c.id === clientId && Array.isArray(c.tipografias) ? { ...c, tipografias: cambio(c.tipografias) } : c)));

  const addMarca = (clientId: string, marca: MarcaLogo) =>
    setClientes((prev) => prev.map((c) => (c.id === clientId ? { ...c, marcas: [...c.marcas, marca] } : c)));
  const removeMarca = (marcaId: string) =>
    setClientes((prev) => prev.map((c) => ({ ...c, marcas: c.marcas.filter((m) => m.id !== marcaId) })));

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">Marcas y logos</h2>
      <p className="mb-4 mt-0.5 text-sm text-muted-foreground">
        El logo de cada marca aparece en la cabecera de sus tareas. Un cliente puede
        tener varias marcas (p. ej. DiDi Card y DiDi Préstamos), cada una con el suyo.
        PNG/JPG/WebP con fondo transparente se ven mejor.
        {prismaActivo() && (
          <>
            {" "}El botón <strong>Prisma</strong> guarda lo que la marca le dice a HÜE Prisma en cada prompt: paleta, tono,
            qué evitar y formato por default.
          </>
        )}
      </p>

      {clientes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Todavía no hay clientes con marcas.
        </p>
      ) : (
        <div className="space-y-5">
          {clientes.map((c) => (
            <section key={c.id} className="rounded-xl border border-border bg-card shadow-sm">
              <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
                <Building2 className="size-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">{c.name}</span>
                <span className="text-[11px] text-muted-foreground">/{c.slug}</span>
              </header>
              {c.marcas.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-muted-foreground/70">
                  Este cliente no tiene marcas.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {c.marcas.map((m) => (
                    <li key={m.id}>
                      <MarcaRow marca={m} onLogo={setLogo} onDelete={removeMarca} onPreset={setPreset} />
                    </li>
                  ))}
                </ul>
              )}
              <AgregarMarca clientId={c.id} onCreated={(m) => addMarca(c.id, m)} />
              {prismaActivo() && <TipografiasSeccion cliente={c} tipos={c.tipografias} onCambio={(f) => setTipos(c.id, f)} />}
            </section>
          ))}
        </div>
      )}
      {prismaActivo() && (
        <section className="mt-5 rounded-xl border border-border bg-card shadow-sm">
          <TipografiasSeccion cliente={null} tipos={google} onCambio={(f) => setGoogle((g) => (Array.isArray(g) ? f(g) : g))} />
        </section>
      )}
    </div>
  );
}

function MarcaRow({
  marca,
  onLogo,
  onDelete,
  onPreset,
}: {
  marca: MarcaLogo;
  onLogo: (marcaId: string, logoUrl: string | null) => void;
  onDelete: (marcaId: string) => void;
  onPreset: (marcaId: string, preset: PresetGuardado) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [editPreset, setEditPreset] = useState(false);

  const borrarMarca = () =>
    start(async () => {
      const res = await eliminarMarca(marca.id);
      if (!res.ok) {
        toast.error(res.error);
        setConfirmarBorrar(false);
        return;
      }
      toast.success(`Marca ${marca.name} borrada.`);
      onDelete(marca.id);
    });

  const subir = (file: File) =>
    start(async () => {
      const form = new FormData();
      form.append("file", file);
      const res = await subirLogoMarca(marca.id, form);
      if (!res.ok) toast.error(res.error);
      else {
        onLogo(marca.id, res.logoUrl);
        toast.success(`Logo de ${marca.name} actualizado.`);
      }
    });

  const quitar = () =>
    start(async () => {
      const res = await quitarLogoMarca(marca.id);
      if (!res.ok) toast.error(res.error);
      else {
        onLogo(marca.id, null);
        toast.success(`Logo de ${marca.name} quitado.`);
      }
    });

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3">
        {marca.logo_url ? (
          <div className="relative shrink-0">
            <Image
              src={marca.logo_url}
              alt={marca.name}
              width={44}
              height={44}
              unoptimized
              className="size-11 rounded-md border border-border bg-secondary object-contain p-0.5"
            />
            {/* Quitar el LOGO (no la marca) vive aquí, como ✕ en la miniatura — así el
                único ícono de basura de la fila significa sólo "borrar marca". */}
            <button
              type="button"
              onClick={quitar}
              disabled={pending}
              aria-label={`Quitar logo de ${marca.name}`}
              title="Quitar logo"
              className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:bg-secondary hover:text-status-corrections disabled:opacity-50"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-secondary text-xs font-bold text-muted-foreground">
            {marca.name.slice(0, 2).toUpperCase()}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{marca.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {marca.logo_url ? "Logo cargado" : "Sin logo"}
            {prismaActivo() && ` · ${resumenPreset(marca.prisma_preset)}`}
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) subir(f);
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          className="gap-1.5"
        >
          <Upload className="size-3.5" />
          {marca.logo_url ? "Reemplazar" : "Subir logo"}
        </Button>
        {/* Sólo cuando HÜE Prisma está encendido (flag): sin él, el preset no lo lee nadie. */}
        {prismaActivo() && (
          <Button
            size="sm"
            variant={editPreset ? "secondary" : "outline"}
            disabled={pending}
            onClick={() => setEditPreset((v) => !v)}
            aria-expanded={editPreset}
            className="gap-1.5"
          >
            <Sparkles className="size-3.5" />
            Prisma
          </Button>
        )}
        {confirmarBorrar ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setConfirmarBorrar(false)}
              disabled={pending}
              aria-label="Cancelar"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
            >
              <X className="size-4" />
            </button>
            <Button size="sm" variant="destructive" disabled={pending} onClick={borrarMarca}>
              Borrar marca
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmarBorrar(true)}
            disabled={pending}
            aria-label={`Borrar marca ${marca.name}`}
            title="Borrar marca"
            className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      {editPreset && (
        <PresetPrismaEditor
          marcaId={marca.id}
          marcaNombre={marca.name}
          inicial={marca.prisma_preset}
          onGuardado={(p) => {
            onPreset(marca.id, p);
            setEditPreset(false);
          }}
          onCerrar={() => setEditPreset(false)}
        />
      )}
    </>
  );
}

/**
 * Una sección de la biblioteca de tipografías de HÜE Prisma › Formatos. Con `cliente`: las que el equipo sube en su
 * tarjeta, cada una "sólo de este cliente" (exclusiva) o "para todos". Sin `cliente`: las gratuitas que Formatos trajo
 * solo de Google Fonts (sólo se ven y se borran). Formatos las trae por su nombre cuando un PSD las usa.
 */
function TipografiasSeccion({
  cliente,
  tipos,
  onCambio,
}: {
  cliente: { id: string; name: string } | null;
  tipos: TipografiasEstado;
  onCambio: (cambio: (antes: TipografiaGuardada[]) => TipografiaGuardada[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const botonSubir = useRef<HTMLButtonElement>(null);
  const botonCancelar = useRef<HTMLButtonElement>(null);
  const [pending, start] = useTransition();
  const [progreso, setProgreso] = useState<{ va: number; de: number } | null>(null);
  const [porBorrar, setPorBorrar] = useState<string | null>(null);
  /** Lo que se sube ahora: sólo de este cliente (lo normal en la tarjeta de un cliente: su letra de marca) o para todos. */
  const [soloSuyas, setSoloSuyas] = useState(true);
  /** Filas cuyo "Sólo / Para todos" espera al servidor. */
  const [volteando, setVolteando] = useState<Set<string>>(() => new Set());
  /** A dónde va el foco cuando termina lo que estaba en curso (el botón estaba ocupado o su fila desapareció). */
  const focoAlTerminar = useRef<"subir" | null>(null);
  const tituloId = `tipos-${cliente?.id ?? "google"}`;
  const soloId = `tipos-solo-${cliente?.id ?? "google"}`;

  // Al pedir confirmación, el foco pasa a "Cancelar" (el botón de basura que lo tenía desaparece).
  useEffect(() => {
    if (porBorrar) botonCancelar.current?.focus();
  }, [porBorrar]);
  useEffect(() => {
    if (pending || !focoAlTerminar.current) return;
    focoAlTerminar.current = null;
    botonSubir.current?.focus();
  }, [pending]);

  const agregar = (t: TipografiaGuardada) =>
    onCambio((antes) => (antes.some((x) => x.id === t.id) ? antes : [...antes, t].sort((a, b) => a.archivo.localeCompare(b.archivo))));

  const subir = (c: { id: string; name: string }, archivos: File[]) =>
    start(async () => {
      const nuevas: string[] = [];
      const repetidas: string[] = [];
      const malas: string[] = [];
      let paraTodas: string | null = null;
      try {
        // Una por una: cada archivo es una llamada chica, y un error de un archivo no detiene a los demás.
        for (const [i, f] of archivos.entries()) {
          setProgreso({ va: i + 1, de: archivos.length });
          if (f.size > TIPOGRAFIA_MAX_BYTES) {
            malas.push(`«${f.name}» pasa de 4 MB`);
            continue;
          }
          try {
            // La misma prueba que hará Formatos al usarla: si este navegador no la puede cargar, no se guarda.
            await new FontFace("prueba-tipografia", await f.arrayBuffer()).load();
          } catch {
            malas.push(`«${f.name}» no es una tipografía que el navegador pueda usar`);
            continue;
          }
          const form = new FormData();
          form.append("file", f);
          let res: Awaited<ReturnType<typeof subirTipografiaCliente>>;
          try {
            res = await subirTipografiaCliente(c.id, form, soloSuyas);
          } catch (err) {
            console.error("[marcas] subir tipografía", err);
            malas.push(`«${f.name}» no se pudo subir (conexión)`);
            continue;
          }
          if (!res.ok) {
            // Un error que no es de ESE archivo (permiso, tope, falta la tabla) vale para todos: se dice una vez y se para.
            if (res.todas) {
              paraTodas = res.error;
              break;
            }
            malas.push(res.error);
            continue;
          }
          (res.repetida ? repetidas : nuevas).push(res.tipografia.archivo);
          agregar(res.tipografia);
        }
      } finally {
        setProgreso(null);
        focoAlTerminar.current = "subir";
        if (nuevas.length) toast.success(nuevas.length === 1 ? `Tipografía de ${c.name} guardada.` : `${nuevas.length} tipografías de ${c.name} guardadas.`);
        if (repetidas.length) toast.info(repetidas.length === 1 ? `«${repetidas[0]}» ya estaba guardada.` : `${repetidas.length} ya estaban guardadas.`);
        if (malas.length) toast.error(malas.length === 1 ? `${malas[0]}.` : `${malas.length} no se guardaron: ${malas.slice(0, 3).join(" · ")}${malas.length > 3 ? ` +${malas.length - 3}` : ""}.`);
        if (paraTodas) toast.error(paraTodas);
      }
    });

  // Al instante en pantalla; si el servidor no lo guarda, vuelve como estaba y se dice.
  // Al instante en pantalla; si el servidor no lo guarda, vuelve como estaba y se dice. Su botón no se vuelve a
  // pulsar hasta que el servidor conteste (dos clics no se cruzan).
  const voltearExclusiva = (c: { id: string; name: string }, t: TipografiaGuardada) => {
    if (volteando.has(t.id)) return;
    const exclusiva = !t.exclusiva;
    const poner = (v: boolean) => onCambio((antes) => antes.map((x) => (x.id === t.id ? { ...x, exclusiva: v } : x)));
    poner(exclusiva);
    setVolteando((s) => new Set(s).add(t.id));
    void cambiarExclusiva(t.id, exclusiva)
      .then((res) => {
        if (res.ok) return void toast.success(exclusiva ? `«${t.archivo}»: sólo para ${c.name}.` : `«${t.archivo}»: para todos los clientes.`);
        poner(!exclusiva);
        toast.error(res.error);
      })
      .catch((err) => {
        console.error("[marcas] exclusiva de tipografía", err);
        poner(!exclusiva);
        toast.error(`«${t.archivo}» no se pudo cambiar (conexión). Inténtalo otra vez.`);
      })
      .finally(() =>
        setVolteando((s) => {
          const n = new Set(s);
          n.delete(t.id);
          return n;
        }),
      );
  };

  const borrar = (t: TipografiaGuardada) =>
    start(async () => {
      try {
        const res = await borrarTipografia(t.id);
        if (!res.ok) return void toast.error(res.error);
        onCambio((antes) => antes.filter((x) => x.id !== t.id));
        toast.success(`«${t.archivo}» borrada.`);
      } catch (err) {
        console.error("[marcas] borrar tipografía", err);
        toast.error(`«${t.archivo}» no se pudo borrar (conexión). Inténtalo otra vez.`);
      } finally {
        setPorBorrar(null);
        // Su fila (o su confirmación) desaparece: el foco pasa a "Subir tipografías" cuando deje de estar ocupado.
        focoAlTerminar.current = "subir";
      }
    });

  return (
    <div className={cliente ? "border-t border-border/60 px-4 py-3" : "px-4 py-3"}>
      <div className="flex flex-wrap items-center gap-2">
        <Type className="size-4 text-muted-foreground" aria-hidden="true" />
        <h3 id={tituloId} className="text-sm font-medium text-foreground">
          {cliente ? `Tipografías de ${cliente.name} para Formatos` : "Tipografías gratuitas (Google Fonts)"}
        </h3>
        {Array.isArray(tipos) && <span className="text-[11px] text-muted-foreground">{tipos.length === 1 ? "1 archivo" : `${tipos.length} archivos`}</span>}
        {cliente && Array.isArray(tipos) && (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <label htmlFor={soloId} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-foreground">
              <input id={soloId} type="checkbox" checked={soloSuyas} onChange={(e) => setSoloSuyas(e.target.checked)} className="size-4 cursor-pointer accent-primary" />
              Sólo para {cliente.name}
            </label>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".otf,.ttf,font/otf,font/ttf"
              className="hidden"
              onChange={(e) => {
                const archivos = [...(e.target.files ?? [])];
                e.target.value = "";
                if (archivos.length) subir(cliente, archivos);
              }}
            />
            {/* aria-disabled (no disabled) mientras trabaja: así no pierde el foco y se puede volver a él al terminar. */}
            <Button
              ref={botonSubir}
              size="sm"
              variant="outline"
              aria-disabled={pending || undefined}
              aria-busy={pending}
              onClick={() => pending || inputRef.current?.click()}
              className="gap-1.5 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Upload className="size-3.5" aria-hidden="true" />}
              {progreso ? `Subiendo ${progreso.va} de ${progreso.de}…` : "Subir tipografías"}
            </Button>
          </div>
        )}
      </div>
      {tipos === "sin-tabla" ? (
        <p className="mt-1 text-[13px] text-muted-foreground">Todavía no se pueden guardar: falta aplicar en la base el cambio 0079.</p>
      ) : tipos === "error" ? (
        <p role="alert" className="mt-1 text-[13px] text-foreground">
          No se pudieron leer las tipografías guardadas. Recarga la página.
        </p>
      ) : (
        <>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {cliente
              ? `Los .otf o .ttf que usan los PSD de ${cliente.name}, propios o comerciales. Formatos las busca por su nombre. Las marcadas «Sólo ${cliente.name}» se usan únicamente cuando en Formatos se elige ${cliente.name}; las demás sirven para cualquier cliente.`
              : "Formatos las trae solo la primera vez que un PSD usa una tipografía gratuita que nadie subió, y desde entonces sirven para todos. Si borras una, se vuelve a traer cuando otro PSD la use."}
          </p>
          {tipos.length > 0 && (
            <ul aria-labelledby={tituloId} className="mt-2 divide-y divide-border/60 rounded-lg border border-border/60">
              {tipos.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground" title={t.archivo}>
                      {t.archivo}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground" title={t.nombres.join(", ")}>
                      {t.nombres.slice(0, 4).join(", ")}
                      {t.nombres.length > 4 ? ` +${t.nombres.length - 4}` : ""} · {Math.max(1, Math.round(t.bytes / 1024))} KB
                    </p>
                  </div>
                  {cliente && porBorrar !== t.id && (
                    // El estado se lee en la etiqueta (no sólo en el color) y aria-pressed lo dice al lector de pantalla.
                    <button
                      type="button"
                      onClick={() => voltearExclusiva(cliente, t)}
                      disabled={pending || volteando.has(t.id)}
                      aria-pressed={t.exclusiva}
                      aria-label={`Sólo para ${cliente.name}: ${t.archivo}`}
                      title={t.exclusiva ? `Sólo se usa en anuncios de ${cliente.name}. Clic: para todos.` : `Sirve para cualquier cliente. Clic: sólo ${cliente.name}.`}
                      className={`inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${t.exclusiva ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                    >
                      {t.exclusiva ? <Lock className="size-3" aria-hidden="true" /> : <Users className="size-3" aria-hidden="true" />}
                      {t.exclusiva ? `Sólo ${cliente.name}` : "Para todos"}
                    </button>
                  )}
                  {porBorrar === t.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        ref={botonCancelar}
                        type="button"
                        onClick={() => setPorBorrar(null)}
                        disabled={pending}
                        aria-label={`Cancelar: no borrar ${t.archivo}`}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
                      >
                        <X className="size-4" />
                      </button>
                      <Button size="sm" variant="destructive" disabled={pending} onClick={() => borrar(t)} aria-label={`Borrar ${t.archivo}`}>
                        Borrar tipografía
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPorBorrar(t.id)}
                      disabled={pending}
                      aria-label={`Borrar tipografía ${t.archivo}`}
                      title="Borrar tipografía"
                      className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Alta rápida de una marca dentro de la tarjeta de su cliente. */
function AgregarMarca({
  clientId,
  onCreated,
}: {
  clientId: string;
  onCreated: (marca: MarcaLogo) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [pending, start] = useTransition();

  const crear = () =>
    start(async () => {
      const res = await crearMarca(clientId, nombre);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onCreated(res.marca);
      setNombre("");
      toast.success(`Marca ${res.marca.name} creada.`);
    });

  return (
    <div className="flex items-center gap-2 border-t border-border/60 px-4 py-2.5">
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && nombre.trim() && !pending) crear();
        }}
        placeholder="Nueva marca…"
        className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button size="sm" variant="outline" disabled={pending || !nombre.trim()} onClick={crear} className="gap-1.5">
        <Plus className="size-3.5" /> Agregar
      </Button>
    </div>
  );
}

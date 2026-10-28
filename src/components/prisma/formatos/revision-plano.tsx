"use client";

/**
 * HÜE Prisma › Formatos, imagen plana (B28) — la revisión de lo que leyó la IA antes de seguir (Pedro, 2026-10-27:
 * "review screen always"). La imagen con una caja por elemento y, al lado, la lista: su rol, "no es un elemento" (se
 * queda en el fondo), y en los textos sus letras (por si la IA leyó mal una) y si se reescriben o van como imagen. Los
 * textos se prueban contra las tipografías cargadas (las del cliente elegido) con la misma prueba que un PSD.
 * "Continuar" arma el maestro (`maestroDePlano`) y la página sigue como con un PSD.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tx, type Lang } from "@/lib/prisma/copy";
import { FP, FPL, rellenar } from "@/lib/prisma/formatos/copy";
import { ROLES_LECTURA, TEXTO_LEIDO_MAX, limpiarLetras, maestroDePlano, medirPlano, type RolLeido } from "@/lib/prisma/formatos/plano";
import { TRANSFERIR_MAX_BYTES, prepararMaestro, type MaestroListo } from "@/lib/prisma/formatos/listo";
import { claveTexto, type CambiosTexto } from "@/lib/prisma/formatos/cambios-texto";
import type { TextoCapa } from "@/lib/prisma/formatos/textos";
import { ajustarTextosPlano, type NotaTextoPlano, type Tipografias } from "./escritura";
import type { Plano } from "./plano-lector";

const BOTON = "min-h-9 text-[13px] pointer-coarse:min-h-11";
/** Un color por rol, con texto blanco encima a 4.5:1 o más. */
const COLOR: Record<RolLeido, string> = { BRAND: "#7c3aed", TITULO: "#dc2626", SUBTITULO: "#c2410c", CTA: "#15803d", HERO: "#2563eb", FOOTER: "#0e7490", OTRO: "#6b7280" };
const sinExtension = (archivo: string) => archivo.replace(/\.(psd|png|jpe?g|webp)$/i, "");
/** Ids del DOM que no chocan con otros de la página (el id de un elemento sale del label de la IA: "titulo"). */
const idFila = (id: string) => `plano-fila-${id}`;
const idQuitar = (id: string) => `plano-quitar-${id}`;
const idDevolver = (id: string) => `plano-devolver-${id}`;
type Ajuste = { para: object; tipos: Tipografias; capas: Map<string, TextoCapa>; notas: NotaTextoPlano[] };

export function RevisionPlano({ plano, tipos, cliente, selectorCliente, trayendo, lang, alContinuar, alCancelar }: {
  plano: Plano;
  tipos: Tipografias;
  cliente: string;
  selectorCliente: ReactNode;
  trayendo: boolean;
  lang: Lang;
  /** `cambios`: los textos que se escribieron distinto de lo que leyó la IA, como los del editor (todas las medidas). */
  alContinuar: (maestro: MaestroListo, cambios: CambiosTexto) => void;
  alCancelar: () => void;
}) {
  const [quitados, setQuitados] = useState<ReadonlySet<string>>(() => new Set());
  const [comoImagen, setComoImagen] = useState<ReadonlySet<string>>(() => new Set());
  const [letras, setLetras] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [roles, setRoles] = useState<ReadonlyMap<string, RolLeido>>(() => new Map());
  const [elegido, setElegido] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState<Ajuste | null>(null);
  /** Se pidió «Continuar» mientras se probaban las tipografías (p. ej. justo después de corregir letras). */
  const [quiereSeguir, setQuiereSeguir] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);
  /** Lo que se le dice al lector de pantalla al quitar o devolver un elemento. */
  const [anuncio, setAnuncio] = useState("");
  /** El control que recibe el foco después de quitar o devolver (el que tenía el foco desaparece). */
  const foco = useRef<string | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);

  // La revisión aparece cuando termina la lectura y el botón de cancelar que tenía el foco ya no existe.
  useEffect(() => titulo.current?.focus(), []);

  // Quitar un elemento cambia el fondo: se vuelve a medir. Sin cambios, la medida de la lectura. Si no se puede (sin
  // memoria), se queda la de la lectura y se dice. Las letras escritas NO se miden: la medida y la prueba de tipografías
  // son contra lo que se VE en la imagen (lo que leyó la IA); lo escrito distinto entra como un cambio de texto, igual
  // que en el editor (2026-10-28: un texto nuevo medido contra la imagen nunca pasaba la prueba y se quedaba la imagen).
  const remedido = useMemo(() => {
    if (!quitados.size) return { medido: plano.medido, fallo: false };
    const leidos = plano.leidos
      .filter((e) => !quitados.has(e.id))
      .map((e) => ({ ...e, sobre: e.sobre && !quitados.has(e.sobre) ? e.sobre : null }));
    try {
      return { medido: medirPlano(plano.img, leidos), fallo: false };
    } catch (err) {
      console.error("[formatos-psd] volver a separar la imagen plana", err);
      return { medido: plano.medido, fallo: true };
    }
  }, [plano, quitados]);
  const medido = remedido.medido;
  const elementos = useMemo(() => medido.elementos.map((m) => ({ ...m, rol: roles.get(m.id) ?? m.rol })), [medido, roles]);

  // Las tipografías se prueban fuera del render (≈1 s con muchas): primero se pinta «Probando…». Si la prueba falla,
  // todo va como imagen y la revisión no se queda esperando.
  useEffect(() => {
    if (!tipos.size) return;
    const id = window.setTimeout(() => {
      try {
        setAjuste({ para: medido, tipos, ...ajustarTextosPlano(medido.elementos, plano.img.w, tipos) });
      } catch (err) {
        console.error("[formatos-psd] probar tipografías en la imagen plana", err);
        setAjuste({ para: medido, tipos, capas: new Map(), notas: [] });
      }
    }, 30);
    return () => window.clearTimeout(id);
  }, [medido, tipos, plano.img.w]);
  const vigente = ajuste && ajuste.para === medido && ajuste.tipos === tipos ? ajuste : null;
  const probando = tipos.size > 0 && !vigente;
  const nota = (id: string) => vigente?.notas.find((n) => n.id === id);

  const textos = elementos.filter((m) => m.tipo === "texto");
  const piezas = new Set(elementos.filter((m) => !m.sobre).map((m) => m.rol)).size;
  const numero = new Map(plano.leidos.map((e, i) => [e.id, i + 1]));
  /** Cómo se nombra un elemento en la lista y en los avisos: su número y lo que es (o sus primeras letras). */
  const nombre = (id: string) => {
    const e = plano.leidos.find((x) => x.id === id), n = String(numero.get(id) ?? id);
    if (!e) return n;
    const letrasDe = (letras.get(id) ?? e.texto).replace(/\s+/g, " ");
    return `${n} · ${e.tipo === "texto" && letrasDe ? `«${letrasDe.length > 24 ? `${letrasDe.slice(0, 23)}…` : letrasDe}»` : tx(FPL.tipo[e.tipo], lang)}`;
  };
  // Sin cliente igual se prueban las tipografías que este navegador recuerda (la página las carga solas).
  const estado = quiereSeguir && probando
    ? tx(FPL.siguiendo, lang)
    : trayendo
      ? tx(FPL.trayendo, lang)
      : !tipos.size
        ? tx(cliente ? FPL.sinFuentes : FPL.sinCliente, lang)
        : probando
          ? tx(FPL.probando, lang)
          : !cliente
            ? tx(FPL.sinClienteRecordadas, lang)
            : null;
  // Lo que la medida dejó dicho (un elemento que no se encontró, el fondo que dejó de ser liso al quitar algo), con
  // el número de la lista en vez del id de la IA ("headline_msi: …" → "Elemento 5 · «3 MSI»: …").
  const avisos = [
    ...(remedido.fallo ? [tx(FPL.noSeVolvioAMedir, lang)] : []),
    ...medido.avisos.map((a) => a.replace(/^([a-z0-9_]+): /, (todo, id: string) => (numero.has(id) ? `${tx(FPL.elemento, lang)} ${nombre(id)}: ` : todo))),
  ];

  const continuar = () => {
    setFalla(null);
    try {
      const capas = new Map([...(vigente?.capas ?? [])].filter(([id]) => !comoImagen.has(id)));
      const ma = maestroDePlano(sinExtension(plano.archivo), plano.img, elementos, medido.fondo, capas, medido.avisos);
      const { maestro, bytes } = prepararMaestro(ma);
      // El mismo tope que un PSD (psd.worker.ts): más que esto no cabe en el navegador con todo lo que sigue.
      if (bytes > TRANSFERIR_MAX_BYTES) return setFalla(tx(FPL.muyPesada, lang));
      // Sólo de los textos que se reescriben (la capa es el id del elemento, `maestroDePlano`); los que van como imagen
      // ya dicen en su fila que el cambio no se aplica.
      const cambios: Record<string, string> = {};
      for (const [id, v] of letras) {
        const capa = capas.get(id);
        if (capa && v !== capa.texto) cambios[claveTexto({ capa: id, texto: capa })] = v;
      }
      alContinuar(maestro, cambios);
    } catch (err) {
      console.error("[formatos-psd] armar el maestro de la imagen plana", err);
      setFalla(tx(FPL.noSeArmo, lang));
    }
  };
  // «Continuar» mientras se prueban las tipografías no se pierde: sigue en cuanto terminan.
  useEffect(() => {
    if (!quiereSeguir || probando) return;
    const id = window.setTimeout(() => {
      setQuiereSeguir(false);
      if (elementos.length) continuar();
    }, 0);
    return () => window.clearTimeout(id);
  });
  useEffect(() => {
    if (!foco.current) return;
    document.getElementById(foco.current)?.focus();
    foco.current = null;
  });

  const quitar = (id: string) => {
    const i = elementos.findIndex((m) => m.id === id), otro = elementos[i + 1] ?? elementos[i - 1];
    setQuitados((s) => new Set(s).add(id));
    foco.current = otro ? idQuitar(otro.id) : idDevolver(id);
    setAnuncio(rellenar(tx(FPL.quitadoAviso, lang), { e: nombre(id) }));
  };
  const devolver = (id: string) => {
    setQuitados((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    foco.current = idQuitar(id);
    setAnuncio(rellenar(tx(FPL.devueltoAviso, lang), { e: nombre(id) }));
  };
  const alternar = (id: string) =>
    setComoImagen((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const irA = (id: string) => {
    setElegido(id);
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(idFila(id))?.scrollIntoView({ block: "nearest", behavior: quieto ? "auto" : "smooth" });
  };

  return (
    <section className="p-enter space-y-4" aria-labelledby="plano-titulo">
      <div className="max-w-3xl space-y-1">
        <h2 id="plano-titulo" ref={titulo} tabIndex={-1} className="text-base font-semibold text-foreground outline-none">
          {tx(FPL.titulo, lang)}
        </h2>
        <p className="text-sm text-muted-foreground">{tx(FPL.ayuda, lang)}</p>
        <p className="text-xs text-muted-foreground">
          <span className="break-all font-medium text-foreground">{plano.archivo}</span> · {plano.img.w}×{plano.img.h} · {rellenar(tx(FPL.resumen, lang), { n: elementos.length, t: textos.length })}
          {plano.costoUsd !== null && <> · {rellenar(tx(FPL.costo, lang), { c: plano.costoUsd.toFixed(4) })}</>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {selectorCliente}
        {/* Siempre en la página (vacía o no): una región que aparece ya con texto no siempre se anuncia. */}
        <p id="plano-estado" className="flex items-center gap-1.5 text-sm text-muted-foreground empty:hidden" role="status">
          {estado && (
            <>
              {(trayendo || probando) && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {estado}
            </>
          )}
        </p>
        <p className="sr-only" role="status">{anuncio}</p>
      </div>
      {avisos.length > 0 && (
        <div className="flex max-w-3xl gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <ul className="space-y-0.5">
            {avisos.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <figure className="rounded-xl border border-border bg-card p-2 lg:sticky lg:top-4">
          {/* Alto tope: un anuncio vertical entero a la vista mientras se recorre la lista. */}
          <div className="relative mx-auto w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element -- un objectURL local, no una imagen del sitio */}
            <img src={plano.url} alt="" className="block h-auto max-h-[calc(100vh-3rem)] w-auto max-w-full rounded-md" />
            {/* Las cajas repiten la lista (que es la versión para teclado y lector de pantalla). */}
            <svg viewBox={`0 0 ${plano.img.w} ${plano.img.h}`} className="absolute inset-0 size-full" aria-hidden="true">
              {elementos.map((m) => {
                const c = m.solido, n = numero.get(m.id) ?? 0, on = elegido === m.id, k = plano.img.w / 600;
                return (
                  <g key={m.id} className="cursor-pointer" onClick={() => irA(m.id)}>
                    <rect x={c.x} y={c.y} width={c.w} height={c.h} fill={on ? `${COLOR[m.rol]}22` : "transparent"} stroke="#fff" strokeOpacity={0.8} strokeWidth={(on ? 5 : 3.5) * k} />
                    <rect x={c.x} y={c.y} width={c.w} height={c.h} fill="none" stroke={COLOR[m.rol]} strokeWidth={(on ? 3 : 1.5) * k} />
                    <rect x={c.x} y={Math.max(0, c.y - 16 * k)} width={(String(n).length * 8 + 8) * k} height={16 * k} fill={COLOR[m.rol]} />
                    <text x={c.x + 4 * k} y={Math.max(0, c.y - 16 * k) + 12 * k} fontSize={12 * k} fontWeight="700" fill="#fff">{n}</text>
                  </g>
                );
              })}
            </svg>
          </div>
          <figcaption className="sr-only">{rellenar(tx(FPL.imagenAyuda, lang), { n: elementos.length })}</figcaption>
        </figure>

        <div className="space-y-2">
          {!elementos.length && <p className="text-sm text-foreground">{tx(FPL.ninguno, lang)}</p>}
          <p id="plano-letras-ayuda" className="text-xs text-muted-foreground">{tx(FPL.letrasAyuda, lang)}</p>
          <ol className="space-y-2">
            {elementos.map((m) => {
              const n = numero.get(m.id) ?? 0, nt = nota(m.id), esTexto = m.tipo === "texto", imagen = comoImagen.has(m.id);
              // Escrito distinto de lo leído: sólo sale si el texto se reescribe con una tipografía del cliente.
              const cambiado = esTexto && letras.has(m.id), seEscribe = !imagen && !!vigente?.capas.has(m.id);
              const texto = !esTexto ? null
                : imagen ? tx(FPL.textoImagen, lang)
                : !vigente || !nt || nt.fuente === null ? tx(FPL.textoSinFuentes, lang)
                : nt.ok ? rellenar(tx(FPL.textoOk, lang), { f: nt.fuente, d: Math.round((nt.dif ?? 0) * 100) })
                : rellenar(tx(FPL.textoNo, lang), { f: nt.fuente, d: Math.round((nt.dif ?? 0) * 100) });
              return (
                <li
                  key={m.id}
                  id={idFila(m.id)}
                  role="group"
                  aria-labelledby={`${idFila(m.id)}-cab`}
                  aria-current={elegido === m.id ? "true" : undefined}
                  onMouseEnter={() => setElegido(m.id)}
                  onFocus={() => setElegido(m.id)}
                  className={cn("rounded-lg border bg-card p-3", elegido === m.id ? "border-primary ring-1 ring-primary" : "border-border")}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span id={`${idFila(m.id)}-cab`} className="inline-flex items-center gap-2">
                      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded px-1 text-xs font-bold text-white" style={{ background: COLOR[m.rol] }}>
                        <span className="sr-only">{tx(FPL.elemento, lang)} </span>
                        {n}
                      </span>
                      <span className="text-sm font-medium text-foreground">{tx(FPL.tipo[m.tipo], lang)}</span>
                    </span>
                    {m.sobre && <span className="text-xs text-muted-foreground">{rellenar(tx(FPL.sobre, lang), { e: String(numero.get(m.sobre) ?? m.sobre) })}</span>}
                    <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                      {tx(FPL.rol, lang)}
                      <select
                        id={`${idFila(m.id)}-rol`}
                        value={m.rol}
                        onChange={(e) => setRoles((r) => new Map(r).set(m.id, e.target.value as RolLeido))}
                        className="h-8 cursor-pointer rounded-md border border-input bg-background px-1.5 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {ROLES_LECTURA.map((r) => <option key={r} value={r}>{r === "OTRO" ? tx(FPL.otro, lang) : r}</option>)}
                      </select>
                    </label>
                    <Button id={idQuitar(m.id)} variant="ghost" size="sm" className="h-8 text-xs" aria-label={rellenar(tx(FPL.quitarAria, lang), { e: String(n) })} onClick={() => quitar(m.id)}>
                      <X className="size-3.5" aria-hidden="true" /> {tx(FPL.quitar, lang)}
                    </Button>
                  </div>
                  {esTexto && (
                    <div className="mt-2 space-y-1.5">
                      <label className="block text-xs text-muted-foreground" htmlFor={`plano-letras-${m.id}`}>
                        {tx(FPL.letras, lang)}
                      </label>
                      <textarea
                        id={`plano-letras-${m.id}`}
                        key={`${m.id}:${letras.get(m.id) ?? ""}`}
                        defaultValue={letras.get(m.id) ?? m.texto}
                        maxLength={TEXTO_LEIDO_MAX}
                        rows={Math.min(4, Math.max((letras.get(m.id) ?? m.texto).split("\n").length, Math.ceil((letras.get(m.id) ?? m.texto).length / 60)))}
                        aria-describedby="plano-letras-ayuda"
                        onBlur={(e) => {
                          const v = limpiarLetras(e.target.value).slice(0, TEXTO_LEIDO_MAX);
                          // Vacío no es un texto: vuelven sus letras (para quitarlo está «No es un elemento»).
                          if (!v) e.target.value = letras.get(m.id) ?? m.texto;
                          else if (v === m.texto) setLetras((l) => { const n = new Map(l); n.delete(m.id); return n; });
                          else if (v !== letras.get(m.id)) setLetras((l) => new Map(l).set(m.id, v));
                        }}
                        className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="min-w-0">
                          <p className={cn("text-xs", nt && !nt.ok && !imagen ? "text-foreground" : "text-muted-foreground")}>{texto}</p>
                          {cambiado && !probando && (
                            <p className="mt-0.5 flex items-start gap-1 text-xs text-foreground">
                              {!seEscribe && <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-warning" aria-hidden="true" />}
                              {tx(seEscribe ? FPL.cambioOk : FPL.cambioNo, lang)}
                            </p>
                          )}
                        </div>
                        <Button variant="outline" size="sm" className="ml-auto h-8 text-xs" onClick={() => alternar(m.id)}>
                          {imagen ? tx(FPL.comoTexto, lang) : tx(FPL.comoImagen, lang)}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {quitados.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{tx(FPL.quitados, lang)}</span>
              {[...quitados].map((id) => (
                <Button key={id} id={idDevolver(id)} variant="outline" size="sm" className="h-7 text-xs" onClick={() => devolver(id)}>
                  <Undo2 className="size-3" aria-hidden="true" /> {rellenar(tx(FPL.devolver, lang), { e: nombre(id) })}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>

      {falla && (
        <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" /> {falla}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {/* aria-disabled, no disabled: si las tipografías llegan con el foco aquí, Chrome lo mandaría al <body>. Un
            clic mientras se prueban queda pedido (`quiereSeguir`). */}
        <Button
          size="lg"
          className={cn(BOTON, "aria-disabled:cursor-not-allowed aria-disabled:opacity-50")}
          aria-disabled={!elementos.length || quiereSeguir}
          aria-describedby={!elementos.length || probando ? "plano-estado" : undefined}
          onClick={() => {
            if (!elementos.length || quiereSeguir) return;
            if (probando) return setQuiereSeguir(true);
            continuar();
          }}
        >
          {(probando || quiereSeguir) && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {rellenar(tx(piezas === 1 ? FPL.continuarUna : FPL.continuar, lang), { n: piezas })}
        </Button>
        <Button variant="outline" size="lg" className={BOTON} onClick={alCancelar}>
          <X className="size-4" aria-hidden="true" /> {tx(FP.cancelar, lang)}
        </Button>
      </div>
    </section>
  );
}

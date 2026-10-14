"use client";

import { memo, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CircleCheck, Download, FileUp, FlipHorizontal2, Languages, Loader2, Type, X } from "lucide-react";
import { toast } from "sonner";
import { zipSync } from "fflate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tx, type Lang } from "@/lib/prisma/copy";
import { useLang } from "@/components/prisma/use-lang";
import { CANALES, MEDIDAS_EQUIPO, acomodarMedida, es916, esCanal, nombreSalida, sePuedeVoltear, zonaCanal, type Canal, type Lado } from "@/lib/prisma/formatos/acomodo";
import { FP, FP_ERROR, FP_FAMILIA, FX, rellenar } from "@/lib/prisma/formatos/copy";
import { LADO_MAX, LADO_MIN, leerMedidas, limpiarNombre } from "@/lib/prisma/formatos/geometria";
import { LEER_MAX_MS, MEDIDAS_MAX, MESAS_MAX, medidasQueCaben, type MaestroListo, type MensajeWorker, type MesaDescartada, type MesaElegible, type PedidoWorker } from "@/lib/prisma/formatos/listo";
import { PSD_ARCHIVO_MAX } from "@/lib/prisma/formatos/adelgazar";
import type { MotivoPsd } from "@/lib/prisma/formatos/psd";
import { enCola, pintar } from "./pintar";
import { EXTENSIONES_FUENTE, cargarFuentes, fuentesRecordadas, olvidarFuentes, recordarFuentes, revisarTextos, textoEscrito, type Escritura, type Tipografias } from "./escritura";

/**
 * HÜE Prisma › Formatos, puerta PSD. El anuncio llega en Photoshop: un Web Worker lo lee y lo separa en fondo
 * limpio + piezas, y cada medida se pinta aquí mismo en un <canvas>. Nada se sube ni se guarda: no hay base, ni
 * IA, ni costo. Lo que decide DÓNDE va cada pieza es `acomodo.ts` (probado aparte); esta pantalla sólo lo enseña.
 */

type Falla = { clave: keyof typeof FP_ERROR; detalle?: string };
type Leido = { archivo: string; maestros: MaestroListo[]; descartadas: MesaDescartada[]; avisos: string[] };
type Medida = { w: number; h: number };

const CLAVE_ERROR: Record<MotivoPsd | "desconocido", keyof typeof FP_ERROR> = { "no-soportado": "noSoportado", "demasiado-grande": "grande", "sin-aplanado": "sinAplanado", "sin-fondo": "sinFondo", desconocido: "desconocido" };
/** Alto máximo con el que se ENSEÑA una medida (la descarga va siempre a tamaño real). */
const VISTA_ALTO_MAX = 440;
/** Desde esta forma (ancho ÷ alto) la tarjeta ocupa la fila entera: una horizontal en media columna no se puede juzgar. */
const FORMA_FILA = 1.5;
/** El nombre de la mesa se acorta ANTES de ponerle la medida: así la medida nunca se corta y dos medidas no chocan. */
const NOMBRE_MESA_MAX = 100;
const NOMBRE_ZIP_MAX = 80;
const SOLTAR_URL_MS = 10_000;
const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const BOTON = "min-h-11 sm:min-h-9";
const clave = (m: Medida) => `${m.w}x${m.h}`;
const etiqueta = (m: Medida) => `${m.w}×${m.h}`;
/** El nombre de entrega del equipo (el de la mesa con la medida nueva), limpio para ser nombre de archivo. */
const archivoDe = (ma: MaestroListo, m: Medida) => `${nombreSalida({ nombre: limpiarNombre(ma.nombre, NOMBRE_MESA_MAX), w: ma.w, h: ma.h }, m.w, m.h)}.png`;
const sinExtension = (archivo: string) => archivo.replace(/\.psd$/i, "");

const aPng = (lienzo: HTMLCanvasElement): Promise<Blob> =>
  new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("toBlob"))), "image/png"));

function descargar(blob: Blob, nombre: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), SOLTAR_URL_MS);
}

const pct = (v: number, de: number) => `${(v / de) * 100}%`;

/** Los archivos de lo que se soltó, entrando a las carpetas (hasta 4 niveles y 500 archivos: la de tipografías trae ~20). */
async function archivosDe(entradas: FileSystemEntry[]): Promise<File[]> {
  const out: File[] = [];
  const andar = async (e: FileSystemEntry, nivel: number): Promise<void> => {
    if (out.length >= 500) return;
    if (e.isFile) return void out.push(await new Promise<File>((ok, mal) => (e as FileSystemFileEntry).file(ok, mal)));
    if (!e.isDirectory || nivel >= 4) return;
    const lector = (e as FileSystemDirectoryEntry).createReader();
    for (let lote: FileSystemEntry[] = []; ; ) {
      lote = await new Promise<FileSystemEntry[]>((ok, mal) => lector.readEntries(ok, mal));
      if (!lote.length) break;
      for (const x of lote) await andar(x, nivel + 1);
    }
  };
  for (const e of entradas) await andar(e, 0).catch((err) => console.error("[formatos-psd] soltar", err));
  return out;
}

const TarjetaMedida = memo(function TarjetaMedida({
  maestros,
  medida,
  lado,
  canal,
  escritura,
  tipos,
  lang,
  alVoltear,
  registrar,
}: {
  maestros: MaestroListo[];
  medida: Medida;
  lado: Lado;
  canal: Canal | null;
  escritura: Escritura | null;
  tipos: Tipografias;
  lang: Lang;
  alVoltear: (m: Medida, a: Lado) => void;
  registrar: (k: string, lienzo: HTMLCanvasElement | null) => void;
}) {
  const { w, h } = medida;
  const k = clave(medida);
  const { maestro, acomodo } = useMemo(() => acomodarMedida(maestros, w, h, { heroLado: lado }), [maestros, w, h, lado]);
  const guia = zonaCanal(canal, w, h);
  const nombreCanal = canal ? CANALES[canal].nombre : "";
  const ma = maestros[maestro];
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [noPinto, setNoPinto] = useState(false);
  // Pinta (en su turno de la fila) y, SÓLO si salió bien, se anota para la descarga: una vista que espera turno o
  // que no se pudo pintar nunca va al ZIP ni se queda en blanco con una palomita al lado.
  useEffect(() => {
    const l = lienzo.current;
    if (!l) return;
    registrar(k, null);
    const cancelar = enCola(() => {
      let bien = true;
      try {
        pintar(l, ma, acomodo, w, h, { texto: textoEscrito(escritura, maestro, ma, tipos) });
      } catch (err) {
        console.error("[formatos-psd] pintar", err);
        bien = false;
      }
      registrar(k, bien ? l : null);
      setNoPinto(!bien);
    });
    return () => {
      cancelar();
      registrar(k, null);
    };
  }, [ma, maestro, acomodo, w, h, k, registrar, escritura, tipos]);

  const letra = acomodo.letras.length ? Math.min(...acomodo.letras.map((l) => l.px)) : null;
  const volteable = sePuedeVoltear(acomodo.familia);
  const franja = rellenar(tx(FP.zonaFranja, lang), { c: nombreCanal });
  const revisar = noPinto || acomodo.avisos.length > 0;
  const bajar = async () => {
    try {
      if (lienzo.current && !noPinto) descargar(await aPng(lienzo.current), archivoDe(ma, medida));
    } catch (err) {
      console.error("[formatos-psd] png", err);
      toast.error(tx(FP.bajarFallo, lang));
    }
  };
  return (
    <li className={cn("rounded-xl border border-border bg-card p-3", w / h >= FORMA_FILA && "@xl:col-span-2")}>
      <div className="flex justify-center rounded-lg bg-secondary/60 p-2">
        {/* El contenedor fija el tamaño a la vista; las franjas de la guía van encima, nunca dentro del lienzo. */}
        <div className="relative" style={{ width: `min(100%, ${Math.round(Math.min(w, (VISTA_ALTO_MAX * w) / h))}px)`, aspectRatio: `${w} / ${h}` }}>
          <canvas
            ref={lienzo}
            role="img"
            aria-label={`${rellenar(tx(FP.lienzoAria, lang), { m: etiqueta(medida) })}${guia ? rellenar(tx(FP.lienzoGuia, lang), { c: nombreCanal }) : ""}`}
            className="block size-full rounded-sm"
          />
          {guia && (
            <>
              {guia.top > 0 && (
                <span aria-hidden="true" className="p-zona absolute inset-x-0 top-0 flex items-end justify-center" style={{ height: pct(guia.top, h) }}>
                  <span className="p-zona-texto">{franja}</span>
                </span>
              )}
              {guia.bottom > 0 && (
                <span aria-hidden="true" className="p-zona absolute inset-x-0 bottom-0 flex items-start justify-center" style={{ height: pct(guia.bottom, h) }}>
                  <span className="p-zona-texto">{franja}</span>
                </span>
              )}
              {/* Los costados van ENTRE las franjas de arriba y abajo: las esquinas no se rayan dos veces. */}
              {guia.left > 0 && <span aria-hidden="true" className="p-zona absolute left-0" style={{ top: pct(guia.top, h), bottom: pct(guia.bottom, h), width: pct(guia.left, w) }} />}
              {guia.right > 0 && <span aria-hidden="true" className="p-zona absolute right-0" style={{ top: pct(guia.top, h), bottom: pct(guia.bottom, h), width: pct(guia.right, w) }} />}
            </>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            {etiqueta(medida)}
            {revisar && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground">
                <AlertTriangle className="size-3 text-status-warning" aria-hidden="true" /> {tx(FP.revisarCorto, lang)}
              </span>
            )}
          </h3>
          <p className="text-xs text-muted-foreground">
            {tx(FP_FAMILIA[acomodo.familia], lang)} · {rellenar(tx(FP.deMesa, lang), { m: `${ma.w}×${ma.h}` })}
            {volteable && <> · {tx(lado === "izquierda" ? FP.heroIzquierda : FP.heroDerecha, lang)}</>}
            {letra !== null && <> · {rellenar(tx(FP.letra, lang), { px: letra.toFixed(1) })}</>}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {volteable && (
            <Button variant="outline" size="lg" className={BOTON} onClick={() => alVoltear(medida, lado === "izquierda" ? "derecha" : "izquierda")} aria-label={rellenar(tx(FP.voltearAria, lang), { m: etiqueta(medida) })}>
              <FlipHorizontal2 className="size-4" aria-hidden="true" /> {tx(FP.voltear, lang)}
            </Button>
          )}
          <Button variant="outline" size="lg" className={BOTON} onClick={() => void bajar()} disabled={noPinto} aria-label={rellenar(tx(FP.bajarPngAria, lang), { m: etiqueta(medida) })}>
            <Download className="size-4" aria-hidden="true" /> {tx(FP.bajarPng, lang)}
          </Button>
        </div>
      </div>
      {noPinto && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" /> {tx(FP.noPinto, lang)}
        </p>
      )}
      {acomodo.avisos.length > 0 ? (
        <div className="mt-2 rounded-lg border border-border bg-secondary/50 p-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <AlertTriangle className="size-3.5 shrink-0 text-status-warning" aria-hidden="true" /> {tx(FP.revisar, lang)}
          </p>
          {/* Los avisos los escribe el motor (acomodo.ts), en español: siempre como texto, y marcados como español
              cuando la pantalla está en inglés (un lector de pantalla los pronuncia bien). */}
          <ul lang={lang === "en" ? "es" : undefined} className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-foreground">
            {acomodo.avisos.map((v, i) => (
              <li key={i}>{v.texto}</li>
            ))}
          </ul>
        </div>
      ) : (
        !noPinto && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CircleCheck className="size-3.5 shrink-0" aria-hidden="true" /> {tx(FP.sinAvisos, lang)}
          </p>
        )
      )}
    </li>
  );
});

export function FormatosPsd({ planaActiva }: { planaActiva: boolean }) {
  const [lang, setLang] = useLang();
  const [leido, setLeido] = useState<Leido | null>(null);
  const [avance, setAvance] = useState<{ mesa: number; de: number } | null>(null);
  const [falla, setFalla] = useState<Falla | null>(null);
  const [over, setOver] = useState(false);
  const [texto, setTexto] = useState(MEDIDAS_EQUIPO);
  const [medidas, setMedidas] = useState<Medida[]>(() => leerMedidas(MEDIDAS_EQUIPO).medidas);
  const [notaLista, setNotaLista] = useState<{ mal: boolean; texto: string } | null>(null);
  const [lados, setLados] = useState<Record<string, Lado>>({});
  /** Canal contra el que se revisa la zona segura. Sin canal no se marca nada (nadie ve una franja sin nombre). */
  const [canal, setCanal] = useState<Canal | null>(null);
  /** Tipografías cargadas (nombre PostScript → cómo pedirla). Vacío = el texto va como imagen. */
  const [tipos, setTipos] = useState<Tipografias>(() => new Map());
  const [notaFuentes, setNotaFuentes] = useState<{ mal: boolean; texto: string } | null>(null);
  const entradaFuentes = useRef<HTMLInputElement>(null);
  const [zipeando, setZipeando] = useState(false);
  /** Lo último que pasó, para lectores de pantalla. `n` cambia cuando el mismo texto se repite (si no, no se anuncia). */
  const [aviso, setAviso] = useState<{ texto: string; n: number } | null>(null);
  /** El PSD trae muchas mesas: la persona elige cuáles leer (el worker espera, con el reloj en pausa). */
  const [eleccion, setEleccion] = useState<{ mesas: MesaElegible[]; marcadas: number[] } | null>(null);
  /** `armar` vuelve a poner el reloj que mata al worker (se pausa mientras alguien elige mesas). */
  const trabajo = useRef<{ worker: Worker; reloj: number; armar: () => void } | null>(null);
  /** Cada lectura toma un turno: lo que llegue de un turno viejo (otro archivo, cancelar) se ignora. */
  const turno = useRef(0);
  const vivo = useRef(true);
  const lienzos = useRef(new Map<string, HTMLCanvasElement>());
  const tituloResultado = useRef<HTMLHeadingElement>(null);
  const tituloElegir = useRef<HTMLHeadingElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  /** El cuadro de subida vuelve a existir (cambiar PSD, cancelar, error): el foco regresa a él, no al tope de la página. */
  const volverASubir = useRef(false);

  const soltar = useCallback(() => {
    if (!trabajo.current) return;
    trabajo.current.worker.terminate();
    window.clearTimeout(trabajo.current.reloj);
    trabajo.current = null;
  }, []);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      soltar();
    };
  }, [soltar]);
  const anunciar = useCallback((t: string) => setAviso((p) => ({ texto: t, n: p?.texto === t ? p.n + 1 : 0 })), []);

  const leyendo = avance !== null;
  const eligiendo = eleccion !== null;
  const usables = leido?.maestros ?? [];
  // Al terminar de leer, el foco va al resultado; al volver al cuadro de subida, al cuadro.
  useEffect(() => {
    if (leido?.maestros.length) tituloResultado.current?.focus();
  }, [leido]);
  useEffect(() => {
    if (eligiendo) tituloElegir.current?.focus();
  }, [eligiendo]);
  useEffect(() => {
    if (!volverASubir.current || leyendo || eligiendo || usables.length) return;
    volverASubir.current = false;
    entrada.current?.focus();
  });

  const cambiarPsd = () => {
    volverASubir.current = true;
    setLeido(null);
    setAviso(null);
  };
  const cancelar = () => {
    turno.current++;
    soltar();
    volverASubir.current = true;
    setAvance(null);
    setEleccion(null);
  };

  const abrir = async (file: File) => {
    const mio = ++turno.current;
    const vigente = () => vivo.current && mio === turno.current;
    soltar();
    setFalla(null);
    setLeido(null);
    setLados({});
    setAviso(null);
    setEleccion(null);
    const fallar = (f: Falla) => {
      volverASubir.current = true;
      setAvance(null);
      setEleccion(null);
      setFalla(f);
    };
    // El peso y la firma se revisan ANTES de abrir el archivo. El archivo NO se carga aquí: el worker lo lee a
    // pedazos y se salta lo que no usa (un PSD de 1 GB hecho de objetos inteligentes cabe).
    if (file.size > PSD_ARCHIVO_MAX) return fallar({ clave: "pesado" });
    setAvance({ mesa: 0, de: 0 }); // antes del primer await: el cuadro se cierra a otro archivo desde ya
    try {
      const cabeza = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (!vigente()) return;
      if (!(cabeza[0] === 0x38 && cabeza[1] === 0x42 && cabeza[2] === 0x50 && cabeza[3] === 0x53)) return fallar({ clave: "noEsPsd" });
    } catch (err) {
      console.error("[formatos-psd] leer archivo", err);
      if (vigente()) fallar({ clave: "desconocido" });
      return;
    }
    if (!vigente()) return;
    let worker: Worker;
    try {
      worker = new Worker(new URL("./psd.worker.ts", import.meta.url), { type: "module" });
    } catch (err) {
      console.error("[formatos-psd] worker", err);
      return fallar({ clave: "desconocido" });
    }
    // Sólo el worker vigente puede cerrar la lectura: uno viejo no pisa ni mata al nuevo.
    const cerrar = (f: Falla | null): boolean => {
      if (trabajo.current?.worker !== worker) return false;
      soltar();
      if (f) fallar(f);
      return true;
    };
    const t = { worker, reloj: 0, armar: () => (t.reloj = window.setTimeout(() => cerrar({ clave: "tardo" }), LEER_MAX_MS)) };
    trabajo.current = t;
    t.armar();
    worker.onerror = (e) => {
      console.error("[formatos-psd] worker", e.message);
      cerrar({ clave: "desconocido" });
    };
    worker.onmessageerror = () => cerrar({ clave: "desconocido" });
    worker.onmessage = (e: MessageEvent<MensajeWorker>) => {
      const m = e.data;
      if (trabajo.current?.worker !== worker) return;
      if (m.tipo === "avance") return setAvance({ mesa: m.mesa, de: m.de });
      if (m.tipo === "elegir") {
        // Mientras la persona elige, el reloj no corre: no es la librería la que tarda.
        window.clearTimeout(t.reloj);
        setAvance(null);
        setEleccion({ mesas: m.mesas, marcadas: m.sugeridas });
        return;
      }
      if (m.tipo === "error") {
        console.error("[formatos-psd]", m.detalle);
        return void cerrar({ clave: CLAVE_ERROR[m.motivo], detalle: m.motivo === "desconocido" ? undefined : m.detalle });
      }
      // El worker ya entregó (sus píxeles cruzaron sin copiarse): se suelta.
      cerrar(null);
      // Un PSD sin mesas de trabajo no trae nombre de mesa: el del archivo hace de nombre de entrega.
      const maestros = m.maestros.map((x) => (x.nombre ? x : { ...x, nombre: sinExtension(file.name) }));
      setLeido({ archivo: file.name, maestros, descartadas: m.descartadas, avisos: m.avisos });
      if (maestros.length) setAvance(null);
      else fallar({ clave: "ningunaMesa" });
    };
    try {
      worker.postMessage({ tipo: "leer", archivo: file } satisfies PedidoWorker);
    } catch (err) {
      console.error("[formatos-psd] worker", err);
      cerrar({ clave: "desconocido" });
    }
  };

  const marcar = (i: number) =>
    setEleccion((e) => e && { ...e, marcadas: e.marcadas.includes(i) ? e.marcadas.filter((x) => x !== i) : e.marcadas.length < MESAS_MAX ? [...e.marcadas, i] : e.marcadas });
  const leerElegidas = () => {
    const t = trabajo.current;
    if (!t || !eleccion?.marcadas.length) return;
    try {
      t.worker.postMessage({ tipo: "mesas", indices: eleccion.marcadas } satisfies PedidoWorker);
    } catch (err) {
      console.error("[formatos-psd] worker", err);
      soltar();
      volverASubir.current = true;
      setEleccion(null);
      return setFalla({ clave: "desconocido" });
    }
    t.armar();
    setAvance({ mesa: 0, de: eleccion.marcadas.length });
    setEleccion(null);
  };

  // Tipografías: las que se recordaron en este navegador se cargan solas; las nuevas se suman y se recuerdan.
  useEffect(() => {
    void (async () => {
      const recordadas = await fuentesRecordadas();
      if (!recordadas.length) return;
      const r = await cargarFuentes(recordadas, new Map());
      if (vivo.current) setTipos((antes) => new Map([...r.mapa, ...antes]));
    })();
  }, []);
  const agregarFuentes = async (archivos: File[]) => {
    try {
      const datos = await Promise.all(archivos.filter((f) => EXTENSIONES_FUENTE.test(f.name)).map(async (f) => ({ nombre: f.name, datos: await f.arrayBuffer() })));
      const r = await cargarFuentes(datos, tipos);
      if (!vivo.current) return;
      setTipos(r.mapa);
      void recordarFuentes(datos.filter((d) => !r.malas.includes(d.nombre)));
      const texto = [rellenar(tx(FP.textoCargadas, lang), { n: r.nuevas.length }), r.malas.length ? rellenar(tx(FP.textoMalas, lang), { f: r.malas.join(", ") }) : ""].filter(Boolean).join(" ");
      setNotaFuentes({ mal: !r.nuevas.length && r.malas.length > 0, texto });
      anunciar(texto);
    } catch (err) {
      console.error("[formatos-psd] tipografías", err);
      setNotaFuentes({ mal: true, texto: tx(FP.textoFallo, lang) });
    }
  };
  const olvidar = () => {
    void olvidarFuentes();
    setTipos(new Map());
    setNotaFuentes(null);
    anunciar(tx(FP.textoOlvidadas, lang));
  };

  // Un PSD soltado FUERA del cuadro haría que el navegador lo abra o lo descargue y se pierda la pantalla: la
  // página entera recibe el archivo.
  const alSoltar = useEffectEvent((e: DragEvent) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    setOver(false);
    // Las carpetas se recorren (la de tipografías llega así). Las entradas se toman YA: después del evento ya no existen.
    const entradas = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.() ?? null).filter((x): x is FileSystemEntry => !!x);
    const sueltos = [...e.dataTransfer.files];
    void (async () => {
      const archivos = entradas.length ? await archivosDe(entradas) : sueltos;
      const fuentes = archivos.filter((f) => EXTENSIONES_FUENTE.test(f.name));
      if (fuentes.length) void agregarFuentes(fuentes);
      // Un PSD (o, si no vino ninguna tipografía, el primer archivo: así un PNG dice "no es un PSD").
      const psd = archivos.find((f) => /\.psd$/i.test(f.name)) ?? (fuentes.length ? undefined : archivos[0]);
      if (psd && !leyendo) void abrir(psd);
    })();
  });

  useEffect(() => {
    const sobre = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const suelta = (e: DragEvent) => alSoltar(e);
    window.addEventListener("dragover", sobre);
    window.addEventListener("drop", suelta);
    return () => {
      window.removeEventListener("dragover", sobre);
      window.removeEventListener("drop", suelta);
    };
  }, []);

  const usarLista = () => {
    const r = leerMedidas(texto);
    const limites = r.fuera.length ? rellenar(tx(FP.listaFuera, lang), { min: LADO_MIN, max: LADO_MAX, m: r.fuera.join(", ") }) : "";
    if (!r.medidas.length) return setNotaLista({ mal: true, texto: limites || tx(FX.pegarNada, lang) });
    const { caben, fuera } = medidasQueCaben(r.medidas);
    setMedidas(caben);
    const notas = [fuera ? rellenar(tx(FP.listaTope, lang), { n: fuera, max: MEDIDAS_MAX }) : "", limites].filter(Boolean).join(" ");
    setNotaLista(notas ? { mal: false, texto: notas } : null);
    anunciar([rellenar(tx(FP.listaLista, lang), { n: caben.length }), notas].filter(Boolean).join(" "));
  };

  const registrar = useCallback((k: string, l: HTMLCanvasElement | null) => {
    if (l) lienzos.current.set(k, l);
    else lienzos.current.delete(k);
  }, []);
  const voltear = useCallback(
    (m: Medida, a: Lado) => {
      setLados((p) => ({ ...p, [clave(m)]: a }));
      anunciar(`${etiqueta(m)}: ${tx(a === "izquierda" ? FP.heroIzquierda : FP.heroDerecha, lang)}`);
    },
    [anunciar, lang],
  );

  // El mismo cálculo que hace cada tarjeta (función pura, barata): aquí sirve para el resumen y los nombres del ZIP.
  // Cada texto se prueba contra Photoshop con las tipografías cargadas; sólo los que coinciden se vuelven a escribir.
  const escritura = useMemo(() => (leido?.maestros.length && tipos.size ? revisarTextos(leido.maestros, tipos) : null), [leido, tipos]);
  const totalTextos = usables.reduce((t, m) => t + m.piezas.reduce((u, p) => u + p.textos.length, 0), 0);
  const revisiones = escritura?.revisiones ?? [];
  const escritos = revisiones.filter((r) => r.ok).length;
  const faltanFuentes = [...new Set(usables.flatMap((m) => m.piezas.flatMap((p) => p.textos.flatMap((t) => t.texto.tramos.map((r) => r.fuente)))))].filter((f) => f && !tipos.has(f));
  // El mismo texto suele venir en varias mesas: una línea por texto y motivo, con las medidas de sus mesas.
  const comoImagen = [
    ...revisiones
      .filter((r) => !r.ok && !r.faltan.length)
      .reduce((g, r) => {
        const ma = leido?.maestros[r.maestro];
        const mesa = ma ? `${ma.w}×${ma.h}` : "";
        const k = `${r.capa}\n${r.motivo}`;
        const v = g.get(k);
        if (!v) g.set(k, { capa: r.capa, motivo: r.motivo, mesas: [mesa] });
        else if (!v.mesas.includes(mesa)) v.mesas.push(mesa);
        return g;
      }, new Map<string, { capa: string; motivo: string | null; mesas: string[] }>())
      .values(),
  ];

  const filas = useMemo(
    () => (leido?.maestros.length ? medidas.map((m) => ({ m, ...acomodarMedida(leido.maestros, m.w, m.h, { heroLado: lados[clave(m)] }) })) : []),
    [leido, medidas, lados],
  );
  const porRevisar = filas.filter((f) => f.acomodo.avisos.length).length;
  const volteables = filas.filter((f) => sePuedeVoltear(f.acomodo.familia));
  const hay916 = medidas.some((m) => es916(m.w, m.h));
  const voltearTodas = () => {
    setLados((p) => ({ ...p, ...Object.fromEntries(volteables.map((f) => [clave(f.m), p[clave(f.m)] === "izquierda" ? "derecha" : "izquierda"])) }));
    anunciar(rellenar(tx(FP.voltearTodasHecho, lang), { n: volteables.length }));
  };
  const notasArchivo = leido ? [...leido.descartadas.map((d) => rellenar(tx(FP.mesaNoUsada, lang), { n: d.nombre || tx(FP.sinNombre, lang), m: d.motivos.join(" · ") })), ...leido.avisos, ...usables.flatMap((m) => m.avisos.map((a) => `${m.w}×${m.h}: ${a}`))] : [];

  const bajarZip = async () => {
    if (!leido || zipeando || !filas.length) return;
    setZipeando(true);
    try {
      const con = filas.map((f) => ({ nombre: archivoDe(leido.maestros[f.maestro], f.m), lienzo: lienzos.current.get(clave(f.m)) }));
      const faltan = con.filter((c) => !c.lienzo).length;
      // Un ZIP incompleto que diga "listo" es peor que no entregarlo.
      if (faltan) return void toast.error(rellenar(tx(FP.zipIncompleto, lang), { n: faltan }));
      // `toBlob` toma la foto del lienzo al llamarse: se piden TODAS en este mismo instante, antes de esperar a
      // ninguna, así un volteo o un cambio de lista a media descarga no mezcla estados.
      const pngs = await Promise.all(con.map((c) => aPng(c.lienzo as HTMLCanvasElement)));
      const archivos: Record<string, Uint8Array> = {};
      for (const [i, c] of con.entries()) {
        let nombre = c.nombre;
        for (let n = 2; nombre in archivos; n++) nombre = c.nombre.replace(/\.png$/, `-${n}.png`);
        archivos[nombre] = new Uint8Array(await pngs[i].arrayBuffer());
      }
      if (!vivo.current) return;
      // PNG ya viene comprimido: se guarda tal cual.
      descargar(new Blob([zipSync(archivos, { level: 0 }) as BlobPart], { type: "application/zip" }), `${limpiarNombre(sinExtension(leido.archivo), NOMBRE_ZIP_MAX)}_formatos.zip`);
      toast.success(tx(FX.zipListo, lang));
    } catch (err) {
      console.error("[formatos-psd] zip", err);
      toast.error(tx(FP.bajarFallo, lang));
    } finally {
      setZipeando(false);
    }
  };

  const notasTxt = notasArchivo.length === 1 ? tx(FP.notasUna, lang) : notasArchivo.length ? rellenar(tx(FP.notasN, lang), { n: notasArchivo.length }) : "";
  const resumen = filas.length
    ? [porRevisar ? rellenar(tx(FP.resumenRevisar, lang), { n: filas.length, r: porRevisar }) : rellenar(tx(FP.resumenOk, lang), { n: filas.length }), notasTxt].filter(Boolean).join(" · ")
    : "";
  const textoAvance = avance && avance.de > 0 ? rellenar(tx(FP.leyendoMesa, lang), { m: avance.mesa, n: avance.de }) : tx(FP.leyendo, lang);
  /** El motor y el archivo hablan español: con la pantalla en inglés esos textos se marcan como español. */
  const delMotor = lang === "en" ? "es" : undefined;

  return (
    <div lang={lang} className="prisma-root mx-auto max-w-6xl">
      {/* Un solo anuncio para lectores de pantalla: el avance de la lectura, lo último que se hizo, o el resumen. */}
      <p role="status" className="sr-only">
        {leyendo ? textoAvance : eleccion ? rellenar(tx(FP.elegirTitulo, lang), { n: eleccion.mesas.length }) : aviso ? `${aviso.texto}${aviso.n % 2 ? "​" : ""}` : resumen}
      </p>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href="/prisma" className={cn("mb-2 inline-flex min-h-11 items-center gap-1 rounded text-sm text-muted-foreground hover:text-foreground sm:min-h-0", FOCO)}>
            <ArrowLeft className="size-4" aria-hidden="true" /> {tx(FX.volver, lang)}
          </Link>
          <h1 className="font-heading text-[34px] font-bold leading-none tracking-tight text-foreground md:text-[44px]">
            HÜE <span className="p-spectrum-text">{tx(FX.titulo, lang)}</span>
          </h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">{tx(FP.tagline, lang)}</p>
        </div>
        <button
          type="button"
          onClick={() => setLang(lang === "es" ? "en" : "es")}
          lang={lang === "es" ? "en" : "es"}
          className={cn("inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary sm:min-h-9", FOCO)}
          aria-label={lang === "es" ? "Switch to English" : "Cambiar a español"}
        >
          <Languages className="size-3.5" aria-hidden="true" /> {lang === "es" ? "EN" : "ES"}
        </button>
      </div>

      {eleccion ? (
        <section className="p-enter max-w-2xl" aria-labelledby="psd-elegir-titulo">
          <div className="rounded-2xl border border-border bg-card/50 px-5 py-5">
            <h2 id="psd-elegir-titulo" ref={tituloElegir} tabIndex={-1} className="text-base font-medium text-foreground outline-none">
              {rellenar(tx(FP.elegirTitulo, lang), { n: eleccion.mesas.length })}
            </h2>
            <p className="text-sm text-muted-foreground">{rellenar(tx(FP.elegirAyuda, lang), { max: MESAS_MAX })}</p>
            <fieldset className="mt-3">
              <legend className="sr-only">{tx(FP.elegirLeyenda, lang)}</legend>
              <ul className="max-h-96 space-y-0.5 overflow-y-auto">
                {eleccion.mesas.map((m, i) => {
                  const on = eleccion.marcadas.includes(i);
                  return (
                    <li key={i}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-secondary/60 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 sm:min-h-9">
                        {/* Nombre explícito: el texto de la etiqueta pega el nombre y la medida ("…_A540×960"). */}
                        <input
                          type="checkbox"
                          aria-label={`${m.nombre || tx(FP.sinNombre, lang)}, ${etiqueta(m)}`}
                          className={cn("size-4 shrink-0 accent-primary", FOCO)}
                          checked={on}
                          disabled={!on && eleccion.marcadas.length >= MESAS_MAX}
                          onChange={() => marcar(i)}
                        />
                        <span lang={delMotor} className="min-w-0 break-words text-sm text-foreground">
                          {m.nombre || tx(FP.sinNombre, lang)}
                        </span>
                        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{etiqueta(m)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            <div className="mt-4 flex flex-wrap gap-2">
              {/* aria-disabled, no disabled: el botón conserva el foco y dice por qué no hace nada. */}
              <Button size="lg" className={cn(BOTON, "aria-disabled:opacity-60")} onClick={leerElegidas} aria-disabled={!eleccion.marcadas.length || undefined}>
                <FileUp className="size-4" aria-hidden="true" /> {rellenar(tx(FP.elegirLeer, lang), { n: eleccion.marcadas.length })}
              </Button>
              <Button variant="outline" size="lg" className={BOTON} onClick={cancelar}>
                <X className="size-4" aria-hidden="true" /> {tx(FP.cancelar, lang)}
              </Button>
            </div>
          </div>
        </section>
      ) : !usables.length ? (
        <section className="p-enter max-w-2xl space-y-3" aria-label={tx(FP.subir, lang)}>
          {/* <label>, no <button>: mismo patrón que la puerta de imagen plana (el input de archivo vive adentro).
              El archivo soltado lo recibe la página entera (arriba); aquí sólo se pinta el "suéltalo". */}
          <label
            onDragOver={() => setOver(true)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
            }}
            className={cn(
              "flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-dashed px-5 py-8 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              over ? "border-primary bg-primary/8" : "border-border bg-card/50 hover:border-primary",
              leyendo && "cursor-wait",
            )}
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              {leyendo ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <FileUp className="size-5" aria-hidden="true" />}
            </span>
            <span className="min-w-0">
              <span id="psd-subir-titulo" className="block text-base font-medium text-foreground">
                {leyendo ? textoAvance : tx(FP.subir, lang)}
              </span>
              <span id="psd-subir-ayuda" className="block text-sm text-muted-foreground">
                {leyendo ? tx(FP.leyendoAyuda, lang) : `${tx(FP.subirAyuda, lang)} ${tx(FP.subirTipos, lang)}`}
              </span>
            </span>
            <input
              ref={entrada}
              type="file"
              accept=".psd,image/vnd.adobe.photoshop"
              className="sr-only"
              aria-labelledby="psd-subir-titulo"
              aria-describedby={falla ? "psd-subir-ayuda psd-subir-error" : "psd-subir-ayuda"}
              disabled={leyendo}
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                e.target.value = "";
                if (archivo) void abrir(archivo);
              }}
            />
          </label>
          {leyendo && (
            <Button variant="outline" size="lg" className={BOTON} onClick={cancelar}>
              <X className="size-4" aria-hidden="true" /> {tx(FP.cancelar, lang)}
            </Button>
          )}
          {falla && (
            <div id="psd-subir-error" role="alert" className="flex items-start gap-1.5 text-sm text-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
              <div className="min-w-0">
                <p>{tx(FP_ERROR[falla.clave], lang)}</p>
                {falla.detalle && (
                  <p lang={delMotor} className="mt-0.5 break-words text-xs text-muted-foreground">
                    {falla.detalle}
                  </p>
                )}
                {notasArchivo.map((n, i) => (
                  <p key={i} lang={delMotor} className="mt-0.5 break-words text-xs text-muted-foreground">
                    {n}
                  </p>
                ))}
              </div>
            </div>
          )}
          {planaActiva && (
            <Link href="/prisma/formatos" className={cn("inline-flex min-h-11 items-center rounded text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:min-h-0", FOCO)}>
              {tx(FP.planaLink, lang)}
            </Link>
          )}
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* top-20: la barra de arriba de la app (h-16) también es pegajosa; con menos, el panel se le mete debajo. */}
          <aside className="space-y-3 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{tx(FP.archivo, lang)}</p>
              <p className="mt-1 break-words text-sm font-medium text-foreground">{leido?.archivo}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {usables.length === 1 ? tx(FP.mesasUna, lang) : rellenar(tx(FP.mesas, lang), { n: usables.length })}: {usables.map((m) => `${m.w}×${m.h}`).join(" · ")}
              </p>
              {notasArchivo.length > 0 && (
                <div className="mt-2 border-t border-border pt-2">
                  <h2 id="psd-notas" className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <AlertTriangle className="size-3.5 shrink-0 text-status-warning" aria-hidden="true" /> {tx(FP.avisosDelArchivo, lang)}
                  </h2>
                  <ul aria-labelledby="psd-notas" lang={delMotor} className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-foreground">
                    {notasArchivo.map((n, i) => (
                      <li key={i} className="break-words">
                        {n}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Button variant="outline" size="lg" className={cn("mt-3 w-full", BOTON)} onClick={cambiarPsd}>
                <FileUp className="size-4" aria-hidden="true" /> {tx(FP.cambiar, lang)}
              </Button>
            </div>

            <form
              className="rounded-xl border border-border bg-card p-3"
              onSubmit={(e) => {
                e.preventDefault();
                usarLista();
              }}
            >
              <label htmlFor="psd-lista" className="text-sm font-medium text-foreground">
                {tx(FX.pegarLista, lang)}
              </label>
              <p id="psd-lista-ayuda" className="text-xs text-muted-foreground">
                {tx(FX.pegarAyuda, lang)}
              </p>
              <textarea
                id="psd-lista"
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value);
                  setNotaLista(null);
                }}
                rows={4}
                spellCheck={false}
                aria-invalid={notaLista?.mal || undefined}
                aria-describedby={notaLista ? "psd-lista-ayuda psd-lista-nota" : "psd-lista-ayuda"}
                className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {notaLista && (
                <p id="psd-lista-nota" role={notaLista.mal ? "alert" : undefined} className="mt-1 flex items-start gap-1.5 text-xs text-foreground">
                  {notaLista.mal && <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />} {notaLista.texto}
                </p>
              )}
              <Button type="submit" variant="secondary" size="lg" className={cn("mt-2 w-full", BOTON)}>
                {tx(FX.pegarUsar, lang)}
              </Button>
            </form>

            {totalTextos > 0 && (
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{tx(FP.textoTitulo, lang)}</p>
                <p className="mt-1 text-sm font-medium text-foreground">{rellenar(tx(FP.textoEstado, lang), { n: escritos, m: totalTextos })}</p>
                <p className="mt-1 text-xs text-muted-foreground">{tx(FP.textoAyuda, lang)}</p>
                {faltanFuentes.length > 0 && (
                  <p lang={delMotor} className="mt-1 break-words text-xs text-foreground">
                    {rellenar(tx(FP.textoFaltan, lang), { f: faltanFuentes.join(", ") })}
                  </p>
                )}
                {comoImagen.length > 0 && (
                  <>
                    <p id="psd-texto-imagen" className="mt-2 text-xs font-medium text-foreground">
                      {tx(FP.textoComoImagen, lang)}
                    </p>
                    <ul aria-labelledby="psd-texto-imagen" lang={delMotor} className="mt-0.5 list-disc space-y-0.5 pl-5 text-xs text-foreground">
                      {comoImagen.map((r, i) => (
                        <li key={i} className="break-words">
                          «{r.capa}» ({r.mesas.join(", ")}): {r.motivo}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {notaFuentes && (
                  <p role={notaFuentes.mal ? "alert" : undefined} className="mt-1 flex items-start gap-1.5 text-xs text-foreground">
                    {notaFuentes.mal && <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />} {notaFuentes.texto}
                  </p>
                )}
                <input
                  ref={entradaFuentes}
                  type="file"
                  multiple
                  accept=".otf,.ttf,font/otf,font/ttf"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => {
                    const archivos = [...(e.target.files ?? [])];
                    e.target.value = "";
                    if (archivos.length) void agregarFuentes(archivos);
                  }}
                />
                <Button variant="outline" size="lg" className={cn("mt-2 w-full", BOTON)} onClick={() => entradaFuentes.current?.click()}>
                  <Type className="size-4" aria-hidden="true" /> {tx(FP.textoAgregar, lang)}
                </Button>
                {tipos.size > 0 && (
                  <button type="button" onClick={olvidar} className={cn("mt-1 min-h-11 w-full cursor-pointer rounded text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:min-h-8", FOCO)}>
                    {tx(FP.textoOlvidar, lang)}
                  </button>
                )}
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{tx(FP.zona, lang)}</p>
              <label htmlFor="psd-canal" className="mt-1 block text-sm font-medium text-foreground">
                {tx(FP.zonaCanal, lang)}
              </label>
              <select
                id="psd-canal"
                value={canal ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setCanal(esCanal(v) ? v : null);
                }}
                aria-describedby="psd-canal-ayuda"
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">{tx(FP.zonaNinguno, lang)}</option>
                {(Object.keys(CANALES) as Canal[]).map((c) => (
                  <option key={c} value={c}>
                    {CANALES[c].nombre}
                  </option>
                ))}
              </select>
              <p id="psd-canal-ayuda" className="mt-1 text-xs text-muted-foreground">
                {tx(FP.zonaAyuda, lang)}
                {canal && !hay916 && <> {tx(FP.zonaSin916, lang)}</>}
              </p>
            </div>
          </aside>

          <section aria-labelledby="psd-resultado" className="@container min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 id="psd-resultado" ref={tituloResultado} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">
                  {tx(FX.resultados, lang)}
                </h2>
                <p className="text-sm text-muted-foreground">{resumen}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {volteables.length > 0 && (
                  <Button variant="outline" size="lg" className={BOTON} onClick={voltearTodas}>
                    <FlipHorizontal2 className="size-4" aria-hidden="true" /> {tx(FP.voltearTodas, lang)}
                  </Button>
                )}
                {/* aria-disabled, no disabled: un botón con foco que se deshabilita suelta el foco al tope de la página. */}
                <Button size="lg" className={cn(BOTON, "aria-disabled:opacity-60")} onClick={() => void bajarZip()} aria-disabled={zipeando || undefined} aria-busy={zipeando}>
                  {zipeando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
                  {zipeando ? tx(FX.armandoZip, lang) : rellenar(tx(FX.bajarZipN, lang), { n: filas.length })}
                </Button>
              </div>
            </div>
            {/* Dos columnas cuando la COLUMNA de resultados da para ello (la barra y el panel de al lado la angostan);
                las horizontales y los banners ocupan la fila entera. El orden es el de la lista del cliente. */}
            <ul className="grid items-start gap-4 @xl:grid-cols-2">
              {medidas.map((m) => (
                <TarjetaMedida key={clave(m)} maestros={usables} medida={m} lado={lados[clave(m)] ?? "derecha"} canal={canal} escritura={escritura} tipos={tipos} lang={lang} alVoltear={voltear} registrar={registrar} />
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

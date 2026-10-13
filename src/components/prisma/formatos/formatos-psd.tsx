"use client";

import { memo, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CircleCheck, Download, Eye, EyeOff, FileUp, FlipHorizontal2, Languages, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { zipSync } from "fflate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tx, type Lang } from "@/lib/prisma/copy";
import { useLang } from "@/components/prisma/use-lang";
import { ZONA_HISTORIA_PCT } from "@/lib/prisma/compilers/zonas";
import { MEDIDAS_EQUIPO, acomodarMedida, nombreSalida, sePuedeVoltear, type Lado } from "@/lib/prisma/formatos/acomodo";
import { FP, FP_ERROR, FP_FAMILIA, FX, rellenar } from "@/lib/prisma/formatos/copy";
import { LADO_MAX, LADO_MIN, leerMedidas, limpiarNombre } from "@/lib/prisma/formatos/geometria";
import { LEER_MAX_MS, MEDIDAS_MAX, PSD_BYTES_MAX, medidasQueCaben, type MensajeWorker, type MesaDescartada } from "@/lib/prisma/formatos/listo";
import type { MotivoPsd } from "@/lib/prisma/formatos/psd";
import { aPintable, pintar, soltarLienzos, type MaestroPintable } from "./pintar";

/**
 * HÜE Prisma › Formatos, puerta PSD. El anuncio llega en Photoshop: un Web Worker lo lee y lo separa en fondo
 * limpio + piezas, y cada medida se pinta aquí mismo en un <canvas>. Nada se sube ni se guarda: no hay base, ni
 * IA, ni costo. Lo que decide DÓNDE va cada pieza es `acomodo.ts` (probado aparte); esta pantalla sólo lo enseña.
 */

type Falla = { clave: keyof typeof FP_ERROR; detalle?: string };
type Leido = { archivo: string; maestros: MaestroPintable[]; descartadas: MesaDescartada[]; avisos: string[] };
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
const MB_MAX = Math.round(PSD_BYTES_MAX / 1e6);
const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const BOTON = "min-h-11 sm:min-h-9";
const clave = (m: Medida) => `${m.w}x${m.h}`;
const etiqueta = (m: Medida) => `${m.w}×${m.h}`;
/** El nombre de entrega del equipo (el de la mesa con la medida nueva), limpio para ser nombre de archivo. */
const archivoDe = (ma: MaestroPintable, m: Medida) => `${nombreSalida({ nombre: limpiarNombre(ma.nombre, NOMBRE_MESA_MAX), w: ma.w, h: ma.h }, m.w, m.h)}.png`;
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

const TarjetaMedida = memo(function TarjetaMedida({
  maestros,
  medida,
  lado,
  guiaOn,
  lang,
  alVoltear,
  registrar,
}: {
  maestros: MaestroPintable[];
  medida: Medida;
  lado: Lado;
  guiaOn: boolean;
  lang: Lang;
  alVoltear: (m: Medida, a: Lado) => void;
  registrar: (k: string, lienzo: HTMLCanvasElement | null) => void;
}) {
  const { w, h } = medida;
  const k = clave(medida);
  const { maestro, acomodo, guia } = useMemo(() => acomodarMedida(maestros, w, h, { heroLado: lado }), [maestros, w, h, lado]);
  const ma = maestros[maestro];
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [noPinto, setNoPinto] = useState(false);
  // Pinta y, SÓLO si salió bien, se anota para la descarga: una vista que no se pudo pintar nunca va al ZIP ni
  // se queda en blanco con una palomita al lado.
  useEffect(() => {
    const l = lienzo.current;
    if (!l) return;
    let bien = true;
    try {
      pintar(l, ma, acomodo, w, h);
    } catch (err) {
      console.error("[formatos-psd] pintar", err);
      bien = false;
    }
    registrar(k, bien ? l : null);
    const cuadro = requestAnimationFrame(() => setNoPinto(!bien));
    return () => {
      cancelAnimationFrame(cuadro);
      registrar(k, null);
    };
  }, [ma, acomodo, w, h, k, registrar]);

  const letra = acomodo.letras.length ? Math.min(...acomodo.letras.map((l) => l.px)) : null;
  const volteable = sePuedeVoltear(acomodo.familia);
  const conGuia = guiaOn && !!guia;
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
            aria-label={`${rellenar(tx(FP.lienzoAria, lang), { m: etiqueta(medida) })}${conGuia ? tx(FP.lienzoGuia, lang) : ""}`}
            className="block size-full rounded-sm"
          />
          {conGuia && (
            <>
              <span aria-hidden="true" className="p-zona absolute inset-x-0 top-0 flex items-end justify-center" style={{ height: `${(guia.top / h) * 100}%` }}>
                <span className="p-zona-texto">{tx(FP.zonaFranja, lang)}</span>
              </span>
              <span aria-hidden="true" className="p-zona absolute inset-x-0 bottom-0 flex items-start justify-center" style={{ height: `${(guia.bottom / h) * 100}%` }}>
                <span className="p-zona-texto">{tx(FP.zonaFranja, lang)}</span>
              </span>
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
  const [guiaOn, setGuiaOn] = useState(true);
  const [zipeando, setZipeando] = useState(false);
  /** Lo último que pasó, para lectores de pantalla. `n` cambia cuando el mismo texto se repite (si no, no se anuncia). */
  const [aviso, setAviso] = useState<{ texto: string; n: number } | null>(null);
  const trabajo = useRef<{ worker: Worker; reloj: number } | null>(null);
  /** Cada lectura toma un turno: lo que llegue de un turno viejo (otro archivo, cancelar) se ignora. */
  const turno = useRef(0);
  const vivo = useRef(true);
  const lienzos = useRef(new Map<string, HTMLCanvasElement>());
  const tituloResultado = useRef<HTMLHeadingElement>(null);
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
  const usables = leido?.maestros ?? [];
  // Al terminar de leer, el foco va al resultado; al volver al cuadro de subida, al cuadro.
  useEffect(() => {
    if (leido?.maestros.length) tituloResultado.current?.focus();
  }, [leido]);
  useEffect(() => {
    if (!volverASubir.current || leyendo || usables.length) return;
    volverASubir.current = false;
    entrada.current?.focus();
  });

  const cambiarPsd = () => {
    leido?.maestros.forEach(soltarLienzos);
    volverASubir.current = true;
    setLeido(null);
    setAviso(null);
  };
  const cancelar = () => {
    turno.current++;
    soltar();
    volverASubir.current = true;
    setAvance(null);
  };

  const abrir = async (file: File) => {
    const mio = ++turno.current;
    const vigente = () => vivo.current && mio === turno.current;
    soltar();
    leido?.maestros.forEach(soltarLienzos);
    setFalla(null);
    setLeido(null);
    setLados({});
    setAviso(null);
    const fallar = (f: Falla) => {
      volverASubir.current = true;
      setAvance(null);
      setFalla(f);
    };
    // El peso y la firma se revisan ANTES de cargar el archivo en memoria.
    if (file.size > PSD_BYTES_MAX) return fallar({ clave: "pesado" });
    setAvance({ mesa: 0, de: 0 }); // antes del primer await: el cuadro se cierra a otro archivo desde ya
    let datos: ArrayBuffer;
    try {
      const cabeza = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (!vigente()) return;
      if (!(cabeza[0] === 0x38 && cabeza[1] === 0x42 && cabeza[2] === 0x50 && cabeza[3] === 0x53)) return fallar({ clave: "noEsPsd" });
      datos = await file.arrayBuffer();
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
    trabajo.current = { worker, reloj: window.setTimeout(() => cerrar({ clave: "tardo" }), LEER_MAX_MS) };
    worker.onerror = (e) => {
      console.error("[formatos-psd] worker", e.message);
      cerrar({ clave: "desconocido" });
    };
    worker.onmessageerror = () => cerrar({ clave: "desconocido" });
    worker.onmessage = (e: MessageEvent<MensajeWorker>) => {
      const m = e.data;
      if (trabajo.current?.worker !== worker) return;
      if (m.tipo === "avance") return setAvance({ mesa: m.mesa, de: m.de });
      if (m.tipo === "error") {
        console.error("[formatos-psd]", m.detalle);
        return void cerrar({ clave: CLAVE_ERROR[m.motivo], detalle: m.motivo === "desconocido" ? undefined : m.detalle });
      }
      // El worker ya entregó: se suelta ANTES de pasar los píxeles a lienzos (su memoria y la de la página no se suman).
      cerrar(null);
      try {
        // Un PSD sin mesas de trabajo no trae nombre de mesa: el del archivo hace de nombre de entrega.
        const maestros = m.maestros.map((x) => aPintable(x.nombre ? x : { ...x, nombre: sinExtension(file.name) }));
        setLeido({ archivo: file.name, maestros, descartadas: m.descartadas, avisos: m.avisos });
        if (maestros.length) setAvance(null);
        else fallar({ clave: "ningunaMesa" });
      } catch (err) {
        console.error("[formatos-psd] lienzos", err);
        fallar({ clave: "desconocido" });
      }
    };
    try {
      worker.postMessage(datos, [datos]);
    } catch (err) {
      console.error("[formatos-psd] worker", err);
      cerrar({ clave: "desconocido" });
    }
  };

  // Un PSD soltado FUERA del cuadro haría que el navegador lo abra o lo descargue y se pierda la pantalla: la
  // página entera recibe el archivo.
  const alSoltar = useEffectEvent((e: DragEvent) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    setOver(false);
    const archivo = e.dataTransfer.files[0];
    if (archivo && !leyendo) void abrir(archivo);
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
  const filas = useMemo(
    () => (leido?.maestros.length ? medidas.map((m) => ({ m, ...acomodarMedida(leido.maestros, m.w, m.h, { heroLado: lados[clave(m)] }) })) : []),
    [leido, medidas, lados],
  );
  const porRevisar = filas.filter((f) => f.acomodo.avisos.length).length;
  const volteables = filas.filter((f) => sePuedeVoltear(f.acomodo.familia));
  const hayGuia = filas.some((f) => f.guia);
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
        {leyendo ? textoAvance : aviso ? `${aviso.texto}${aviso.n % 2 ? "​" : ""}` : resumen}
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

      {!usables.length ? (
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
                {leyendo ? tx(FP.leyendoAyuda, lang) : `${tx(FP.subirAyuda, lang)} ${rellenar(tx(FP.subirTipos, lang), { mb: MB_MAX })}`}
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
                <p>{rellenar(tx(FP_ERROR[falla.clave], lang), { mb: MB_MAX })}</p>
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
                {hayGuia && (
                  <Button variant="outline" size="lg" className={BOTON} onClick={() => setGuiaOn((v) => !v)} aria-pressed={guiaOn} aria-describedby="psd-zona-ayuda">
                    {guiaOn ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />} {tx(FP.zona, lang)}
                  </Button>
                )}
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
            {hayGuia && (
              <p id="psd-zona-ayuda" className="mb-3 text-xs text-muted-foreground">
                {rellenar(tx(FP.zonaAyuda, lang), { a: ZONA_HISTORIA_PCT.arriba, b: ZONA_HISTORIA_PCT.abajo })}
              </p>
            )}
            {/* Dos columnas cuando la COLUMNA de resultados da para ello (la barra y el panel de al lado la angostan);
                las horizontales y los banners ocupan la fila entera. El orden es el de la lista del cliente. */}
            <ul className="grid items-start gap-4 @xl:grid-cols-2">
              {medidas.map((m) => (
                <TarjetaMedida key={clave(m)} maestros={usables} medida={m} lado={lados[clave(m)] ?? "derecha"} guiaOn={guiaOn} lang={lang} alVoltear={voltear} registrar={registrar} />
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

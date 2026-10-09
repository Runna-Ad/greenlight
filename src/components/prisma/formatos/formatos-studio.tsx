"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Clock, Download, ExternalLink, ImagePlus, Languages, Loader2, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { zipSync } from "fflate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { tx, type Lang } from "@/lib/prisma/copy";
import { useLang } from "@/components/prisma/use-lang";
import { confirmarLote, crearLote, loteDesdeResultado, prepararSalidas, verSalidas } from "@/app/(app)/prisma/formatos-actions";
import {
  HEX, LADO_MAX, LADO_MIN, MODOS, PLATAFORMAS, PRESETS, FUENTE_MAX_BYTES, agrandaPct, encajar, idCustom, leerMedidas, lienzoIA, limpiarNombre, medidaValida, nombreArchivo, sugerir,
  type Encaje, type Modo, type Preset,
} from "@/lib/prisma/formatos/geometria";
import { FX, MODO_AYUDA, MODO_LABEL, PLATAFORMA_LABEL } from "@/lib/prisma/formatos/copy";
import { BUCKET_FORMATOS, MIME_A_EXT, type LoteVista, type SalidaVista } from "@/lib/prisma/formatos/vista";

export type MarcaColores = { id: string; clientId: string; nombre: string; colores: string[] };
type Eleccion = { on: boolean; modo: Modo; color: string };
/** Cómo terminó UN tamaño: "parar" = el servidor frenó por exceso (no tiene sentido mandar los demás). */
type Fin = "listo" | "error" | "enCurso" | "parar";

const CONCURRENCIA = 4;
const MAX_TAMANOS = 20;
/** Cada cuánto se pregunta por los tamaños que se están armando fuera de esta tanda (otra pestaña, respuesta cortada). */
const SONDEO_MS = 5_000;
const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

const usd = (n: number, lang: Lang) => (n <= 0 ? tx(FX.gratis, lang) : `${new Intl.NumberFormat(lang === "es" ? "es-MX" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} USD`);
const f = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/** Corre `fn` sobre cada item con a lo sumo `n` a la vez; `seguir()` en falso deja de tomar nuevos. */
async function enCola<T>(items: T[], n: number, fn: (t: T) => Promise<void>, seguir: () => boolean): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length && seguir()) await fn(items[i++]);
    }),
  );
}

/** fetch que falla si la respuesta no es 2xx (un enlace vencido devuelve JSON de error, no la imagen). */
async function bytesDe(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return new Uint8Array(await res.arrayBuffer());
}

/** Dónde cae el anuncio en un tamaño (con el recorte de fondo liso que calculó el servidor). La MISMA cuenta
 *  que hace componer() al armarlo: la vista previa y el resultado coinciden. */
const encajeDe = (lote: LoteVista, p: Pick<Preset, "w" | "h">): Encaje => encajar(lote.w, lote.h, p.w, p.h, lote.bordes.recortable);
const sugerencia = (lote: LoteVista, p: Pick<Preset, "w" | "h">) => sugerir(encajeDe(lote, p), lote.bordes.liso);
/** % del original escalado que se recortó (fondo liso), o null si no se recortó nada. */
const recortePct = (e: Encaje): number | null => {
  const p = Math.round((1 - (e.sw * e.sh) / (e.completo.w * e.completo.h)) * 100);
  return p >= 1 ? p : null;
};

function eleccionInicial(lote: LoteVista, p: Preset, iaOn: boolean): Eleccion {
  const s = sugerencia(lote, p);
  return { on: s.encendido, modo: s.modo === "ia" && !iaOn ? "blur" : s.modo, color: lote.colorBorde };
}

/** Miniatura de proporciones: el recuadro es el tamaño final y el bloque de adentro, dónde cae el anuncio. */
function Proporcion({ lote, p, apagado }: { lote: LoteVista; p: Preset; apagado: boolean }) {
  const e = encajeDe(lote, p);
  const k = 44 / Math.max(p.w, p.h);
  return (
    <span className={cn("relative flex size-12 shrink-0 items-center justify-center", apagado && "opacity-50")} aria-hidden="true">
      <span className="relative block rounded-[3px] border border-border bg-secondary" style={{ width: Math.max(4, p.w * k), height: Math.max(4, p.h * k) }}>
        <span className="absolute rounded-[2px] bg-primary/70" style={{ left: `${(e.ox / p.w) * 100}%`, top: `${(e.oy / p.h) * 100}%`, width: `${(e.sw / p.w) * 100}%`, height: `${(e.sh / p.h) * 100}%` }} />
      </span>
    </span>
  );
}

export function FormatosStudio({
  marcas,
  iaOn,
  resultadoId = null,
  demo = null,
}: {
  marcas: MarcaColores[];
  iaOn: boolean;
  resultadoId?: string | null;
  /** Sólo dev (`?demo=formatos`): lote y salidas de muestra, sin servidor. */
  demo?: { lote: LoteVista; salidas: SalidaVista[] } | null;
}) {
  const [lang, setLang] = useLang();
  const esDemo = !!demo;
  const [lote, setLote] = useState<LoteVista | null>(demo?.lote ?? null);
  /** Vista previa local del archivo recién subido (no se vuelve a bajar del bucket). */
  const [previa, setPrevia] = useState<string | null>(null);
  const [marcaId, setMarcaId] = useState<string>("");
  const [subiendo, setSubiendo] = useState<null | "subiendo" | "revisando" | "resultado">(null);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [customs, setCustoms] = useState<Preset[]>([]);
  const [cw, setCw] = useState("");
  const [ch, setCh] = useState("");
  const [errorMedida, setErrorMedida] = useState<string | null>(null);
  const [lista, setLista] = useState("");
  const [errorLista, setErrorLista] = useState<string | null>(null);
  /** Lo que hizo la última lista pegada (visible bajo el cuadro; el lector de pantalla lo oye por `aviso`). */
  const [resumenLista, setResumenLista] = useState<string | null>(null);
  const [eleccion, setEleccion] = useState<Record<string, Eleccion>>(() => (demo ? Object.fromEntries(PRESETS.map((p) => [p.id, eleccionInicial(demo.lote, p, iaOn)])) : {}));
  const [salidas, setSalidas] = useState<Record<string, SalidaVista>>(() => Object.fromEntries((demo?.salidas ?? []).map((s) => [s.preset, s])));
  /** Los tamaños de la tanda en curso (el progreso cuenta sólo éstos). */
  const [tanda, setTanda] = useState<string[]>([]);
  const [corriendo, setCorriendo] = useState(false);
  const [zipeando, setZipeando] = useState(false);
  const [confirmarCambio, setConfirmarCambio] = useState(false);
  const [aviso, setAviso] = useState("");
  /** Tamaños cuyo PNG/JPG se está bajando ahora (botón ocupado). */
  const [bajando, setBajando] = useState<string | null>(null);
  const vivo = useRef(true);
  const tituloTamanos = useRef<HTMLHeadingElement>(null);
  const tituloResultados = useRef<HTMLHeadingElement>(null);
  const zonaSubida = useRef<HTMLInputElement>(null);
  const botonCambiar = useRef<HTMLButtonElement>(null);
  const primeraConfirmacion = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    vivo.current = true;
    return () => {
      // Al salir de la pantalla la cola deja de tomar tamaños nuevos (no se sigue cobrando IA en segundo plano).
      vivo.current = false;
    };
  }, []);
  useEffect(() => () => void (previa && URL.revokeObjectURL(previa)), [previa]);

  const colores = useMemo(() => marcas.find((m) => m.id === marcaId)?.colores ?? [], [marcas, marcaId]);
  const todos = [...PRESETS, ...customs];

  const empezar = (l: LoteVista, url: string | null = null) => {
    setLote(l);
    setPrevia(url);
    setSalidas({});
    setTanda([]);
    setErrorSubida(null);
    setConfirmarCambio(false);
    if (!marcaId && l.clientId) setMarcaId(marcas.find((m) => m.clientId === l.clientId)?.id ?? "");
    setEleccion(Object.fromEntries([...PRESETS, ...customs].map((p) => [p.id, eleccionInicial(l, p, iaOn)])));
  };

  // Foco al cambiar de etapa (un efecto, no requestAnimationFrame: corre DESPUÉS de que React montó el destino).
  // Subir → la lista de tamaños; "Cambiar anuncio" → el cuadro de subida. Al montar no se mueve nada.
  const hayLote = !!lote;
  const montado = useRef(false);
  useEffect(() => {
    if (!montado.current) return void (montado.current = true);
    if (hayLote) tituloTamanos.current?.focus();
    else zonaSubida.current?.focus();
  }, [hayLote]);
  // La confirmación de "Cambiar anuncio": al abrirse, el foco entra; al cancelarla, vuelve al botón.
  const confirmacionAbierta = useRef(false);
  useEffect(() => {
    if (confirmarCambio) primeraConfirmacion.current?.focus();
    else if (confirmacionAbierta.current) botonCambiar.current?.focus();
    confirmacionAbierta.current = confirmarCambio;
  }, [confirmarCambio]);

  // "Adaptar formatos" desde un resultado (la página trae ?resultado=<id>): se pide al montar. La acción es
  // idempotente (reusa el lote), así que recargar no copia la imagen otra vez.
  const alLlegarResultado = useEffectEvent((r: Awaited<ReturnType<typeof loteDesdeResultado>>) => {
    setSubiendo(null);
    if (!r.ok) return void setErrorSubida(f(tx(FX.resultadoError, lang), { e: r.error }));
    empezar(r);
  });
  useEffect(() => {
    if (!resultadoId || esDemo) return;
    let activo = true;
    void (async () => {
      setSubiendo("resultado");
      const r = await loteDesdeResultado(resultadoId);
      if (activo) alLlegarResultado(r);
    })();
    return () => {
      activo = false;
    };
  }, [resultadoId, esDemo]);

  const subir = async (file: File) => {
    // Algunos sistemas no reportan el tipo (file.type vacío): se usa la extensión. El servidor revisa los bytes igual.
    const porNombre = /\.(png|jpe?g|webp)$/i.exec(file.name)?.[1].toLowerCase().replace("jpeg", "jpg");
    const ext = (MIME_A_EXT as Record<string, string>)[file.type] ?? (file.type ? undefined : porNombre);
    const tipo = file.type || Object.entries(MIME_A_EXT).find(([, e]) => e === ext)?.[0] || "";
    setErrorSubida(null);
    if (!ext) return void setErrorSubida(tx(FX.subirTipoMal, lang));
    if (file.size > FUENTE_MAX_BYTES) return void setErrorSubida(tx(FX.subirPeso, lang));
    setSubiendo("subiendo");
    try {
      const c = await crearLote({ nombre: file.name.replace(/\.[^.]+$/, ""), ext, marcaId: marcaId || null });
      if (!c.ok) return void setErrorSubida(c.error);
      // Directo al bucket privado con la URL firmada: el archivo no pasa por el servidor de la app.
      const up = await createClient().storage.from(BUCKET_FORMATOS).uploadToSignedUrl(c.path, c.token, file, { contentType: tipo });
      if (up.error) return void setErrorSubida(tx(FX.subirError, lang));
      setSubiendo("revisando");
      const r = await confirmarLote(c.loteId);
      if (!r.ok) return void setErrorSubida(r.error);
      empezar(r, URL.createObjectURL(file));
    } catch {
      setErrorSubida(tx(FX.sinConexion, lang));
    } finally {
      setSubiendo(null);
    }
  };

  const cambiarAnuncio = () => {
    confirmacionAbierta.current = false; // el foco va al cuadro de subida, no al botón que desaparece
    setLote(null);
    setPrevia(null);
    setConfirmarCambio(false);
  };

  const elegidos = lote ? todos.filter((p) => eleccion[p.id]?.on) : [];
  const lleno = elegidos.length >= MAX_TAMANOS;
  const cambiar = (id: string, cambio: Partial<Eleccion>) =>
    setEleccion((prev) => {
      const actual = prev[id];
      // Encender (marcando la casilla o eligiendo un modo en una fila apagada) respeta SIEMPRE el tope.
      const quiereEncender = cambio.on === true || (!!cambio.modo && !actual.on);
      const on = quiereEncender ? actual.on || !lleno : (cambio.on ?? actual.on);
      return { ...prev, [id]: { ...actual, ...cambio, on } };
    });

  /** Un tamaño elegido que ya está listo con el MISMO relleno no se vuelve a generar (ni se vuelve a cobrar). */
  const yaListo = (p: Preset) => {
    const s = salidas[p.id];
    const el = eleccion[p.id];
    return !!s && s.estado === "listo" && s.modo === el?.modo && (el.modo !== "color" || s.color === el.color);
  };
  const porGenerar = elegidos.filter((p) => !yaListo(p) && salidas[p.id]?.estado !== "procesando");
  const iaPorGenerar = porGenerar.filter((p) => eleccion[p.id].modo === "ia");
  const estimado = lote ? Math.round(iaPorGenerar.reduce((s, p) => s + lienzoIA(lote.w, lote.h, p.w, p.h).costoUsd, 0) * 1000) / 1000 : 0;

  const agregarCustom = (ev: FormEvent) => {
    ev.preventDefault();
    const w = Number(cw);
    const h = Number(ch);
    if (!lote || !medidaValida(w, h)) return void setErrorMedida(f(tx(FX.medidaInvalida, lang), { min: LADO_MIN, max: LADO_MAX }));
    const id = idCustom(w, h);
    const existente = todos.find((p) => p.w === w && p.h === h);
    if (existente) {
      const cabe = eleccion[existente.id]?.on || !lleno;
      setErrorMedida(cabe ? tx(FX.medidaYaEsta, lang) : f(tx(FX.maxTamanos, lang), { n: MAX_TAMANOS }));
      return void (cabe && cambiar(existente.id, { on: true }));
    }
    setErrorMedida(null);
    setCustoms((prev) => [...prev, { id, plataforma: "otro", w, h }]);
    setEleccion((prev) => ({ ...prev, [id]: { ...eleccionInicial(lote, { id, plataforma: "otro", w, h }, iaOn), on: !lleno } }));
    setAviso(f(tx(FX.medidaAgregada, lang), { w, h }));
    setCw("");
    setCh("");
  };
  /** Pegar la lista del cliente: se eligen EXACTAMENTE esas medidas (las que ya existían como preset se
   *  reusan con su plataforma; las demás entran como medida libre). Las que requieren rediseño quedan en la
   *  lista pero apagadas, igual que al elegir a mano. */
  const usarLista = (ev: FormEvent) => {
    ev.preventDefault();
    if (!lote) return;
    const { medidas, fuera } = leerMedidas(lista);
    if (!medidas.length) return void setErrorLista(fuera.length ? tx(FX.pegarNada, lang) + f(tx(FX.pegarFuera, lang), { m: fuera.join(", ") }) : tx(FX.pegarNada, lang));
    const caben = medidas.slice(0, MAX_TAMANOS);
    const nuevos: Preset[] = caben.filter((m) => !todos.some((p) => p.w === m.w && p.h === m.h)).map((m) => ({ id: idCustom(m.w, m.h), plataforma: "otro", w: m.w, h: m.h }));
    const enLista = new Set(caben.map((m) => `${m.w}x${m.h}`));
    let on = 0;
    let rediseno = 0;
    const siguiente = Object.fromEntries(
      [...todos, ...nuevos].map((p) => {
        const sug = eleccionInicial(lote, p, iaOn);
        const pedida = enLista.has(`${p.w}x${p.h}`);
        if (pedida && sug.on) on++;
        if (pedida && !sug.on) rediseno++;
        return [p.id, { ...(eleccion[p.id] ?? sug), on: pedida && sug.on }];
      }),
    );
    setCustoms((prev) => [...prev, ...nuevos]);
    setEleccion(siguiente);
    setErrorLista(null);
    setLista("");
    const resumen =
      f(tx(FX.pegarListo, lang), { n: caben.length, on }) +
      (rediseno ? f(tx(FX.pegarRediseno, lang), { r: rediseno }) : "") +
      (fuera.length ? f(tx(FX.pegarFuera, lang), { m: fuera.join(", ") }) : "") +
      (medidas.length > MAX_TAMANOS ? f(tx(FX.pegarTope, lang), { n: MAX_TAMANOS }) : "");
    setResumenLista(resumen);
    setAviso(resumen);
  };
  const quitarCustom = (id: string) => {
    setCustoms((prev) => prev.filter((p) => p.id !== id));
    setEleccion((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id)));
  };

  const procesar = async (s: SalidaVista): Promise<Fin> => {
    setSalidas((prev) => ({ ...prev, [s.preset]: { ...(prev[s.preset] ?? s), id: s.id, modo: s.modo, estado: "procesando", error: null } }));
    const poner = (estado: SalidaVista["estado"], error: string | null) => setSalidas((prev) => ({ ...prev, [s.preset]: { ...prev[s.preset], estado, error } }));
    try {
      const res = await fetch("/api/prisma/formatos/tamano", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ salidaId: s.id }) });
      const r = (await res.json().catch(() => null)) as ({ ok: true; salida: SalidaVista } | { ok: false; error: string; enCurso?: boolean }) | null;
      if (r?.ok) {
        setSalidas((prev) => ({ ...prev, [s.preset]: r.salida }));
        return "listo";
      }
      // Otra pestaña/llamada lo está armando: no es un error (el sondeo trae cómo termina).
      if (r && "enCurso" in r && r.enCurso) {
        poner("procesando", tx(FX.enOtraPestana, lang));
        return "enCurso";
      }
      poner("error", r?.error ?? tx(FX.sinConexion, lang));
      return res.status === 429 ? "parar" : "error";
    } catch {
      poner("error", tx(FX.sinConexion, lang));
      return "error";
    }
  };

  const generar = async (lista: Preset[]) => {
    if (!lote || esDemo || corriendo) return;
    if (!lista.length) return void toast.error(tx(FX.elegirAlMenosUno, lang));
    setCorriendo(true);
    setTanda(lista.map((p) => p.id));
    const fines: Fin[] = [];
    // Optimista: las tarjetas aparecen YA ("En fila"); una tarjeta que se rehace conserva su imagen mientras tanto.
    const previas = salidas;
    setSalidas((prev) => ({
      ...prev,
      ...Object.fromEntries(
        lista.map((p) => [
          p.id,
          {
            ...(prev[p.id] ?? { id: `tmp-${p.id}`, preset: p.id, ancho: p.w, alto: p.h, color: null, pngUrl: null, jpgUrl: null, pixelLockOk: null, deriva: null, revisarUnion: false, costoEstimadoUsd: 0, costoRealUsd: null }),
            modo: eleccion[p.id].modo,
            estado: "pendiente" as const,
            error: null,
          },
        ]),
      ),
    }));
    if (!Object.keys(previas).length) requestAnimationFrame(() => tituloResultados.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    try {
      const r = await prepararSalidas(lote.id, lista.map((p) => ({ preset: p.id, modo: eleccion[p.id].modo, color: eleccion[p.id].color })));
      if (!r.ok) {
        setSalidas(previas);
        setTanda([]);
        return void toast.error(r.error);
      }
      // Lo que el servidor dejó "procesando" (otra pestaña) no se vuelve a pedir.
      const aCorrer = r.salidas.filter((s) => s.estado !== "procesando");
      setSalidas((prev) => ({
        ...prev,
        ...Object.fromEntries(r.salidas.map((s) => [s.preset, s.estado === "procesando" ? { ...s, error: tx(FX.enOtraPestana, lang) } : { ...s, pngUrl: prev[s.preset]?.pngUrl ?? s.pngUrl, jpgUrl: prev[s.preset]?.jpgUrl ?? s.jpgUrl, estado: "pendiente" as const }])),
      }));
      let frenado = false;
      await enCola(
        aCorrer,
        CONCURRENCIA,
        async (s) => {
          const fin = await procesar(s);
          fines.push(fin);
          if (fin === "parar") frenado = true;
        },
        () => vivo.current && !frenado,
      );
      // Si el servidor frenó por exceso, los que no alcanzaron a salir quedan como error (aparece "Reintentar").
      if (frenado) {
        const sinSalir = new Set(aCorrer.map((s) => s.preset));
        setSalidas((prev) => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(prev)
              .filter(([k, v]) => sinSalir.has(k) && v.estado === "pendiente")
              .map(([k, v]) => [k, { ...v, estado: "error" as const, error: tx(FX.frenado, lang) }]),
          ),
        }));
      }
      if (!vivo.current) return;
      // Resumen de ESTA tanda, con lo que devolvió cada tamaño (nada se infiere del estado de la pantalla).
      const ok = fines.filter((x) => x === "listo").length;
      const mal = fines.filter((x) => x === "error" || x === "parar").length + (frenado ? aCorrer.length - fines.length : 0);
      const enCurso = lista.length - ok - mal;
      if (!ok && !mal) return;
      const msg = mal ? f(tx(FX.resumen, lang), { ok, mal }) : ok === 1 ? tx(FX.resumenUno, lang) : f(tx(FX.resumenOk, lang), { ok });
      const conEnCurso = enCurso > 0 ? `${msg} · ${f(tx(FX.resumenEnCurso, lang), { n: enCurso })}` : msg;
      setAviso(conEnCurso);
      // Un solo tamaño (rehacer) ya se ve en su tarjeta: sólo el aviso para lector de pantalla, sin toast.
      if (lista.length > 1) (mal ? toast.error : toast.success)(conEnCurso);
    } catch {
      setSalidas(previas);
      setTanda([]);
      toast.error(tx(FX.sinConexion, lang));
    } finally {
      setCorriendo(false);
    }
  };

  // Progreso de la tanda en curso (sólo para el botón y el aviso "live").
  const listosTanda = tanda.filter((id) => salidas[id]?.estado === "listo").length;

  /** Trae del servidor el estado y URLs recién firmadas (sólo lee). Devuelve lo del SERVIDOR (no se lee de vuelta
   *  del estado de React: el updater de setState no corre necesariamente en el acto), o null si falló. */
  const refrescar = async (): Promise<Record<string, SalidaVista> | null> => {
    if (!lote || esDemo) return null;
    try {
      const r = await verSalidas(lote.id);
      if (!r.ok || !vivo.current) return null;
      const delServidor: Record<string, SalidaVista> = Object.fromEntries(r.salidas.map((x) => [x.preset, x]));
      setSalidas((prev) =>
        // Sólo se actualiza lo que la pantalla ya muestra; lo "pendiente" de una tanda local no se pisa.
        Object.fromEntries(
          Object.entries(prev).map(([k, v]) => {
            const srv = delServidor[k];
            if (!srv || v.estado === "pendiente") return [k, v];
            return [k, srv.estado === "procesando" ? { ...srv, pngUrl: srv.pngUrl ?? v.pngUrl, error: v.error } : srv];
          }),
        ),
      );
      return delServidor;
    } catch {
      return null;
    }
  };

  // Sondeo: un tamaño que quedó "armándose" fuera de la tanda (otra pestaña, o la respuesta se cortó) se sigue
  // hasta que termine. El servidor da por muerto uno sin noticias en 4 min (y entonces aparece "Reintentar").
  const hayArmandose = !corriendo && !esDemo && Object.values(salidas).some((x) => x.estado === "procesando");
  const sondear = useEffectEvent(() => void refrescar());
  useEffect(() => {
    if (!hayArmandose) return;
    const t = setInterval(sondear, SONDEO_MS);
    return () => clearInterval(t);
  }, [hayArmandose]);

  const listas = todos.map((p) => salidas[p.id]).filter((s): s is SalidaVista => !!s && s.estado === "listo" && !!s.pngUrl && !!s.jpgUrl);
  const fallidos = todos.filter((p) => salidas[p.id]?.estado === "error");
  const costoReal = Object.values(salidas).reduce((sum, s) => sum + (s.costoRealUsd ?? 0), 0);
  // Los resultados viven en esta pantalla: salir sin descargarlos (o con tamaños armándose) pide confirmación.
  const hayQuePerder = !esDemo && (corriendo || listas.length > 0);
  useEffect(() => {
    if (!hayQuePerder) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [hayQuePerder]);
  const presetDeSalida = (s: SalidaVista): Preset => todos.find((p) => p.id === s.preset) ?? { id: s.preset, plataforma: "otro", w: s.ancho, h: s.alto };

  /** Baja un archivo; si el enlace venció (1 h), pide enlaces nuevos al servidor y reintenta UNA vez. */
  const bajar = async (p: Preset, ext: "png" | "jpg") => {
    if (bajando) return;
    setBajando(`${p.id}.${ext}`);
    const urlDe = (m: Record<string, SalidaVista> | null) => (ext === "png" ? m?.[p.id]?.pngUrl : m?.[p.id]?.jpgUrl) ?? null;
    try {
      let bytes: Uint8Array;
      try {
        bytes = await bytesDe(urlDe(salidas)!);
      } catch {
        const url = urlDe(await refrescar());
        if (!url) throw new Error("sin enlace");
        bytes = await bytesDe(url);
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bytes as BlobPart]));
      a.download = nombreArchivo(lote!.nombre, p, ext);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch {
      toast.error(tx(FX.enlaceVencido, lang));
    } finally {
      setBajando(null);
    }
  };

  const bajarZip = async () => {
    if (!lote || !listas.length) return;
    setZipeando(true);
    // Arma el ZIP con las salidas dadas; al primer archivo que falla deja de pedir los demás.
    const juntar = async (cuales: SalidaVista[]) => {
      const archivos: Record<string, Uint8Array> = {};
      let fallo: unknown = null;
      await enCola(
        cuales,
        CONCURRENCIA,
        async (s) => {
          try {
            const p = presetDeSalida(s);
            const [png, jpg] = await Promise.all([bytesDe(s.pngUrl!), bytesDe(s.jpgUrl!)]);
            archivos[`png/${nombreArchivo(lote.nombre, p, "png")}`] = png;
            archivos[`jpg/${nombreArchivo(lote.nombre, p, "jpg")}`] = jpg;
          } catch (e) {
            fallo = e;
          }
        },
        () => !fallo,
      );
      if (fallo) throw fallo;
      return archivos;
    };
    try {
      let archivos: Record<string, Uint8Array>;
      try {
        archivos = await juntar(listas);
      } catch {
        // Lo más probable: enlaces vencidos (1 h). Se piden nuevos y se intenta una vez más.
        const nuevo = await refrescar();
        if (!nuevo) throw new Error("sin enlaces");
        archivos = await juntar(Object.values(nuevo).filter((s) => s.estado === "listo" && !!s.pngUrl && !!s.jpgUrl));
      }
      // Nivel 0: PNG y JPG ya vienen comprimidos; recomprimir sólo gasta tiempo.
      const zip = zipSync(archivos, { level: 0 });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
      a.download = `${limpiarNombre(lote.nombre)}_formatos.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      toast.success(tx(FX.zipListo, lang));
    } catch {
      toast.error(tx(FX.enlaceVencido, lang));
    } finally {
      setZipeando(false);
    }
  };

  const botonGenerar = (extra?: string) => (
    <Button className={cn("w-full", extra)} onClick={() => void generar(porGenerar)} disabled={corriendo || esDemo || porGenerar.length === 0} aria-busy={corriendo}>
      {corriendo ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {corriendo
        ? f(tx(FX.progreso, lang), { listos: listosTanda, n: tanda.length })
        : porGenerar.length === 1
          ? tx(FX.generarUno, lang)
          : f(tx(FX.generar, lang), { n: porGenerar.length })}
    </Button>
  );
  const costoTexto = (
    <>
      <p className="text-sm font-medium text-foreground">
        {tx(FX.costoAntes, lang)}: {usd(estimado, lang)}
      </p>
      <p className="text-xs text-muted-foreground">
        {porGenerar.length === 0 && elegidos.length > 0 ? tx(FX.todoListo, lang) : f(tx(FX.porGenerar, lang), { n: porGenerar.length, ia: iaPorGenerar.length })}
      </p>
    </>
  );

  return (
    <div className="prisma-root mx-auto max-w-6xl pb-24 lg:pb-0">
      {/* Un solo anuncio para lectores de pantalla (progreso y resúmenes); nada más en la página es "live". */}
      <p role="status" className="sr-only">
        {corriendo ? f(tx(FX.progreso, lang), { listos: listosTanda, n: tanda.length }) : aviso}
      </p>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href="/prisma" className={cn("mb-2 inline-flex items-center gap-1 rounded text-sm text-muted-foreground hover:text-foreground", FOCO)}>
            <ArrowLeft className="size-4" aria-hidden="true" /> {tx(FX.volver, lang)}
          </Link>
          <h1 className="font-heading text-[34px] font-bold leading-none tracking-tight text-foreground md:text-[44px]">
            HÜE <span className="p-spectrum-text">{tx(FX.titulo, lang)}</span>
          </h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">{tx(FX.tagline, lang)}</p>
          {esDemo && <p className="mt-1 text-xs font-medium text-muted-foreground">{tx(FX.demo, lang)}</p>}
        </div>
        <button
          type="button"
          onClick={() => setLang(lang === "es" ? "en" : "es")}
          className={cn("inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary", FOCO)}
          aria-label={lang === "es" ? "Switch to English" : "Cambiar a español"}
        >
          <Languages className="size-3.5" aria-hidden="true" /> {lang === "es" ? "EN" : "ES"}
        </button>
      </div>

      {marcas.length > 0 && (
        <div className="mb-4">
          <label htmlFor="formatos-marca" className="text-xs font-medium text-muted-foreground">
            {tx(FX.marca, lang)}
          </label>
          <select
            id="formatos-marca"
            value={marcaId}
            onChange={(e) => setMarcaId(e.target.value)}
            disabled={!!subiendo}
            className="mt-1 h-10 w-full max-w-xs rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">{tx(FX.sinMarca, lang)}</option>
            {marcas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>
      )}

      {!lote ? (
        <section className="p-enter max-w-2xl space-y-3" aria-label={tx(FX.subir, lang)}>
          {/* <label>, no <button>: mismo patrón que "¿Cómo salió?" (el input de archivo vive adentro). */}
          <label
            aria-busy={!!subiendo}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={(e) => {
              // Pasar por encima de un hijo también dispara dragleave: sólo cuenta salir del cuadro.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const archivo = e.dataTransfer.files?.[0];
              if (archivo && !subiendo) void subir(archivo);
            }}
            className={cn(
              "flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-dashed px-5 py-8 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              over ? "border-primary bg-primary/8" : "border-border bg-card/50 hover:border-primary",
              subiendo && "cursor-wait opacity-70",
            )}
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              {subiendo ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <ImagePlus className="size-5" aria-hidden="true" />}
            </span>
            <span className="min-w-0">
              <span className="block text-base font-medium text-foreground">
                {subiendo === "subiendo" ? tx(FX.subiendo, lang) : subiendo === "revisando" ? tx(FX.revisando, lang) : subiendo === "resultado" ? tx(FX.cargandoResultado, lang) : tx(FX.subir, lang)}
              </span>
              <span id="formatos-subir-ayuda" className="block text-sm text-muted-foreground">
                {tx(FX.subirAyuda, lang)} {tx(FX.subirTipos, lang)}
              </span>
            </span>
            <input
              ref={zonaSubida}
              type="file"
              accept={Object.keys(MIME_A_EXT).join(",")}
              className="sr-only"
              aria-label={tx(FX.subir, lang)}
              aria-describedby={errorSubida ? "formatos-subir-ayuda formatos-subir-error" : "formatos-subir-ayuda"}
              disabled={!!subiendo}
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                e.target.value = "";
                if (archivo) void subir(archivo);
              }}
            />
          </label>
          {errorSubida && (
            <p id="formatos-subir-error" role="alert" className="flex items-start gap-1.5 text-sm text-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" /> {errorSubida}
            </p>
          )}
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* Columna izquierda: el original y el costo; se queda a la vista al bajar por la lista (en escritorio). */}
          <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{tx(FX.original, lang)}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previa ?? lote.url} alt="" style={{ aspectRatio: `${lote.w} / ${lote.h}` }} className="mt-2 max-h-64 w-full rounded-lg bg-secondary object-contain" />
              <p className="mt-2 text-xs text-muted-foreground">
                {lote.nombre} · {lote.w}×{lote.h}
              </p>
              {confirmarCambio ? (
                <div className="mt-2 space-y-2 rounded-lg border border-border p-2" role="group" aria-label={tx(FX.cambiar, lang)}>
                  <p className="text-xs text-foreground">{f(tx(FX.cambiarConfirmar, lang), { n: listas.length })}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button ref={primeraConfirmacion} size="sm" variant="secondary" onClick={() => void bajarZip()} disabled={zipeando}>
                      <Download className="size-4" aria-hidden="true" /> {tx(FX.bajarZip, lang)}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cambiarAnuncio}>
                      {tx(FX.siCambiar, lang)}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmarCambio(false)}>
                      {tx(FX.cancelar, lang)}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button ref={botonCambiar} size="sm" variant="ghost" className="mt-1 -ml-2" disabled={corriendo || esDemo} onClick={() => (listas.length ? setConfirmarCambio(true) : cambiarAnuncio())}>
                  {tx(FX.cambiar, lang)}
                </Button>
              )}
            </div>
            <div className="hidden rounded-xl border border-border bg-card p-3 lg:block">
              {costoTexto}
              {costoReal > 0 && <p className="mt-1 text-xs text-muted-foreground">{f(tx(FX.costoReal, lang), { c: usd(costoReal, lang) })}</p>}
              <div className="mt-3">{botonGenerar()}</div>
            </div>
          </aside>

          <div className="min-w-0 space-y-6">
            {/* Elegir tamaños, agrupados por plataforma */}
            <section aria-labelledby="formatos-tamanos">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 id="formatos-tamanos" ref={tituloTamanos} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">
                  {tx(FX.tamanos, lang)} <span className="text-sm font-normal text-muted-foreground">· {f(tx(FX.elegidos, lang), { n: elegidos.length })}</span>
                </h2>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={tx(FX.todosAria, lang)}
                    onClick={() =>
                      setEleccion((prev) => {
                        let n = 0;
                        return Object.fromEntries(
                          todos.filter((p) => prev[p.id]).map((p) => {
                            const rediseno = sugerencia(lote, p).rediseno;
                            const on = !rediseno && n < MAX_TAMANOS;
                            if (on) n++;
                            return [p.id, { ...prev[p.id], on }];
                          }),
                        );
                      })
                    }
                  >
                    {tx(FX.todos, lang)}
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={tx(FX.ningunoAria, lang)} onClick={() => setEleccion((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, on: false }])))}>
                    {tx(FX.ninguno, lang)}
                  </Button>
                </div>
              </div>

              {/* La lista del cliente, pegada tal cual (v2): lo más rápido cuando las medidas no son estándar. */}
              <form onSubmit={usarLista} noValidate className="mb-3 rounded-xl border border-border bg-card p-3" aria-labelledby="formatos-pegar">
                <label id="formatos-pegar" htmlFor="formatos-pegar-texto" className="text-sm font-medium text-foreground">
                  {tx(FX.pegarLista, lang)}
                </label>
                <p id="formatos-pegar-ayuda" className="mt-0.5 text-xs text-muted-foreground">
                  {tx(FX.pegarAyuda, lang)}
                </p>
                <div className="mt-2 flex flex-wrap items-start gap-2">
                  <textarea
                    id="formatos-pegar-texto"
                    value={lista}
                    rows={2}
                    onChange={(e) => {
                      setLista(e.target.value);
                      setErrorLista(null);
                      setResumenLista(null);
                    }}
                    aria-invalid={!!errorLista}
                    aria-describedby={errorLista ? "formatos-pegar-error" : "formatos-pegar-ayuda"}
                    className="min-h-10 min-w-0 flex-1 basis-60 resize-y rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs text-foreground [field-sizing:fixed]"
                  />
                  <Button type="submit" size="sm" variant="outline" className="h-10" disabled={!lista.trim() || corriendo}>
                    {tx(FX.pegarUsar, lang)}
                  </Button>
                </div>
                {errorLista ? (
                  <p id="formatos-pegar-error" role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs text-foreground">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden="true" /> {errorLista}
                  </p>
                ) : (
                  resumenLista && <p className="mt-1.5 text-xs text-muted-foreground">{resumenLista}</p>
                )}
              </form>

              {/* Leyenda visible: qué hace cada relleno y cuánto cuesta (antes vivía sólo en tooltips). */}
              <div className="mb-3 rounded-xl border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">{tx(FX.leyenda, lang)}</p>
                <ul className="mt-1 space-y-0.5">
                  {MODOS.map((m) => (
                    <li key={m}>
                      <span className="font-medium text-foreground">{tx(MODO_LABEL[m], lang)}</span>: {tx(MODO_AYUDA[m], lang)}
                    </li>
                  ))}
                </ul>
                {!iaOn && (
                  <p id="formatos-ia-apagada" className="mt-2 flex items-start gap-1.5 text-foreground">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden="true" /> {tx(FX.iaApagadaBanner, lang)}
                  </p>
                )}
                {lleno && <p className="mt-2 text-foreground">{f(tx(FX.maxTamanos, lang), { n: MAX_TAMANOS })}</p>}
              </div>

              <div className="space-y-4">
                {PLATAFORMAS.map((pl) => {
                  const grupo = todos.filter((p) => p.plataforma === pl && eleccion[p.id]);
                  if (!grupo.length) return null;
                  const idGrupo = `formatos-pl-${pl}`;
                  return (
                    <div key={pl}>
                      <h3 id={idGrupo} className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {tx(PLATAFORMA_LABEL[pl], lang)}
                      </h3>
                      <ul aria-labelledby={idGrupo} className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                        {grupo.map((p) => {
                          const el = eleccion[p.id];
                          const e = encajeDe(lote, p);
                          const s = sugerir(e, lote.bordes.liso);
                          const agranda = agrandaPct(e);
                          const recorta = recortePct(e);
                          const idCheck = `formatos-on-${p.id}`;
                          const nombre = `${tx(PLATAFORMA_LABEL[p.plataforma], lang)} ${p.w}×${p.h}`;
                          return (
                            <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                              <input
                                id={idCheck}
                                type="checkbox"
                                checked={el.on}
                                disabled={!el.on && lleno}
                                onChange={(ev) => cambiar(p.id, { on: ev.target.checked })}
                                aria-label={nombre}
                                className="size-5 cursor-pointer accent-[var(--primary)] disabled:cursor-not-allowed"
                              />
                              <Proporcion lote={lote} p={p} apagado={!el.on} />
                              <label htmlFor={idCheck} className="min-w-[120px] flex-1 cursor-pointer">
                                <span className={cn("block text-sm font-medium tabular-nums", el.on ? "text-foreground" : "text-muted-foreground")}>
                                  {p.w}×{p.h}
                                </span>
                                {s.rediseno && (
                                  <span className="mt-0.5 flex items-start gap-1 text-xs text-foreground">
                                    <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-600" aria-hidden="true" />
                                    <span>
                                      <span className="font-medium">{tx(FX.rediseno, lang)}</span>: {f(tx(FX.redisenoPorque, lang), { p: Math.round(e.cobertura * 100) })}
                                    </span>
                                  </span>
                                )}
                                {recorta && <span className="mt-0.5 block text-xs text-muted-foreground">{f(tx(FX.recorta, lang), { p: recorta })}</span>}
                                {agranda && (
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {f(tx(FX.seAmplia, lang), { x: e.escala.toLocaleString(lang === "es" ? "es-MX" : "en-US", { maximumFractionDigits: 1 }) })}
                                  </span>
                                )}
                              </label>
                              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                                {el.modo === "ia" && el.on && <span className="text-xs text-muted-foreground">{f(tx(FX.precioIa, lang), { c: usd(lienzoIA(lote.w, lote.h, p.w, p.h).costoUsd, lang) })}</span>}
                                <div role="group" aria-label={`${tx(FX.modoRelleno, lang)} · ${nombre}`} className="inline-flex rounded-lg border border-border p-0.5">
                                  {MODOS.map((m) => {
                                    const deshabilitado = m === "ia" && !iaOn;
                                    return (
                                      <button
                                        key={m}
                                        type="button"
                                        aria-pressed={el.modo === m}
                                        disabled={deshabilitado}
                                        aria-describedby={deshabilitado ? "formatos-ia-apagada" : undefined}
                                        onClick={() => cambiar(p.id, { modo: m })}
                                        className={cn(
                                          "min-h-10 cursor-pointer rounded-md px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-8",
                                          FOCO,
                                          el.modo === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                                        )}
                                      >
                                        {tx(MODO_LABEL[m], lang)}
                                      </button>
                                    );
                                  })}
                                </div>
                                {el.modo === "color" && el.on && (
                                  <div role="group" aria-label={`${tx(FX.colorRelleno, lang)} · ${nombre}`} className="flex items-center gap-1">
                                    <input
                                      type="color"
                                      value={HEX.test(el.color) ? el.color : "#000000"}
                                      onChange={(ev) => cambiar(p.id, { color: ev.target.value })}
                                      aria-label={`${tx(FX.colorRelleno, lang)} · ${nombre}`}
                                      className={cn("size-9 cursor-pointer rounded border border-border bg-transparent sm:size-8", FOCO)}
                                    />
                                    {[...new Set([lote.colorBorde, ...colores])].slice(0, 5).map((c, i) => (
                                      <button
                                        key={`${c}-${i}`}
                                        type="button"
                                        aria-pressed={el.color === c}
                                        aria-label={i === 0 ? tx(FX.colorBordeLabel, lang) : f(tx(FX.colorMarca, lang), { c })}
                                        title={i === 0 ? tx(FX.colorBordeLabel, lang) : c}
                                        onClick={() => cambiar(p.id, { color: c })}
                                        className={cn("size-8 cursor-pointer rounded-full border sm:size-6", FOCO, el.color === c ? "border-foreground ring-2 ring-ring" : "border-border")}
                                        style={{ background: c } as CSSProperties}
                                      />
                                    ))}
                                  </div>
                                )}
                                {p.plataforma === "otro" && (
                                  <button
                                    type="button"
                                    onClick={() => quitarCustom(p.id)}
                                    // Con resultado ya generado (o generándose) la medida se queda: quitarla escondería su tarjeta.
                                    disabled={corriendo || !!salidas[p.id]}
                                    aria-label={f(tx(FX.quitarMedida, lang), { w: p.w, h: p.h })}
                                    className={cn("flex size-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40", FOCO)}
                                  >
                                    <X className="size-4" aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
              <form onSubmit={agregarCustom} noValidate className="mt-3 flex flex-wrap items-end gap-2" aria-label={tx(FX.medidaLibre, lang)}>
                <label className="text-xs text-muted-foreground">
                  {tx(FX.ancho, lang)}
                  <input type="number" inputMode="numeric" min={LADO_MIN} max={LADO_MAX} value={cw} onChange={(e) => {
                      setCw(e.target.value);
                      setErrorMedida(null);
                    }} aria-invalid={!!errorMedida} aria-describedby={errorMedida ? "formatos-medida-error" : "formatos-medida-ayuda"} className="mt-1 block h-10 w-24 rounded-md border border-input bg-background px-2 text-sm text-foreground" />
                </label>
                <label className="text-xs text-muted-foreground">
                  {tx(FX.alto, lang)}
                  <input type="number" inputMode="numeric" min={LADO_MIN} max={LADO_MAX} value={ch} onChange={(e) => {
                      setCh(e.target.value);
                      setErrorMedida(null);
                    }} aria-invalid={!!errorMedida} aria-describedby={errorMedida ? "formatos-medida-error" : "formatos-medida-ayuda"} className="mt-1 block h-10 w-24 rounded-md border border-input bg-background px-2 text-sm text-foreground" />
                </label>
                <Button type="submit" size="sm" variant="outline" className="h-10" disabled={!cw || !ch}>
                  <Plus className="size-4" aria-hidden="true" /> {tx(FX.medidaLibre, lang)}
                </Button>
                {errorMedida ? (
                  <p key="error" id="formatos-medida-error" role="alert" className="flex w-full items-start gap-1.5 text-xs text-foreground">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden="true" /> {errorMedida}
                  </p>
                ) : (
                  <p key="ayuda" id="formatos-medida-ayuda" className="w-full text-xs text-muted-foreground">
                    {f(tx(FX.medidaInvalida, lang), { min: LADO_MIN, max: LADO_MAX })}
                  </p>
                )}
              </form>
            </section>

            {/* Resultados (orden fijo: el del catálogo, no el de llegada) */}
            {Object.keys(salidas).length > 0 && (
              <section aria-labelledby="formatos-resultados">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 id="formatos-resultados" ref={tituloResultados} className="scroll-mt-4 text-lg font-semibold text-foreground">
                    {tx(FX.resultados, lang)}
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {fallidos.length > 0 && !corriendo && (
                      <Button size="sm" variant="outline" disabled={esDemo} onClick={() => void generar(fallidos)}>
                        <RefreshCw className="size-4" aria-hidden="true" /> {tx(FX.reintentarFallidos, lang)}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => void bajarZip()} disabled={!listas.length || zipeando || corriendo || esDemo} aria-busy={zipeando} aria-describedby="formatos-zip-ayuda">
                      {zipeando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
                      {zipeando ? tx(FX.armandoZip, lang) : f(tx(FX.bajarZipN, lang), { n: listas.length })}
                    </Button>
                  </div>
                </div>
                <p id="formatos-zip-ayuda" className="mb-2 text-xs text-muted-foreground">
                  {tx(FX.zipAyuda, lang)}
                </p>
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {todos
                    .filter((p) => salidas[p.id])
                    .map((p) => {
                      const s = salidas[p.id];
                      const nombre = `${tx(PLATAFORMA_LABEL[p.plataforma], lang)} ${p.w}×${p.h}`;
                      const ocupado = s.estado === "pendiente" || s.estado === "procesando";
                      const modoRehacer = eleccion[p.id]?.modo ?? s.modo;
                      return (
                        <li key={p.id} className="flex flex-col rounded-xl border border-border bg-card p-3" aria-busy={ocupado}>
                          <div className="relative flex h-48 items-center justify-center overflow-hidden rounded-lg bg-[repeating-conic-gradient(var(--secondary)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                            {/* Si rehacer falló, la imagen anterior se esconde: la etiqueta ya dice el relleno NUEVO. */}
                            {s.pngUrl && s.estado !== "error" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={s.pngUrl} alt={nombre} loading="lazy" decoding="async" className={cn("max-h-full max-w-full object-contain", ocupado && "opacity-40")} />
                            ) : s.estado === "error" ? (
                              <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
                            ) : null}
                            {ocupado && (
                              <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                                {s.estado === "procesando" ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : <Clock className="size-6 text-muted-foreground" />}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="text-sm font-medium tabular-nums text-foreground">
                              {p.w}×{p.h}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {tx(PLATAFORMA_LABEL[p.plataforma], lang)} · {tx(MODO_LABEL[s.modo], lang)}
                            </p>
                          </div>
                          <div className="mt-1 space-y-1 text-xs">
                            {s.estado === "pendiente" && <p className="text-muted-foreground">{tx(FX.pendiente, lang)}</p>}
                            {s.estado === "procesando" && <p className="text-muted-foreground">{s.error ?? tx(FX.procesando, lang)}</p>}
                            {s.estado === "listo" && s.pixelLockOk && (
                              <p className="flex items-center gap-1 font-medium text-foreground">
                                <ShieldCheck className="size-3.5 text-status-completed" aria-hidden="true" /> {tx(FX.intactoCorto, lang)}
                              </p>
                            )}
                            {s.estado === "listo" && s.revisarUnion && (
                              <p className="flex items-start gap-1 text-foreground">
                                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden="true" /> {tx(FX.revisarUnionCorto, lang)}
                              </p>
                            )}
                            {s.estado === "error" && (
                              <p className="flex items-start gap-1 text-foreground">
                                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />
                                <span>
                                  <span className="font-medium">{tx(FX.error, lang)}</span>
                                  {s.error ? `: ${s.error}` : ""}
                                </span>
                              </p>
                            )}
                          </div>
                          <div className="mt-auto flex flex-wrap gap-2 pt-2">
                            {s.estado === "listo" && s.pngUrl && s.jpgUrl && (
                              <>
                                {(["png", "jpg"] as const).map((ext) => {
                                  const esta = bajando === `${p.id}.${ext}`;
                                  const etiqueta = tx(ext === "png" ? FX.bajarPng : FX.bajarJpg, lang);
                                  return (
                                    <Button key={ext} size="sm" variant="outline" disabled={esDemo || !!bajando} aria-busy={esta} aria-label={`${etiqueta} · ${nombre}`} onClick={() => void bajar(p, ext)}>
                                      {esta ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />} {etiqueta}
                                    </Button>
                                  );
                                })}
                                <Button size="sm" variant="ghost" asChild>
                                  <a href={s.pngUrl} target="_blank" rel="noopener noreferrer" aria-label={`${tx(FX.verGrande, lang)} · ${nombre}`}>
                                    <ExternalLink className="size-4" aria-hidden="true" /> {tx(FX.verGrande, lang)}
                                  </a>
                                </Button>
                              </>
                            )}
                            {/* Siempre montado (deshabilitado mientras corre): el foco no se pierde al rehacer. */}
                            {s.estado !== "pendiente" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={corriendo || esDemo || s.estado === "procesando"}
                                aria-label={`${s.estado === "listo" ? f(tx(FX.rehacerCon, lang), { m: tx(MODO_LABEL[modoRehacer], lang) }) : tx(FX.reintentar, lang)} · ${nombre}${modoRehacer === "ia" ? ` (${usd(lienzoIA(lote.w, lote.h, p.w, p.h).costoUsd, lang)})` : ""}`}
                                onClick={() => void generar([p])}
                              >
                                <RefreshCw className="size-4" aria-hidden="true" />
                                {s.estado === "listo" ? f(tx(FX.rehacerCon, lang), { m: tx(MODO_LABEL[modoRehacer], lang) }) : tx(FX.reintentar, lang)}
                                {modoRehacer === "ia" && <span className="text-muted-foreground">({usd(lienzoIA(lote.w, lote.h, p.w, p.h).costoUsd, lang)})</span>}
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </section>
            )}
          </div>

          {/* Móvil / tableta: costo y "Generar" siempre a mano, abajo. */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 p-3 backdrop-blur lg:hidden">
            <div className="mx-auto flex max-w-6xl items-center gap-3">
              <div className="min-w-0 flex-1">{costoTexto}</div>
              <div className="w-44 shrink-0">{botonGenerar()}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

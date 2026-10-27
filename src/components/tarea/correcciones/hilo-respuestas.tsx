"use client";

import { useId, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { BtnAccion } from "./btn-accion";
import { RESPUESTA_MAX, type Correccion, type DestinoRespuesta, type RespuestaCorreccion } from "@/lib/correcciones";

/**
 * El hilo bajo un cambio: las respuestas en orden y una caja para contestar. Lo usan el
 * panel interno Y el portal del cliente (un solo renderer: lo que el cliente ve de una
 * respuesta es lo mismo que ve el equipo). Quién recibe lo decide el server
 * (`destinoRespuesta`); aquí sólo se ENSEÑA en `vaPara`, antes de enviar.
 *
 * La caja empieza cerrada ("Responder") para que 30 tarjetas no sean 30 cajas de texto. El
 * texto a medio escribir vive en el padre (`texto`/`setTexto`), así sobrevive a que la
 * tarjeta se compacte; si hay borrador, la caja abre ya abierta.
 */
export function HiloRespuestas({
  c,
  responder,
  texto,
  setTexto,
  vaPara,
  alCliente,
  colorCliente,
  vistaCliente = false,
}: {
  c: Correccion;
  /** null = no puede responder aquí (sólo lee el hilo). */
  /** El tercer argumento es el destino que se ENSEÑÓ: el server rechaza si ya cambió. */
  responder: ((id: string, body: string, destinoEsperado: DestinoRespuesta) => Promise<string | null>) | null;
  texto: string;
  setTexto: (t: string) => void;
  /** "Va para: …" — a quién le llega lo que se escriba ahora. */
  vaPara: string;
  /** Lo que se escriba ahora lo lee el cliente: la caja lo dice en su color. */
  alCliente: boolean;
  /** Color de marca del cliente (badge de sus respuestas en el lado interno). */
  colorCliente?: string | null;
  /** Se pinta en el portal: el cliente ve "Tú" en lo suyo y "Rünna" en lo del equipo. */
  vistaCliente?: boolean;
}) {
  const [abierta, setAbierta] = useState(texto.trim() !== "");
  const [enviando, setEnviando] = useState(false);
  // Lo recién enviado se pinta YA (el refresh de la página tarda): sin esto la caja se vaciaba
  // y la respuesta no aparecía por segundos, y la gente la mandaba otra vez. Se descarta en
  // cuanto la respuesta real llega en `c.respuestas` (mismo id).
  const [enviadas, setEnviadas] = useState<RespuestaCorreccion[]>([]);
  const btnResponder = useRef<HTMLButtonElement>(null);
  const caja = useRef<HTMLTextAreaElement>(null);
  const hilo = useRef<HTMLDivElement>(null);
  // useId: el panel del portal se monta dos veces (móvil y escritorio); un id por cambio
  // se repetía en el DOM y rompía el <label>.
  const inputId = useId();
  const deServidor = c.respuestas ?? [];
  const idsServidor = new Set(deServidor.map((r) => r.id));
  const respuestas = [...deServidor, ...enviadas.filter((r) => !idsServidor.has(r.id))];

  const abrir = () => {
    setAbierta(true);
    // Foco a la caja SÓLO cuando la abre el usuario (no autoFocus: al re-expandir una tarjeta
    // con borrador, la caja se monta abierta y robaba el foco).
    requestAnimationFrame(() => caja.current?.focus());
  };

  // Cerrar = descartar el borrador (si no, la tarjeta queda fijada abierta por él).
  const cerrar = () => {
    setTexto("");
    setAbierta(false);
    // El foco vuelve a "Responder" sólo si estaba en este hilo o cayó al <body>: si el usuario
    // ya está escribiendo en otra tarjeta mientras se enviaba ésta, no se lo quitamos.
    requestAnimationFrame(() => {
      const a = document.activeElement;
      if (!a || a === document.body || hilo.current?.contains(a)) btnResponder.current?.focus();
    });
  };

  const enviar = async () => {
    const enviado = texto;
    if (!responder || !enviado.trim() || enviando) return;
    setEnviando(true);
    const id = await responder(c.id, enviado, alCliente ? "cliente" : "equipo");
    setEnviando(false);
    if (id) {
      setEnviadas((prev) => [
        ...prev,
        {
          id,
          body: enviado.trim(),
          autor: "Tú",
          createdAt: new Date().toISOString(),
          deCliente: vistaCliente,
          paraCliente: !vistaCliente && alCliente,
        },
      ]);
      cerrar();
    }
  };

  if (!respuestas.length && !responder) return null;

  return (
    // Los clics del hilo no saltan al campo (un clic en la tarjeta sí lo hace).
    <div ref={hilo} className="mt-2" onClick={(e) => e.stopPropagation()}>
      {respuestas.length > 0 && (
        // aria-live: una respuesta nueva (la propia, al enviar) se anuncia al lector de pantalla.
        <ul className="grid gap-1.5 border-l-2 border-border pl-2.5" aria-live="polite">
          {respuestas.map((r) => (
            <li key={r.id}>
              <p className="whitespace-pre-wrap text-[12px] leading-snug text-foreground">{r.body}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[10.5px] text-muted-foreground">
                <span>{autorVisible(r, vistaCliente)}</span>
                <span aria-hidden>·</span>
                <span>{fechaCorta(r.createdAt)}</span>
                {/* Lado interno: marca qué cruzó al cliente, para que nadie lo confunda con
                    lo interno. En el portal todo lo que se ve es del cliente o para él. */}
                {!vistaCliente && r.deCliente && <ChipCliente color={colorCliente}>Del cliente</ChipCliente>}
                {!vistaCliente && r.paraCliente && <ChipCliente color={colorCliente}>Para el cliente</ChipCliente>}
              </p>
            </li>
          ))}
        </ul>
      )}

      {!responder ? null : abierta ? (
        <div className="mt-2">
          <label htmlFor={inputId} className="sr-only">
            Tu respuesta{c.targetLabel ? ` sobre ${c.targetLabel}` : ""}, va para {vaPara}
          </label>
          <textarea
            ref={caja}
            id={inputId}
            rows={2}
            maxLength={RESPUESTA_MAX}
            readOnly={enviando}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void enviar();
              }
              if (e.key === "Escape" && !enviando) cerrar();
            }}
            placeholder={
              vistaCliente || alCliente ? "Escribe tu respuesta…" : "Explica por qué, o contesta…"
            }
            className="w-full resize-y rounded-md border border-border bg-card px-2 py-1.5 text-[12px] leading-snug text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          />
          <p className="text-[10.5px] text-muted-foreground">
            Va para: <b className={alCliente && !vistaCliente ? "text-foreground" : undefined}>{vaPara}</b>
            {alCliente && !vistaCliente ? " (lo lee en su portal)" : ""}. ⌘/Ctrl + Enter envía.
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <BtnAccion disabled={enviando || !texto.trim()} tone="primary" onClick={() => void enviar()}>
              {enviando ? "Enviando…" : alCliente && !vistaCliente ? "Enviar al cliente" : "Enviar"}
            </BtnAccion>
            <BtnAccion disabled={enviando} onClick={cerrar}>
              Cancelar
            </BtnAccion>
          </div>
        </div>
      ) : (
        <button
          ref={btnResponder}
          type="button"
          onClick={abrir}
          aria-label={c.targetLabel ? `Responder sobre ${c.targetLabel}` : undefined}
          className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          <MessageSquare className="size-3" aria-hidden />
          Responder
        </button>
      )}
    </div>
  );
}

/** Quién firma una respuesta. En el portal: "Tú" lo del cliente, "Equipo Rünna" lo demás
 *  (el cliente no necesita los nombres internos). */
function autorVisible(r: RespuestaCorreccion, vistaCliente: boolean): string {
  if (vistaCliente) return r.deCliente ? "Tú" : "Equipo Rünna";
  return r.autor ?? (r.deCliente ? "Cliente" : "Equipo");
}

function ChipCliente({ color, children }: { color?: string | null; children: React.ReactNode }) {
  return (
    <span
      className="rounded-full border px-1.5 py-px text-[10px] font-semibold text-foreground"
      style={{ borderColor: color ?? "var(--primary)" }}
    >
      {children}
    </span>
  );
}

/** "27 oct, 14:05". Zona FIJA: este componente también se pinta en el servidor (UTC en
 *  Vercel); sin zona, servidor y navegador escribían horas distintas (error de hidratación). */
function fechaCorta(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

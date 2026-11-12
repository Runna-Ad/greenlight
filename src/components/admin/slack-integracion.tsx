"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, CheckCircle2, Clock, Copy, MessageSquare, Unplug, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  aprobarSlack, crearLigaSlack, desconectarSlack, estadoSlackIntegracion,
} from "@/app/(app)/admin/notificaciones-actions";
import { copiarTexto } from "@/lib/copiar";
import type { ConexionSlackFila, SlackIntegracion } from "@/lib/notif-admin-tipos";

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Integraciones ▸ Slack: el Slack de Runna (equipo) y los espacios de clientes conectados con
 * «Add to Slack». Aquí un admin crea la liga para el admin del cliente (sirve una vez, 7 días)
 * y aprueba el espacio que llegó: hasta entonces el bot no le manda nada a esa empresa.
 */
export function SlackIntegracionCard() {
  const [datos, setDatos] = useState<SlackIntegracion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cliente, setCliente] = useState("");
  const [liga, setLiga] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const ligaRef = useRef<HTMLParagraphElement>(null);

  const cargar = async () => {
    try {
      const r = await estadoSlackIntegracion();
      if (r.ok) { setDatos(r.datos); setError(null); } else setError(r.error);
    } catch { setError("No se pudo leer la conexión con Slack."); }
  };
  useEffect(() => {
    let vivo = true;
    estadoSlackIntegracion()
      .then((r) => { if (vivo) { if (r.ok) setDatos(r.datos); else setError(r.error); } })
      .catch(() => { if (vivo) setError("No se pudo leer la conexión con Slack."); });
    return () => { vivo = false; };
  }, []);

  // Una acción del servidor que puede fallar por red: se avisa y se recarga la lista.
  const correr = (f: () => Promise<{ ok: true } | { ok: false; error: string }>, exito: string) =>
    start(async () => {
      try {
        const r = await f();
        if (!r.ok) { toast.error(r.error); return; }
        toast.success(exito);
      } catch { toast.error("No se pudo. Revisa tu conexión."); }
      await cargar();
    });

  const crear = () =>
    start(async () => {
      try {
        const r = await crearLigaSlack(cliente);
        if (!r.ok) { toast.error(r.error); return; }
        setLiga(r.url);
      } catch { toast.error("No se pudo crear la liga. Revisa tu conexión."); }
    });
  const copiar = async () => {
    if (!liga) return;
    if (await copiarTexto(liga)) { toast.success("Liga copiada"); return; }
    if (ligaRef.current) {
      const r = document.createRange();
      r.selectNodeContents(ligaRef.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
    toast.info("Ya está seleccionada: presiona ⌘C (o Ctrl+C) para copiarla.");
  };
  const aprobar = (c: ConexionSlackFila) => {
    if (!window.confirm(`¿Aprobar «${c.teamName ?? c.teamId}» como el Slack de ${c.cliente}? Desde ahí el bot les manda sus avisos.`)) return;
    correr(() => aprobarSlack(c.teamId), `${c.teamName ?? c.cliente} aprobado`);
  };
  const quitar = (c: ConexionSlackFila) => {
    const nombre = c.teamName ?? c.cliente;
    const pregunta = c.pendiente
      ? `¿Rechazar «${nombre}»? El bot se desinstala de ese Slack.`
      : `¿Desconectar ${nombre}? El bot deja de mandar avisos a esa empresa hasta que la vuelvan a conectar.`;
    if (!window.confirm(pregunta)) return;
    correr(() => desconectarSlack(c.teamId), c.pendiente ? `${nombre} rechazado` : `${nombre} desconectado`);
  };

  const pendientes = datos?.conexiones.filter((c) => c.pendiente) ?? [];
  const activas = datos?.conexiones.filter((c) => !c.pendiente) ?? [];

  return (
    <section className="gl-card rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-primary" />
        <h3 className="font-medium text-foreground">Slack</h3>
        {datos && <Estado on={datos.runnaConectado} onLabel="Runna conectado" offLabel="Runna sin conectar" />}
      </div>
      {error && <p className="mt-2 text-sm text-muted-foreground">{error}</p>}
      {!datos && !error && <p className="mt-2 text-sm text-muted-foreground">Cargando…</p>}
      {datos && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {pendientes.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Esperan tu aprobación</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Revisa que el nombre del espacio sea el del cliente antes de aprobar. Hasta entonces no reciben avisos.
              </p>
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {pendientes.map((c) => (
                  <li key={c.teamId} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                    <Clock className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-foreground">{c.teamName ?? c.teamId}</p>
                      <p className="text-xs text-muted-foreground">Para {c.cliente} · llegó el {fecha(c.desde)}</p>
                    </div>
                    <div className="ml-auto flex gap-2">
                      <Button size="sm" disabled={pend} onClick={() => aprobar(c)}>
                        <Check className="size-3.5" /> Aprobar
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pend} onClick={() => quitar(c)}>Rechazar</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Espacios de clientes</p>
            {!activas.length ? (
              <p className="mt-1 text-sm text-muted-foreground">Ninguno conectado todavía.</p>
            ) : (
              <ul className="mt-1 divide-y divide-border rounded-lg border border-border">
                {activas.map((c) => (
                  <li key={c.teamId} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate text-foreground">{c.teamName ?? c.teamId}</p>
                      <p className="text-xs text-muted-foreground">{c.cliente} · desde {fecha(c.desde)}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="ml-auto" disabled={pend} onClick={() => quitar(c)}>
                      <Unplug className="size-3.5" /> Desconectar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Conectar el Slack de un cliente</p>
            {!datos.puedeConectar ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Falta poner SLACK_CLIENT_ID, SLACK_CLIENT_SECRET y SLACK_TOKEN_KEY en Vercel.
              </p>
            ) : (
              <>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <label htmlFor="slack-cliente" className="sr-only">Cliente</label>
                  <select
                    id="slack-cliente"
                    value={cliente}
                    onChange={(e) => { setCliente(e.target.value); setLiga(null); }}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                  >
                    <option value="">Elige el cliente…</option>
                    {datos.clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <Button size="sm" onClick={crear} disabled={!cliente || pend}>Crear liga «Add to Slack»</Button>
                </div>
                {liga && (
                  <div className="mt-2 rounded-lg border border-border bg-secondary/40 p-3">
                    <p ref={ligaRef} className="break-all font-mono text-[11px] text-foreground">{liga}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={copiar}><Copy className="size-3.5" /> Copiar</Button>
                      <p className="text-xs text-muted-foreground">
                        Mándala al admin del cliente. Sirve una vez, vence en 7 días y crear otra cancela esta.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Estado({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return (
    <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
      on ? "bg-status-completed/10 text-status-completed" : "bg-secondary text-muted-foreground"
    }`}>
      {on ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
      {on ? onLabel : offLabel}
    </span>
  );
}

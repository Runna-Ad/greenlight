"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Bell, CheckCircle2, CircleDashed, Mail, MessageSquare, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  buscarEnSlack, guardarAvisosPersona, guardarCanal, listarNotificaciones,
} from "@/app/(app)/admin/notificaciones-actions";
import type { EstadoSlackPersona, NotifAdmin, PersonaNotif } from "@/lib/notif-admin-tipos";

type Grupo = "equipo" | "clientes";
type Canal = "email" | "slack";

const ESTADO_SLACK: Record<EstadoSlackPersona, { texto: string; icono: typeof CheckCircle2; clase: string }> = {
  encontrado: { texto: "Encontrado", icono: CheckCircle2, clase: "text-status-completed" },
  sin_buscar: { texto: "Sin buscar", icono: CircleDashed, clase: "text-muted-foreground" },
  sin_conexion: { texto: "Su empresa no conectó Slack", icono: Unplug, clase: "text-muted-foreground" },
};

/**
 * Admin ▸ Notificaciones (opción A de Pedro, 2026-11-12): arriba los 4 interruptores
 * generales (correo y Slack, para el equipo y para clientes); abajo una fila por persona con
 * su correo, su Slack y si el bot ya la encontró. «Buscar en Slack» llena los member IDs.
 */
export function NotificacionesTab() {
  const [datos, setDatos] = useState<NotifAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buscando, startBuscar] = useTransition();

  const cargar = async () => {
    const r = await listarNotificaciones();
    if (r.ok) { setDatos(r.datos); setError(null); } else setError(r.error);
  };
  useEffect(() => {
    let vivo = true;
    listarNotificaciones().then((r) => {
      if (!vivo) return;
      if (r.ok) setDatos(r.datos); else setError(r.error);
    });
    return () => { vivo = false; };
  }, []);

  // Optimista: el interruptor cambia ya; si el servidor dice que no, regresa y avisa.
  // Si la llamada misma falla (red, sesión vencida) cuenta como un «no».
  const intentar = async <T,>(f: () => Promise<T>): Promise<T | { ok: false; error: string }> => {
    try { return await f(); } catch { return { ok: false, error: "No se pudo guardar. Revisa tu conexión." }; }
  };
  const cambiarCanal = async (g: Grupo, c: Canal, v: boolean) => {
    const poner = (val: boolean) =>
      setDatos((d) => d && { ...d, canales: { ...d.canales, [g]: { ...d.canales[g], [c]: val } } });
    poner(v);
    const r = await intentar(() => guardarCanal(g, c, v));
    if (!r.ok) { toast.error(r.error); poner(!v); }
  };
  const cambiarPersona = async (g: Grupo, p: PersonaNotif, campo: "notifyEmail" | "notifySlack", v: boolean) => {
    const poner = (val: boolean) =>
      setDatos((d) => d && { ...d, [g]: d[g].map((x) => (x.id === p.id ? { ...x, [campo]: val } : x)) });
    poner(v);
    const r = await intentar(() => guardarAvisosPersona(g, p.id, { [campo]: v }));
    if (!r.ok) { toast.error(r.error); poner(!v); }
  };
  const buscar = () =>
    startBuscar(async () => {
      const r = await intentar(() => buscarEnSlack());
      if (!r.ok) { toast.error(r.error); return; }
      for (const e of r.resultado.espacios) {
        if (e.error) toast.error(`${e.nombre}: Slack respondió ${e.error}`);
        else toast.success(`${e.nombre}: ${e.nuevos} encontrados ahora, ${e.yaEstaban} ya estaban, ${e.sinSlack} no están en Slack`);
      }
      await cargar();
    });

  if (error) return <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">{error}</p>;
  if (!datos) return <p className="p-6 text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="space-y-4">
      <section className="gl-card rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-primary" />
          <h3 className="font-medium text-foreground">Interruptores generales</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Apagan un canal para todo un grupo, sin tocar lo que eligió cada persona. Los avisos dentro de la app siempre llegan.
        </p>
        <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
          {(["equipo", "clientes"] as Grupo[]).map((g) => (
            <div key={g} className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium text-foreground">{g === "equipo" ? "Equipo Rünna" : "Clientes"}</p>
              {(["email", "slack"] as Canal[]).map((c) => (
                <label key={c} className="mt-2 flex cursor-pointer items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-foreground">
                    {c === "email" ? <Mail className="size-4 text-muted-foreground" /> : <MessageSquare className="size-4 text-muted-foreground" />}
                    {c === "email" ? "Correo" : "Slack"}
                  </span>
                  <Switch
                    checked={datos.canales[g][c]}
                    onCheckedChange={(v) => cambiarCanal(g, c, v)}
                    aria-label={`${c === "email" ? "Correo" : "Slack"} para ${g === "equipo" ? "el equipo" : "clientes"}`}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="gl-card rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium text-foreground">Por persona</h3>
          <Button size="sm" variant="outline" className="ml-auto" onClick={buscar} disabled={buscando || datos.slackRunna === "sin_token"}>
            <RefreshCw className={`size-3.5 ${buscando ? "animate-spin" : ""}`} />
            {buscando ? "Buscando…" : "Buscar en Slack"}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {datos.slackRunna === "conectado"
            ? "«Buscar en Slack» encuentra a cada persona por su correo y guarda su Slack. El bot también la busca solo la primera vez que le escribe."
            : datos.slackRunna === "tropiezo"
              ? "Slack no contestó al cargar esta pantalla; la columna «Estado en Slack» puede no estar al día. Intenta en un minuto."
              : "El bot no está conectado al Slack de Runna (falta SLACK_BOT_TOKEN en Vercel)."}
        </p>
        <Tabla titulo="Equipo Rünna" grupo="equipo" filas={datos.equipo} onCambio={cambiarPersona} canales={datos.canales.equipo} />
        <Tabla titulo="Clientes" grupo="clientes" filas={datos.clientes} onCambio={cambiarPersona} canales={datos.canales.clientes} />
      </section>
    </div>
  );
}

function Tabla({
  titulo, grupo, filas, onCambio, canales,
}: {
  titulo: string;
  grupo: Grupo;
  filas: PersonaNotif[];
  onCambio: (g: Grupo, p: PersonaNotif, campo: "notifyEmail" | "notifySlack", v: boolean) => void;
  canales: { email: boolean; slack: boolean };
}) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo} · {filas.length}
      </p>
      {!filas.length ? (
        <p className="text-sm text-muted-foreground">Nadie todavía.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Persona</th>
                <th className="px-3 py-2 font-medium">Correo</th>
                <th className="px-3 py-2 font-medium">Slack</th>
                <th className="px-3 py-2 font-medium">Estado en Slack</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => {
                const est = ESTADO_SLACK[p.slack];
                const Icono = est.icono;
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <p className="text-foreground">{p.nombre}</p>
                      <p className="text-xs text-muted-foreground">{[p.cliente, p.correo].filter(Boolean).join(" · ") || "sin correo"}</p>
                    </td>
                    <td className="px-3 py-2">
                      <Switch
                        checked={p.notifyEmail}
                        onCheckedChange={(v) => onCambio(grupo, p, "notifyEmail", v)}
                        aria-label={`Correo para ${p.nombre}`}
                      />
                      {!canales.email && <p className="mt-1 text-[11px] text-muted-foreground">apagado para el grupo</p>}
                    </td>
                    <td className="px-3 py-2">
                      <Switch
                        checked={p.notifySlack}
                        onCheckedChange={(v) => onCambio(grupo, p, "notifySlack", v)}
                        aria-label={`Slack para ${p.nombre}`}
                      />
                      {!canales.slack && <p className="mt-1 text-[11px] text-muted-foreground">apagado para el grupo</p>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 text-xs ${est.clase}`}>
                        <Icono className="size-3.5" />
                        {est.texto}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

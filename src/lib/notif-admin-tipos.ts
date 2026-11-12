// Tipos de Admin ▸ Notificaciones y de la tarjeta de Slack en Integraciones (0098).

import type { CanalesNotif } from "@/lib/notif-canales";

/** Estado del Slack de una persona, para la columna «Slack» de la tabla. */
export type EstadoSlackPersona = "encontrado" | "sin_buscar" | "sin_conexion";

export type PersonaNotif = {
  id: string;
  nombre: string;
  correo: string | null;
  notifyEmail: boolean;
  notifySlack: boolean;
  slack: EstadoSlackPersona;
  /** Sólo clientes: a qué empresa pertenece. */
  cliente?: string | null;
};

export type NotifAdmin = {
  canales: CanalesNotif;
  equipo: PersonaNotif[];
  clientes: PersonaNotif[];
  /** El bot y el Slack de Runna: conectado, sin token, o Slack no contestó. */
  slackRunna: "conectado" | "sin_token" | "tropiezo";
};

export type ConexionSlackFila = {
  teamId: string; teamName: string | null; cliente: string; desde: string;
  /** Llegó por «Add to Slack» y espera que un admin de Runna la apruebe. */
  pendiente: boolean;
};

export type SlackIntegracion = {
  /** SLACK_BOT_TOKEN (Slack de Runna). */
  runnaConectado: boolean;
  /** SLACK_CLIENT_ID + SLACK_CLIENT_SECRET + SLACK_TOKEN_KEY: se pueden conectar espacios de clientes. */
  puedeConectar: boolean;
  conexiones: ConexionSlackFila[];
  /** Sólo el Master Builder aprueba o rechaza un espacio nuevo. */
  puedeAprobar: boolean;
  clientes: { id: string; name: string }[];
};

export type ResultadoBusqueda = {
  /** Por espacio: cuántos se encontraron ahora, cuántos ya estaban y cuántos no están en Slack. */
  espacios: { nombre: string; nuevos: number; yaEstaban: number; sinSlack: number; error?: string }[];
};

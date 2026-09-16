import "server-only";
import { createHash } from "node:crypto";
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { cargarReglas } from "@/lib/prisma/data";
import { leerPagina } from "@/lib/prisma/vigia-leer";
import { proponerCambios } from "@/lib/prisma/vigia-ia";
import { cambios, enLotes, extraerTexto, huellaTexto, sabidoDe, sinParrafos, type Origen } from "@/lib/prisma/vigia";
import { TOOLS, type Tool } from "@/lib/prisma/spec";

/**
 * F6b — una corrida del vigía: lee cada fuente activa y, si cambió, deja que H.Ü.E proponga. Reglas de costo:
 * sin cambio = cero llamadas; la primera lectura es la línea base (no propone); con tope de llamadas por corrida
 * (lo que no alcanzó se queda SIN marcar como leído y entra en la siguiente). Lo llaman "Revisar ahora" (Hub,
 * master) y el cron semanal (/api/prisma/vigia).
 */

type Db = ReturnType<typeof supabaseAdmin>;

export type ResumenVigia = {
  leidas: number;
  sinCambio: number;
  lineaBase: number;
  conCambios: number;
  propuestas: number;
  repetidas: number;
  pendientesDeLlamada: number;
  errores: { nombre: string; error: string }[];
  llamadas: number;
  tokens: number;
};

type FilaFuenteBD = { id: string; url: string; nombre: string; tool: string | null; origen: Origen; ultimo_hash: string | null; ultimo_texto: string | null };

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
const CONCURRENCIA = 4;
/** Lotes (llamadas) por fuente por corrida: el resto espera a la siguiente y las demás fuentes tienen turno. */
const LOTES_POR_FUENTE = 2;

/** Un update que falla no se traga: queda en el log y en el resumen (si no, la fuente nunca se marca leída y cada
 *  corrida paga la misma llamada). */
async function guardar(db: Db, r: ResumenVigia, nombre: string, id: string, cambios: Record<string, unknown>): Promise<boolean> {
  const { error } = await db.from("prisma_fuentes").update(cambios).eq("id", id);
  if (!error) return true;
  console.error(`[prisma/vigia] guardar ${nombre}: ${error.message}`);
  r.errores.push({ nombre, error: "no se pudo guardar la lectura" });
  return false;
}

/** Una corrida a la vez en TODAS las instancias (botón y cron) y una pausa mínima entre corridas: el candado vive en
 *  la BD (0074, prisma_vigia_tomar / _soltar), no en la memoria de una instancia. */
export async function correrVigia(db: Db, esperaSeg: number, opts: Parameters<typeof revisarFuentes>[1] = {}): Promise<{ ok: true; resumen: ResumenVigia } | { ok: false; error: string }> {
  const { data: tomado, error } = await db.rpc("prisma_vigia_tomar", { p_espera_seg: esperaSeg });
  if (error) {
    console.error(`[prisma/vigia] candado: ${error.message}`);
    return { ok: false, error: /prisma_vigia_tomar/.test(error.message) ? "Falta aplicar la migración 0074 (vigía)." : "No se pudo iniciar la revisión." };
  }
  if (tomado !== true) return { ok: false, error: "Ya hay una revisión en curso o se acaba de revisar: espera un par de minutos." };
  try {
    return { ok: true, resumen: await revisarFuentes(db, opts) };
  } finally {
    const { error: e } = await db.rpc("prisma_vigia_soltar");
    if (e) console.error(`[prisma/vigia] soltar candado: ${e.message}`);
  }
}

/** `presupuestoMs`: después de ese tiempo ya no se pregunta a H.Ü.E (lo que falte entra en la próxima corrida);
 *  así una corrida larga no choca con el límite de la función (300 s). */
export async function revisarFuentes(db: Db, opts: { soloId?: string; maxLlamadas?: number; presupuestoMs?: number } = {}): Promise<ResumenVigia> {
  const inicio = Date.now();
  // 150 s: una llamada puede tardar hasta 120 s (60 s + un reintento) y la función muere a los 300 s.
  const presupuesto = opts.presupuestoMs ?? 150_000;
  const r: ResumenVigia = { leidas: 0, sinCambio: 0, lineaBase: 0, conCambios: 0, propuestas: 0, repetidas: 0, pendientesDeLlamada: 0, errores: [], llamadas: 0, tokens: 0 };
  const maxLlamadas = opts.maxLlamadas ?? 8;
  // Las que llevan más tiempo sin leerse primero (una fuente que cambia mucho no deja a las demás sin turno).
  let q = db.from("prisma_fuentes").select("id, url, nombre, tool, origen, ultimo_hash, ultimo_texto").eq("activa", true).order("ultima_lectura", { ascending: true, nullsFirst: true }).limit(40);
  if (opts.soloId) q = q.eq("id", opts.soloId);
  const { data, error } = await q.returns<FilaFuenteBD[]>();
  if (error) {
    r.errores.push({ nombre: "fuentes", error: /prisma_fuentes/.test(error.message) ? "Falta aplicar la migración 0074." : "No se pudieron leer las fuentes." });
    console.error(`[prisma/vigia] fuentes: ${error.message}`);
    return r;
  }
  const fuentes = data ?? [];
  const conocimiento = await cargarReglas(db);
  const hoy = new Date().toISOString().slice(0, 10);

  // 1) Leer (en paralelo, de a 4): la red es lo lento; H.Ü.E va después, en serie y con tope.
  const lecturas: { f: FilaFuenteBD; texto: string | null; error: string | null }[] = [];
  for (let i = 0; i < fuentes.length; i += CONCURRENCIA) {
    const tanda = fuentes.slice(i, i + CONCURRENCIA);
    const leidas = await Promise.all(tanda.map((f) => leerPagina(f.url)));
    tanda.forEach((f, j) => {
      const l = leidas[j];
      lecturas.push({ f, texto: l.ok ? extraerTexto(l.html) : null, error: l.ok ? null : l.error });
    });
  }

  for (const { f, texto, error: errLectura } of lecturas) {
    const ahora = new Date().toISOString();
    if (texto === null || !texto.trim()) {
      const msg = errLectura ?? "la página no trae texto legible";
      r.errores.push({ nombre: f.nombre, error: msg });
      await guardar(db, r, f.nombre, f.id, { ultima_lectura: ahora, ultimo_error: msg.slice(0, 300) });
      continue;
    }
    r.leidas++;
    const hash = sha256(texto);
    const marcarLeida = () => guardar(db, r, f.nombre, f.id, { ultimo_hash: hash, ultimo_texto: texto, ultima_lectura: ahora, ultimo_error: null });
    if (hash === f.ultimo_hash) {
      r.sinCambio++;
      await guardar(db, r, f.nombre, f.id, { ultima_lectura: ahora, ultimo_error: null });
      continue;
    }
    if (f.ultimo_texto === null) {
      r.lineaBase++;
      await marcarLeida();
      continue;
    }
    const nuevos = cambios(f.ultimo_texto, texto);
    if (!nuevos.length) {
      // Cambió algo menor (menús, fechas, bloques cortos): se guarda sin preguntar a nadie.
      r.sinCambio++;
      await marcarLeida();
      continue;
    }
    r.conCambios++;
    // Lote por lote (una llamada cada uno). Lo que no se alcance a leer (tope o tiempo) NO se marca como leído.
    const lotes = enLotes(nuevos);
    const tool = f.tool && (TOOLS as string[]).includes(f.tool) ? (f.tool as Tool) : null;
    const sabido = sabidoDe(conocimiento.catalogo, conocimiento.notas, tool);
    let leidos = 0;
    let fallo: string | null = null;
    for (const lote of lotes) {
      if (leidos >= LOTES_POR_FUENTE || r.llamadas >= maxLlamadas || Date.now() - inicio > presupuesto) break;
      r.llamadas++;
      const ia = await proponerCambios({ fuente: { nombre: f.nombre, url: f.url, tool }, nuevos: lote, sabido, hoy });
      if (!ia.ok) {
        fallo = ia.error;
        break;
      }
      r.tokens += ia.tokens;
      for (const p of ia.propuestas) {
        const huella = sha256(huellaTexto(p));
        const { error: insErr } = await db.from("prisma_propuestas").insert({ huella, tipo: p.tipo, tool: p.tool, origen: f.origen, fuentes: [f.id], resumen_es: p.resumen_es, contenido: p.contenido, cita: p.cita, cita_url: f.url, cita_fecha: hoy });
        if (!insErr) r.propuestas++;
        else if (insErr.code === "23505") {
          // Ya existía (pendiente, aprobada o descartada): no vuelve; sólo se suma esta fuente.
          r.repetidas++;
          const { error: rpcErr } = await db.rpc("prisma_propuesta_sumar", { p_huella: huella, p_fuente: f.id });
          if (rpcErr) console.warn(`[prisma/vigia] sumar fuente: ${rpcErr.message}`);
        } else console.error(`[prisma/vigia] insert propuesta: ${insErr.message}`);
      }
      leidos++;
    }
    if (fallo) r.errores.push({ nombre: f.nombre, error: fallo });
    if (leidos < lotes.length) r.pendientesDeLlamada++;
    if (leidos === 0) {
      // Nada leído: la fuente queda como estaba y la próxima corrida la vuelve a ver entera.
      await guardar(db, r, f.nombre, f.id, { ultima_lectura: ahora, ultimo_error: fallo });
      continue;
    }
    if (leidos === lotes.length) {
      await marcarLeida();
      continue;
    }
    // Se leyó una parte: se guarda la página SIN los párrafos que faltan (la próxima corrida los ve como nuevos).
    // Por POSICIÓN: enLotes respeta el orden y cada lote lleva un párrafo por entrada.
    const hechos = lotes.slice(0, leidos).reduce((n, l) => n + l.length, 0);
    const faltan = nuevos.slice(hechos);
    const parcial = sinParrafos(texto, faltan);
    await guardar(db, r, f.nombre, f.id, { ultimo_hash: sha256(parcial), ultimo_texto: parcial, ultima_lectura: ahora, ultimo_error: fallo });
  }
  return r;
}

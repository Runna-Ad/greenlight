import "server-only";
import { request } from "node:https";
import { lookup, type LookupAddress } from "node:dns";
import { isIP } from "node:net";
import { hostPermitido } from "@/lib/prisma/vigia";

/**
 * F6b — leer UNA fuente del vigía sin abrirle la puerta a nada más (SSRF):
 * - sólo https y sólo hosts públicos por NOMBRE (hostPermitido) y por DIRECCIÓN: el `lookup` de la conexión
 *   rechaza IPs privadas, loopback, link-local (incl. 169.254.169.254, la metadata de la nube) y CGNAT — se
 *   valida la IP con la que de verdad se conecta, así un DNS que cambia entre "revisar" y "conectar" no pasa;
 * - redirecciones a mano, máx. 3 y SÓLO al mismo host;
 * - 15 s en total, 2 MB, y sólo html / texto.
 */

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECCIONES = 3;
const TIPOS = /^(text\/html|text\/plain|text\/markdown|application\/xhtml\+xml)\b/i;

/** true = dirección que nunca se toca. */
export function ipPrivada(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    const mapeada = /^::(ffff:(0:)?)?(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (mapeada) return ipPrivada(mapeada[3]);
    // Sólo unicast global (2000::/3), menos los túneles y rangos especiales (6to4, Teredo, documentación, NAT64).
    if (x.startsWith("::")) return true;
    const primero = parseInt(x.split(":")[0] || "0", 16);
    if (!(primero >= 0x2000 && primero <= 0x3fff)) return true;
    return primero === 0x2002 || /^2001:(0{0,4}:|db8:)/.test(x) || x.startsWith("64:ff9b");
  }
  return true;
}

type Lookup = (hostname: string, options: object, cb: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) => void;
const lookupSeguro: Lookup = (hostname, options, cb) => {
  lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, []);
    const lista = addresses as LookupAddress[];
    if (!lista.length || lista.some((a) => ipPrivada(a.address))) return cb(Object.assign(new Error("dirección no permitida"), { code: "EPRIVADA" }), []);
    const opts = options as { all?: boolean };
    if (opts.all) return cb(null, lista);
    cb(null, lista[0].address, lista[0].family);
  });
};

export type Lectura = { ok: true; html: string; url: string } | { ok: false; error: string };

function pedir(url: URL, restante: number): Promise<{ status: number; location: string | null; tipo: string; cuerpo: string }> {
  return new Promise((resolveP, rejectP) => {
    // Reloj TOTAL (el `timeout` del socket sólo mide silencio: una página que gotea lento lo burlaría).
    const reloj = setTimeout(() => req.destroy(new Error("tardó más de 15 s")), restante);
    const resolve = (v: { status: number; location: string | null; tipo: string; cuerpo: string }) => {
      clearTimeout(reloj);
      resolveP(v);
    };
    const reject = (e: Error) => {
      clearTimeout(reloj);
      rejectP(e);
    };
    const req = request(
      url,
      { method: "GET", lookup: lookupSeguro as never, headers: { "user-agent": "GreenlightVigia/1.0 (+https://runna.com.mx)", accept: "text/html,text/plain;q=0.9", "accept-encoding": "identity" }, timeout: restante },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        const tipo = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location, tipo, cuerpo: "" });
        }
        if (status !== 200) {
          res.resume();
          return resolve({ status, location: null, tipo, cuerpo: "" });
        }
        if (!TIPOS.test(tipo)) {
          res.destroy();
          return reject(new Error(`tipo no permitido (${tipo.slice(0, 40) || "sin tipo"})`));
        }
        const largo = Number(res.headers["content-length"] ?? 0);
        if (largo > MAX_BYTES) {
          res.destroy();
          return reject(new Error("la página pesa más de 2 MB"));
        }
        const trozos: Buffer[] = [];
        let total = 0;
        res.on("data", (c: Buffer) => {
          total += c.length;
          if (total > MAX_BYTES) {
            res.destroy();
            reject(new Error("la página pesa más de 2 MB"));
            return;
          }
          trozos.push(c);
        });
        res.on("end", () => resolve({ status, location: null, tipo, cuerpo: Buffer.concat(trozos).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("tardó más de 15 s")));
    req.on("error", reject);
    req.end();
  });
}

export async function leerPagina(url: string): Promise<Lectura> {
  let actual: URL;
  try {
    actual = new URL(url);
  } catch {
    return { ok: false, error: "liga inválida" };
  }
  const host = actual.hostname;
  if (actual.protocol !== "https:" || !hostPermitido(host)) return { ok: false, error: "sitio no permitido" };
  const inicio = Date.now();
  try {
    for (let salto = 0; salto <= MAX_REDIRECCIONES; salto++) {
      const restante = TIMEOUT_MS - (Date.now() - inicio);
      if (restante <= 0) return { ok: false, error: "tardó más de 15 s" };
      const r = await pedir(actual, restante);
      if (r.status >= 300 && r.status < 400) {
        if (!r.location) return { ok: false, error: `redirección sin destino (${r.status})` };
        const siguiente = new URL(r.location, actual);
        if (siguiente.protocol !== "https:" || siguiente.hostname !== host || (siguiente.port !== "" && siguiente.port !== "443")) return { ok: false, error: "redirige a otro sitio" };
        actual = siguiente;
        continue;
      }
      if (r.status !== 200) return { ok: false, error: `respondió ${r.status}` };
      return { ok: true, html: r.cuerpo, url: actual.toString() };
    }
    return { ok: false, error: "demasiadas redirecciones" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "no se pudo leer" };
  }
}

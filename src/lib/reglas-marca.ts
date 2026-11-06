// Reglas de marca de DiDi que se pueden revisar EXACTO, sin IA (Pedro, 2026-11-06).
// Salen de los documentos "Conocimiento de la marca" de Card y Préstamos. Lo que es
// criterio (tono, superlativos sutiles, situaciones de "necesidad") lo revisa H.Ü.E
// con la sección de reglas del documento; aquí sólo va lo que no admite duda, para
// que nunca se escape.
//
// Lógica pura (sin Supabase ni React): la usan el corrector de "Mandar a revisión",
// el escritor de H.Ü.E y las pruebas.

export type MarcaSlug = "card" | "prestamos";

export type CampoRevisar = { label: string; campo: string; texto: string };
export type AvisoMarca = { campoLabel: string; problema: string };

const sinNegrita = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1");
const unicos = (xs: string[]) => [...new Set(xs.map((x) => x.trim()))];
const lista = (xs: string[]) => unicos(xs).map((x) => `"${x}"`).join(", ");

// Un monto en pesos: "$4,000", "$46,800.50", "$500", "$17k", "$20 mil". Se toma el
// número completo (miles con coma) y la decisión de "ya trae m.n." se hace en código.
const MONTO = /\$\s?\d+(?:,\d{3})*(?:\.\d+)?(?:\s?(?:k|mil)\b)?/gi;
const traeMN = (despues: string) => /^\s*m\.?\s?n\.?/i.test(despues);

/** "$4,000" sin "m.n." después (o "$22 pesos"). Devuelve cada monto así. */
export function montosSinMN(texto: string): string[] {
  const out: string[] = [];
  for (const m of texto.matchAll(MONTO)) {
    if (!traeMN(texto.slice(m.index + m[0].length))) out.push(m[0]);
  }
  return out;
}

/** Agrega " m.n." a cada monto en pesos que no lo trae. "$22 pesos" → "$22 m.n.". */
export function conMN(texto: string | null): string | null {
  if (!texto) return texto;
  let out = "";
  let ultimo = 0;
  for (const m of texto.matchAll(MONTO)) {
    const fin = m.index + m[0].length;
    const despues = texto.slice(fin);
    if (traeMN(despues)) continue;
    const pesos = /^\s+pesos\b/i.exec(despues);
    out += texto.slice(ultimo, fin) + " m.n.";
    ultimo = fin + (pesos ? pesos[0].length : 0);
  }
  return out + texto.slice(ultimo);
}

type Regla = { aplica: (m: MarcaSlug | null) => boolean; revisar: (t: string) => string | null };

const ambas = () => true;
const soloCard = (m: MarcaSlug | null) => m === "card";
const soloPrestamos = (m: MarcaSlug | null) => m === "prestamos";

/** Primer "problema" por regla y campo (null = el campo cumple). */
const REGLAS: Regla[] = [
  {
    aplica: ambas,
    revisar: (t) => {
      const ms = montosSinMN(t);
      return ms.length ? `Cifra sin m.n.: ${lista(ms)}. Las cifras van con $ y m.n. (ej. "$4,000 m.n.").` : null;
    },
  },
  {
    aplica: ambas,
    revisar: (t) => (/\bINE\b(?!\s+vigente)/.test(t) ? `"INE" va completo: "INE vigente".` : null),
  },
  {
    aplica: ambas,
    revisar: (t) => {
      const mal = (t.match(/\bdidi\b/gi) ?? []).filter((x) => x !== "DiDi");
      return mal.length ? `${lista(mal)} se escribe "DiDi".` : null;
    },
  },
  {
    aplica: ambas,
    revisar: (t) => {
      const s = t.match(/\bfac[ií]l[ií]simo\b|\bmuy f[aá]cil\b|\b(?:el|la) mejor\b/gi);
      return s ? `Superlativo o comparación: ${lista(s)}. Se dice "es fácil", sin "el mejor".` : null;
    },
  },
  // ── DiDi Card ──
  {
    aplica: soloCard,
    revisar: (t) => {
      const mal = (t.match(/cashback\*?/gi) ?? []).filter((x) => x !== "CASHBACK*");
      return mal.length ? `${lista(mal)} se escribe "CASHBACK*" (mayúsculas y asterisco).` : null;
    },
  },
  {
    aplica: soloCard,
    revisar: (t) => (/\bme regresan (?:dinero|dinerito)\b/i.test(t) ? `No se dice "me regresan dinero"; mejor "mis compras me recompensan".` : null),
  },
  {
    aplica: soloCard,
    revisar: (t) => (/\btarjetazo\b/i.test(t) ? `"Tarjetazo" es una mala práctica financiera; no se usa.` : null),
  },
  // ── DiDi Préstamos ──
  {
    aplica: soloPrestamos,
    revisar: (t) => {
      const sinMarca = t.replace(/DiDi\s+Pr[eé]stamos/gi, "");
      const mal = sinMarca.match(/\bpr[eé]stamos?\b|\bpide(?:s)? prestado\b|\bte prestamos\b/gi);
      return mal ? `${lista(mal)}: siempre se dice "crédito" (sólo "DiDi Préstamos" lleva la palabra).` : null;
    },
  },
  {
    aplica: soloPrestamos,
    revisar: (t) => (/\bl[ií]nea de cr[eé]dito\b/i.test(t) ? `"Línea de crédito" no se usa; es "límite de crédito".` : null),
  },
  {
    aplica: soloPrestamos,
    revisar: (t) => {
      const pares: [RegExp, string][] = [
        [/\bretiros?\b/i, `"retiros" → "disposiciones"`],
        [/\befectivo\b/i, `"efectivo" no se usa`],
        [/\bpersonal(?:es)?\b/i, `"personal/personales" no se usa`],
        [/\bcr[eé]ditos\b/i, `"créditos" en plural no se usa`],
        [/\bsubi[oó]\b/i, `"subió" → "aumentó/incrementó"`],
        [/\bfelicidades\b/i, `no se felicita por tener un crédito`],
        [/\bc[ií]rculo de cr[eé]dito\b/i, `no se menciona el círculo de crédito`],
        [/\b100\s?%\s+(?:segur|protegid)/i, `nunca "100% seguro/protegido"`],
        [/\btasa de inter[eé]s\b(?!\s+ordinaria)/i, `"tasa de interés" va completa: "tasa de interés ordinaria mensual"`],
      ];
      const hits = pares.filter(([re]) => re.test(t)).map(([, msg]) => msg);
      return hits.length ? `Palabras que no se usan: ${hits.join("; ")}.` : null;
    },
  },
];

/**
 * Revisa cada campo contra las reglas exactas de la marca. Además, en Préstamos, cuenta
 * en TODO el diálogo: "crédito" y "DiDi Préstamos" van una sola vez.
 */
export function revisarMarca(campos: CampoRevisar[], marca: MarcaSlug | null): AvisoMarca[] {
  const avisos: AvisoMarca[] = [];
  const activas = REGLAS.filter((r) => r.aplica(marca));
  for (const c of campos) {
    const t = sinNegrita(c.texto);
    for (const r of activas) {
      const p = r.revisar(t);
      if (p) avisos.push({ campoLabel: c.label, problema: p });
    }
  }
  if (marca === "prestamos") {
    const dialogo = campos.filter((c) => c.campo === "dialogo").map((c) => sinNegrita(c.texto)).join("\n");
    const sinMarca = dialogo.replace(/DiDi\s+Pr[eé]stamos/gi, "");
    const creditos = (sinMarca.match(/\bcr[eé]dito\b/gi) ?? []).length;
    if (creditos > 1)
      avisos.push({
        campoLabel: "Diálogos (todo el guión)",
        problema: `"Crédito" aparece ${creditos} veces; va una sola vez. Después usa "ayuda extra", "dinero extra", "lanita extra"…`,
      });
    const marcas = (dialogo.match(/DiDi\s+Pr[eé]stamos/gi) ?? []).length;
    if (marcas > 1)
      avisos.push({ campoLabel: "Diálogos (todo el guión)", problema: `"DiDi Préstamos" aparece ${marcas} veces en el diálogo; va una sola vez.` });
  }
  return avisos;
}

/** El slug de la marca de una tarea, si es una de las dos con reglas. */
export function marcaConReglas(slug: string | null | undefined): MarcaSlug | null {
  return slug === "card" || slug === "prestamos" ? slug : null;
}

/**
 * La sección de REGLAS de un documento de marca, copiada tal cual: desde el encabezado
 * "# Lineamientos" hasta el siguiente encabezado de primer nivel. Sin resumir: el corrector
 * la lee entera. null si el documento no la tiene.
 */
export function seccionReglas(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const m = /^#\s+Lineamientos\b.*$/im.exec(texto);
  if (!m) return null;
  const resto = texto.slice(m.index + m[0].length);
  const fin = /^#\s+\S/m.exec(resto);
  return (m[0] + (fin ? resto.slice(0, fin.index) : resto)).trim();
}

// ── Cifras vigentes (Pedro, 2026-11-06) ───────────────────────────────────────
// Un guión viejo puede decir "límite de crédito de $30,000" cuando hoy es $60,000 m.n.
// Se comparan las cifras que son una PROMESA (un monto junto a límite/hasta/CASHBACK…,
// todo porcentaje, minutos y horas) contra las que aparecen HOY en Notion (páginas de
// marca + legales) y en el brief de la tarea. Los montos de una simulación ("usé $4,000
// m.n.") no se revisan: son ejemplos, no promesas.

const PALABRA_PROMESA = /(l[ií]mite|l[ií]nea|hasta|acumula|cashback|desde|monto|cr[eé]dito de|tarjeta de)[^$\n]{0,30}$/i;

const aPesos = (s: string): number => {
  const t = s.trim();
  const n = Number(t.replace(/(k|mil)$/i, "").replace(/[$\s,]/g, ""));
  return /(k|mil)$/i.test(t) ? n * 1000 : n;
};

const PORCIENTO = /(\d+(?:[.,]\d+)?)\s?%/g;
const TIEMPO = /(\d+)\s?(minutos?|min\b|horas?|hrs?\b)/gi;
const claveTiempo = (n: string, u: string) => `${n} ${/^h/i.test(u) ? "h" : "min"}`;

/** Todas las cifras de un texto, normalizadas (para armar lo vigente). */
export function cifrasDe(texto: string): Set<string> {
  const out = new Set<string>();
  for (const m of texto.matchAll(MONTO)) out.add(`$${aPesos(m[0])}`);
  for (const m of texto.matchAll(PORCIENTO)) out.add(`${m[1].replace(",", ".")}%`);
  for (const m of texto.matchAll(TIEMPO)) out.add(claveTiempo(m[1], m[2]));
  return out;
}

/** Las cifras-promesa de un texto, con cómo se ven escritas. */
function promesasDe(texto: string): { clave: string; escrito: string }[] {
  const out: { clave: string; escrito: string }[] = [];
  for (const m of texto.matchAll(MONTO)) {
    if (PALABRA_PROMESA.test(texto.slice(Math.max(0, m.index - 45), m.index))) out.push({ clave: `$${aPesos(m[0])}`, escrito: m[0].trim() });
  }
  for (const m of texto.matchAll(PORCIENTO)) out.push({ clave: `${m[1].replace(",", ".")}%`, escrito: m[0] });
  for (const m of texto.matchAll(TIEMPO)) out.push({ clave: claveTiempo(m[1], m[2]), escrito: m[0] });
  return out;
}

/** Avisos "Cifra no vigente": promesas del guión que no están en lo vigente. Si no hay
 *  nada vigente cargado (Notion aún no sincroniza), no revisa: nunca marca a ciegas. */
export function cifrasNoVigentes(campos: CampoRevisar[], vigente: Set<string>): AvisoMarca[] {
  if (vigente.size === 0) return [];
  const avisos: AvisoMarca[] = [];
  for (const c of campos) {
    const malas = promesasDe(sinNegrita(c.texto)).filter((p) => !vigente.has(p.clave));
    if (malas.length)
      avisos.push({
        campoLabel: c.label,
        problema: `Cifra no vigente: ${lista(malas.map((m) => m.escrito))} no aparece en los selling points ni legales de hoy (Notion) ni en el brief. Revisa si cambió.`,
      });
  }
  return avisos;
}

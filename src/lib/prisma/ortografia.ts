/**
 * Ortografía del texto que va EN la pieza (y del diálogo): lo que se pinta o se dice tiene
 * que estar bien escrito, con acentos. Capa determinista (gratis, instantánea): un
 * diccionario de palabras frecuentes en copy de marketing a las que se les suele caer el
 * acento, y los signos de apertura ¿ ¡ del español. La gramática fina la revisa H.Ü.E
 * (writer.ts: revisarTexto) y ambas capas se enseñan como SUGERENCIA: el diseñador decide
 * (una marca puede escribirse sin acento a propósito). Módulo puro.
 */
import { t, type Par } from "./copy.ts";

export type Idioma = "es" | "en";
export type Cambio = { de: string; a: string; motivo: Par };
export type Revision = { idioma: Idioma; sugerido: string; cambios: Cambio[] };

/** Sin acento → con acento. Sólo palabras cuyo acento NO depende del contexto (nada de
 *  tu/tú, el/él, si/sí, esta/está, que/qué: ésas las decide H.Ü.E con la frase entera). */
export const ACENTOS: Record<string, string> = {
  envio: "envío", envios: "envíos", envia: "envía", envianos: "envíanos",
  mas: "más", rapido: "rápido", rapida: "rápida", rapidos: "rápidos", rapidas: "rápidas", rapidamente: "rápidamente",
  facil: "fácil", faciles: "fáciles", facilmente: "fácilmente", dificil: "difícil", dificiles: "difíciles",
  tambien: "también", aqui: "aquí", alli: "allí", ahi: "ahí", asi: "así", ademas: "además", despues: "después",
  manana: "mañana", cafe: "café", menu: "menú", bebe: "bebé", camara: "cámara", camaras: "cámaras", imagenes: "imágenes",
  musica: "música", proximo: "próximo", proxima: "próxima", proximos: "próximos", proximas: "próximas",
  ultimo: "último", ultima: "última", ultimos: "últimos", ultimas: "últimas", unico: "único", unica: "única", unicos: "únicos", unicas: "únicas",
  publico: "público", basico: "básico", basica: "básica", economico: "económico", economica: "económica", practico: "práctico", practica: "práctica",
  quizas: "quizás", segun: "según", adios: "adiós", jamas: "jamás", compania: "compañía", categoria: "categoría", categorias: "categorías",
  tecnologia: "tecnología", bateria: "batería", edicion: "edición", sesion: "sesión", version: "versión", atencion: "atención",
  solucion: "solución", inversion: "inversión", comision: "comisión",
  credito: "crédito", debito: "débito", pelicula: "película", titulo: "título", articulo: "artículo", articulos: "artículos",
  pagina: "página", paginas: "páginas", linea: "línea", lineas: "líneas", maximo: "máximo", minimo: "mínimo", exito: "éxito",
  futbol: "fútbol", jardin: "jardín", corazon: "corazón", cancion: "canción", limon: "limón", avion: "avión",
  camion: "camión", millon: "millón", razon: "razón", opcion: "opción", ocasion: "ocasión",
  region: "región", seccion: "sección", accion: "acción", coleccion: "colección", seleccion: "selección", direccion: "dirección",
  conexion: "conexión", decision: "decisión", ilusion: "ilusión", pasion: "pasión", mision: "misión", vision: "visión", emocion: "emoción",
  celebracion: "celebración", invitacion: "invitación", participacion: "participación", inscripcion: "inscripción", suscripcion: "suscripción",
  aplicacion: "aplicación", ubicacion: "ubicación", cotizacion: "cotización", activacion: "activación", verificacion: "verificación",
  confirmacion: "confirmación", cancelacion: "cancelación", devolucion: "devolución", resolucion: "resolución",
  facturacion: "facturación", capacitacion: "capacitación", reservacion: "reservación", reunion: "reunión", exposicion: "exposición",
  diversion: "diversión", promocion: "promoción", descripcion: "descripción", informacion: "información",
  garantia: "garantía", garantias: "garantías", energia: "energía", ordenes: "órdenes", arbol: "árbol", angel: "ángel", lapiz: "lápiz",
  azucar: "azúcar", sabado: "sábado", miercoles: "miércoles", dolar: "dólar", dolares: "dólares", pais: "país", paises: "países",
  raiz: "raíz", maiz: "maíz", dia: "día", dias: "días", numero: "número", numeros: "números", telefono: "teléfono",
  siguenos: "síguenos", unete: "únete", llamanos: "llámanos", escribenos: "escríbenos", registrate: "regístrate", suscribete: "suscríbete",
  descubrelo: "descúbrelo", pidelo: "pídelo", compralo: "cómpralo", miralo: "míralo", pruebalo: "pruébalo", ganate: "gánate",
  ahorrate: "ahórrate", llevate: "llévate", aprovechalo: "aprovéchalo", reservalo: "resérvalo", descargala: "descárgala",
  descargalo: "descárgalo", instalala: "instálala", cuentanos: "cuéntanos", mandanos: "mándanos", visitanos: "visítanos",
  electronico: "electrónico", electronica: "electrónica", automatico: "automático", automatica: "automática",
  medico: "médico", medica: "médica", clinica: "clínica", kilometros: "kilómetros", kilometro: "kilómetro",
  centimetros: "centímetros", milimetros: "milímetros", metodo: "método", metodos: "métodos", termino: "término", terminos: "términos",
  codigo: "código", codigos: "códigos", fisico: "físico", fisica: "física", quimico: "químico", organico: "orgánico",
  organica: "orgánica", clasico: "clásico", clasica: "clásica", fantastico: "fantástico", fantastica: "fantástica", magico: "mágico",
  magica: "mágica", autentico: "auténtico", autentica: "auténtica", romantico: "romántico", romantica: "romántica", dinamico: "dinámico",
  dinamica: "dinámica", especifico: "específico", especifica: "específica", limite: "límite", limites: "límites",
  espiritu: "espíritu", vehiculo: "vehículo", vehiculos: "vehículos", circulo: "círculo", oxigeno: "oxígeno", pajaro: "pájaro",
  // Lugares cuyo nombre sin acento no es otra palabra (leon/san se quedan fuera: león el animal, san Judas).
  america: "América", mexico: "México", peru: "Perú", panama: "Panamá", bogota: "Bogotá", cancun: "Cancún", queretaro: "Querétaro",
  merida: "Mérida", ingles: "inglés", frances: "francés", japones: "japonés", aleman: "alemán",
};

const ES = /\b(de|la|el|y|en|con|para|por|tu|tus|hasta|gratis|sin|del|los|las|un|una|hoy|ahora|aquí|aqui|todo|todos|nuevo|nueva|oferta|solo|sólo|más|mas|que|qué|es|al|lo|se|te|ya|muy|pide|compra|descubre|aprovecha)\b/gi;
const EN = /\b(the|and|of|to|your|with|for|in|on|free|now|get|up|off|only|today|new|all|this|our|you|save|shop|shipping|a|an|it|its|is|are|us|we|at|by|from|or|be|it's|grab|order)\b/gi;

/** Español o inglés, por pistas baratas: ¿ ¡ deciden; los acentos pesan pero no deciden solos
 *  (un "café" en una frase inglesa no la vuelve española). Empate → español (el idioma de la casa). */
export function idiomaDe(texto: string): Idioma {
  if (/[¿¡]/.test(texto)) return "es";
  const acentos = texto.match(/[áéíóúñÁÉÍÓÚÑ]/g)?.length ?? 0;
  const es = (texto.match(ES)?.length ?? 0) + acentos * 2;
  const en = texto.match(EN)?.length ?? 0;
  return en > es ? "en" : "es";
}

/** Copia el patrón de mayúsculas de `original` sobre `nuevo` (ENVIO → ENVÍO, Envio → Envío). */
function conCaso(original: string, nuevo: string): string {
  if (original === original.toUpperCase() && original !== original.toLowerCase()) return nuevo.toUpperCase();
  if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) return nuevo[0].toUpperCase() + nuevo.slice(1);
  return nuevo;
}

/** Acentos del diccionario + signos de apertura (¿ ¡) en español. Nunca cambia el inglés. */
export function revisarAcentos(texto: string, idioma: Idioma = idiomaDe(texto)): Revision {
  if (idioma !== "es") return { idioma, sugerido: texto, cambios: [] };
  const cambios: Cambio[] = [];
  let sugerido = texto.replace(/\p{L}+/gu, (palabra) => {
    const clave = palabra.toLowerCase();
    const acentuada = ACENTOS[clave];
    if (!acentuada || acentuada.toLowerCase() === clave) return palabra;
    const nueva = conCaso(palabra, acentuada);
    if (nueva !== palabra && !cambios.some((c) => c.de === palabra)) cambios.push({ de: palabra, a: nueva, motivo: t("lleva acento", "needs an accent") });
    return nueva;
  });
  // Signos de apertura: cada frase que termina en ? o ! los lleva al principio en español.
  // Se barre frase por frase (una frase = todo hasta su cierre), así "¿Qué esperas? ¡Pídelo!"
  // sale bien aunque vengan dos seguidas sin punto entre medias.
  sugerido = sugerido.replace(/[^.!?…\n]+[?!]+/g, (frase) => {
    const cierre = frase[frase.length - 1];
    const apertura = cierre === "?" ? "¿" : "¡";
    if (frase.includes("¿") || frase.includes("¡")) return frase;
    const cuerpo = frase.trimStart();
    if (!/\p{L}/u.test(cuerpo)) return frase;
    const sangria = frase.slice(0, frase.length - cuerpo.length);
    const abierta = `${apertura}${cuerpo}`;
    cambios.push({ de: cuerpo, a: abierta, motivo: t(`falta el signo de apertura ${apertura}`, `missing the opening ${apertura}`) });
    return `${sangria}${abierta}`;
  });
  return { idioma, sugerido, cambios };
}

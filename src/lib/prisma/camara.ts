/**
 * Movimientos de cámara que aparecen en un prompt. Kling y Higgsfield siguen UN movimiento
 * por clip: dos ("orbit, then push in") deforman la imagen. El validador cuenta familias
 * distintas; el diagnóstico (F2) ofrece "elige uno". Módulo puro.
 */
export const FAMILIAS_CAMARA: [string, RegExp][] = [
  ["dolly zoom", /\bdolly[- ]?zoom\b|\bvertigo (effect|shot)\b/i],
  ["push in", /\bpush(es|ing)? in\b|\bdolly (in|forward)\b|\bdollies in\b|\bmoves? closer\b|\bslow push\b/i],
  ["pull back", /\bpull(s|ing)? (back|out)\b|\bdolly (out|back)\b|\bdollies out\b|\bmoves? away\b/i],
  ["zoom", /\b(crash )?zoom(s|ing)? (in|out)\b|\bzooms? (slowly|fast|quickly)\b/i],
  ["orbit", /\borbit(s|ing)?\b|\barc shot\b|\bcircles? around\b|\brotates? around\b|\b360\b/i],
  ["crane", /\bcrane\b|\bjib\b|\bboom (up|down)\b|\brises? up over\b/i],
  ["pan", /\bwhip[- ]?pan\b|\bpan(s|ning)? (left|right|across)\b|\bpanning\b/i],
  ["tilt", /\btilt(s|ing)? (up|down)\b/i],
  // "follows" a secas empata prosa normal ("she follows the recipe"): sólo con "camera" cerca.
  ["tracking", /\btracking shot\b|\bcamera follows\b|\bfollowing shot\b|\bdolly alongside\b|\btravel(l)?ing shot\b/i],
  ["handheld", /\bhand[- ]?held\b/i],
  ["drone", /\bdrone\b|\bfpv\b|\baerial\b|\bflyover\b/i],
  ["focus pull", /\brack focus\b|\bfocus pull\b|\bfocus change\b/i],
  ["static", /\bstatic (camera|shot)\b|\blocked[- ]off\b|\bfixed camera\b|\bcamera (stays|remains) still\b/i],
];

/** Familias de movimiento distintas que menciona el texto, en orden de aparición. */
export function movimientos(texto: string): string[] {
  const t = texto.replace(/\\"/g, '"');
  return FAMILIAS_CAMARA.filter(([, re]) => re.test(t)).map(([nombre]) => nombre);
}

/**
 * Una tabla o columna que todavía no existe: el preview corre ANTES de que Pedro diga "ship it"
 * para una migración. Se reconoce por el código (PostgREST: PGRST205 tabla / PGRST204 columna;
 * Postgres: 42P01 / 42703) o por la forma exacta del mensaje, y se le dice al diseñador tal cual,
 * sin enseñar el error crudo. Un FK violado también dice "does not exist": no cuenta. Módulo puro.
 */
export type Fallo = { ok: false; error: string };

export function faltaMigracion(e: { code?: string; message?: string } | null | undefined, migracion: string): Fallo | null {
  if (!e) return null;
  const sinObjeto = /^(PGRST20[45]|42P01|42703)$/.test(e.code ?? "") || /could not find the (table|column)|(relation|column) [^ ]+ does not exist/i.test(e.message ?? "");
  if (!sinObjeto) return null;
  console.warn(`[prisma] falta la migración ${migracion}: ${e.message ?? e.code}`);
  return { ok: false, error: `Esta parte se activa cuando se aplique la migración ${migracion}.` };
}

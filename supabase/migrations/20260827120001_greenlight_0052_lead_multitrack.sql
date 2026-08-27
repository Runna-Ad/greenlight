-- Greenlight · by Rünna — grant multi-track para LEADS (0052)
--
-- Hasta hoy un lead (Dept Head) pertenece a UN solo track (real/normal) y sólo
-- ve/asigna/crea dentro de él. Pedro pidió poder ELEGIR qué track(s) puede tocar
-- cada lead — que un lead pueda trabajar Real, Normal o AMBOS. SÓLO aplica al rol
-- `lead`: creative sigue atado a su único `track`; admin/master son globales (track
-- null, vista de todos los equipos).
--
-- Modelo: una columna array `lead_tracks produccion.track[]`. NULL/vacío = usa el
-- track "home" (comportamiento actual, sin cambio). Cuando un admin otorga tracks,
-- el primero del array es el track home del lead (para agrupación/orden) y el
-- conjunto completo es su alcance efectivo. La identidad computa `member.tracks`
-- desde aquí:
--   lead → lead_tracks (si hay) | [track] ;  creative → [track] ;  admin/master → global.
-- Sin backfill: el código trata NULL como "usa el track home", así los leads
-- existentes no cambian de comportamiento hasta que un admin les otorgue tracks.

alter table produccion.track_members
  add column lead_tracks produccion.track[];

comment on column produccion.track_members.lead_tracks is
  'Sólo rol lead: track(s) que el lead puede ver/asignar/crear. NULL/[] = usa el track home (default). El [0] es el track home cuando hay grant. Ignorado para creative (single-track) y admin/master (global).';

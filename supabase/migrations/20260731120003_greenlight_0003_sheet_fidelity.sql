-- Greenlight · by Rünna — sheet-fidelity pass (0003)
-- Aligns vocab + tokenization with the DiDi sheet's ACTUAL data-validation rules
-- (extracted 2026-07-30 from tabs "Real (…Brief 24/07)" / "Normal (…Brief 24/07)").

-- ── 1. Tracks: Real vs Normal have different dropdown pools ──
create type produccion.track as enum ('real','normal');
-- vocab scope: a term belongs to one track or to both pools
create type produccion.track_scope as enum ('real','normal','both');

alter table produccion.vocab_terms
  add column track produccion.track_scope not null default 'both';
-- code must stay filename-safe, but the sheet's LABELS carry accents/spaces —
-- labels live in label_es, codes stay tokens. Widen to allow '.' and '-'
-- (real filenames contain e.g. "20-30s", "1.91x1").
alter table produccion.vocab_terms drop constraint vocab_code_shape;
alter table produccion.vocab_terms add constraint vocab_code_shape
  check (code ~ '^[A-Z0-9.\-]+$');
-- uniqueness is per (set, code, track): same code can exist in both pools
alter table produccion.vocab_terms drop constraint vocab_terms_set_code_key;
alter table produccion.vocab_terms
  add constraint vocab_terms_set_code_track_key unique (set, code, track);

-- ── 2. Ideas/assets carry their track ──
alter table produccion.ideas  add column track produccion.track not null default 'real';
alter table produccion.assets add column track produccion.track not null default 'real';

-- ── 3. Sheet columns that had no home yet ──
alter table produccion.ideas add column entrega_num   text;  -- "1ra entrega"
alter table produccion.ideas add column tipo_asset    text;  -- "RP Video"
alter table produccion.ideas add column tamanos       text[] default '{}';
alter table produccion.ideas add column duracion      text;
alter table produccion.ideas add column entrega_final text;  -- "AGOSTO 7"

-- ── 4. norm_token: ':'→'x', drop spaces & slashes (so "N/A"→"NA" is omitted),
--       keep hyphens/dots. Must mirror src/lib/filename.ts exactly. ──
create or replace function produccion.norm_token(t text)
returns text language sql immutable as $$
  select upper(regexp_replace(replace(coalesce(t,''), ':', 'x'), '[^A-Za-z0-9.\-]', '', 'g'));
$$;

-- ── 5. Override validation must allow hyphens/dots too ──
create or replace function produccion.set_asset_filename()
returns trigger language plpgsql as $$
begin
  if new.filename_override is not null and length(trim(new.filename_override)) > 0 then
    if new.filename_override !~ '^[A-Z0-9.\-]+(_[A-Z0-9.\-]+)+$' then
      raise exception 'filename_override "%" no cumple el formato (MAYÚSCULAS_TOKENS)', new.filename_override;
    end if;
    new.filename := new.filename_override;
  else
    new.filename := produccion.build_filename(
      new.naming_kind, new.naming_base, new.tamano_code, new.duracion_code,
      new.genero_code, new.formato_code, new.idea_code, new.plataforma_code,
      new.version, new.mes_code);
  end if;
  return new;
end $$;

-- ── 6. Replace vocab with the sheet's real values ──
delete from produccion.vocab_terms;

-- shared (track = null)
insert into produccion.vocab_terms (set, code, label_es, sort_order, track) values
  ('plataforma','GG','Google',1,'both'),
  ('plataforma','FB','Facebook',2,'both'),
  ('plataforma','TT','TikTok',3,'both'),
  ('plataforma','EC','Extra channel',4,'both'),
  ('genero','WOMANMAN','WOMANMAN',1,'both'),
  ('genero','WOMAN','WOMAN',2,'both'),
  ('genero','MAN','MAN',3,'both'),
  ('genero','NA','N/A',4,'both');

-- Tipo de Asset (same pool both tracks per current sheet)
insert into produccion.vocab_terms (set, code, label_es, sort_order, track)
select 'tipo', code, label, ord, t.track from (values
  ('RPVIDEO','RP Video',1),('NORMALVIDEO','Normal Video',2),('IMAGES','Images',3),
  ('COPIES','Copies',4),('AIGCVIDEO','AIGC video',5),('GIF','GIF',6)
) as v(code,label,ord), (values ('real'::produccion.track_scope),('normal'::produccion.track_scope)) as t(track);

-- Formato — genuinely different per track
insert into produccion.vocab_terms (set, code, label_es, sort_order, track) values
  ('formato','IN-HOUSE','IN-HOUSE',1,'real'),
  ('formato','UGC','UGC',2,'real'),
  ('formato','ILLUS','Ilustración',1,'normal'),
  ('formato','STOCK','Stock',2,'normal'),
  ('formato','CREADOR','Creador',3,'normal'),
  ('formato','ILLUS3D','Ilustración 3D',4,'normal'),
  ('formato','STOCKILLUS','Stock + Ilustración',5,'normal'),
  ('formato','STOCK3D','Stock + 3D',6,'normal'),
  ('formato','CREADORILLUS','Creador + ilustración',7,'normal'),
  ('formato','CREADORSTOCK','Creador + Stock',8,'normal'),
  ('formato','TEXTO','Texto',9,'normal'),
  ('formato','AI','AI',10,'normal');

-- Tamaño (shared) — note "2736 x 1260" is a real option in the sheet
insert into produccion.vocab_terms (set, code, label_es, sort_order, track) values
  ('tamano','1X1','1:1',1,'both'),
  ('tamano','16X9','16:9',2,'both'),
  ('tamano','9X16','9:16',3,'both'),
  ('tamano','4X5','4:5',4,'both'),
  ('tamano','2736X1260','2736 x 1260',5,'both');

-- ── 7. People pools per track (Asignación) ──
create table produccion.track_members (
  track      produccion.track not null,
  name       text not null,
  color      text not null default '#775cbf',
  sort_order int not null default 0,
  active     boolean not null default true,
  primary key (track, name)
);
alter table produccion.track_members enable row level security;
create policy track_members_team_read on produccion.track_members
  for select using (produccion.is_team());
create policy track_members_lead_write on produccion.track_members
  for all using (produccion.is_lead()) with check (produccion.is_lead());

insert into produccion.track_members (track, name, color, sort_order) values
  ('real','Vero','#fce8b2',1),('real','Flor','#c9daf8',2),('real','Clau J','#f4cccc',3),
  ('real','Galie','#d9ead3',4),('real','Mony','#8e7cc3',5),('real','Sebas','#666666',6),
  ('real','Mike','#e06666',7),('real','Javi','#3c78d8',8),('real','Diego','#6aa84f',9),
  ('real','Lupita','#e69138',10),
  ('normal','Viri','#d9ead3',1),('normal','Karla','#f9cb9c',2),
  ('normal','Dany','#3c78d8',3),('normal','Clau T','#a64d9e',4);

-- ── 8. EC + 2736x1260 have no documented size↔platform rule yet.
--       Allow them for now rather than inventing constraints (flagged to Pedro).
insert into produccion.size_platform_validity (media, tamano, plataforma)
select m.media, s.tamano, 'EC'
from (values ('video'),('static')) as m(media),
     (values ('1:1'),('16:9'),('9:16'),('4:5'),('2736 x 1260')) as s(tamano)
on conflict do nothing;
insert into produccion.size_platform_validity (media, tamano, plataforma)
select m.media, '2736 x 1260', p.plataforma
from (values ('video'),('static')) as m(media),
     (values ('GG'),('FB'),('TT')) as p(plataforma)
on conflict do nothing;

-- ── 9. build_filename must never emit empty tokens (a missing Formato used to
--       produce "WOMAN__VIDEO"). Mirrors src/lib/filename.ts. ──
create or replace function produccion.build_filename(
  p_kind    produccion.naming_kind,
  p_base    text,
  p_tamano  text,
  p_duracion text,
  p_genero  text,
  p_formato text,
  p_idea    text,
  p_plataforma text,
  p_version int,
  p_mes     text
) returns text language plpgsql immutable as $$
declare
  parts text[] := '{}';
  g text := produccion.norm_token(p_genero);
begin
  parts := array_append(parts, produccion.norm_token(p_base));
  parts := array_append(parts, produccion.norm_token(p_tamano));

  if p_kind <> 'static' then
    parts := array_append(parts, produccion.norm_token(p_duracion));
  end if;

  if g <> '' and g <> 'NA' then
    parts := array_append(parts, g);
  end if;

  if p_kind = 'real' then
    parts := array_append(parts, 'REAL');
  else
    parts := array_append(parts, produccion.norm_token(p_formato));
  end if;

  parts := array_append(parts, case when p_kind = 'static' then 'STATIC' else 'VIDEO' end);
  parts := array_append(parts, 'IDEA' || produccion.norm_token(p_idea));
  parts := array_append(parts, produccion.norm_token(p_plataforma));
  parts := array_append(parts, 'V' || coalesce(p_version,1)::text);
  parts := array_append(parts, produccion.norm_token(p_mes));
  parts := array_append(parts, 'RN');

  -- drop empties so a missing field never yields a double underscore
  return array_to_string(array_remove(parts, ''), '_');
end $$;

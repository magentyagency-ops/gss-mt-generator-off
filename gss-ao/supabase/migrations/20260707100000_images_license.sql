-- ════════════════════════════════════════════════════════════════════════════════════════
-- Bibliothèque d'images — traçabilité licence (évolution de public.images du ticket #2)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Ajoute la traçabilité des droits sur les visuels sourcés (banques license-safe) :
--   license      : type de licence (ex. 'cc0', 'pdm', 'by', 'by-sa', 'commercial')
--   source_url   : page d'origine de l'image (foreign_landing_url)
--   attribution  : auteur / mention d'attribution
-- Colonnes nullable (rétro-compatible). Met à jour admin_add_image pour les accepter.

alter table public.images
  add column if not exists license     text,
  add column if not exists source_url  text,
  add column if not exists attribution text;

comment on column public.images.license     is 'Licence de l''image (ex. cc0, pdm, by, by-sa). Traçabilité des droits.';
comment on column public.images.source_url  is 'Page d''origine de l''image (foreign_landing_url).';
comment on column public.images.attribution is 'Auteur / mention d''attribution requise par la licence.';

-- admin_add_image : on DROP l'ancienne signature (5 args) puis on recrée avec 3 params en +.
-- (drop nécessaire pour éviter une surcharge ambiguë sur les appels à 3–5 arguments)
drop function if exists public.admin_add_image(text, text, text, text, text[]);

create or replace function public.admin_add_image(
  p_nom text, p_description text, p_storage_path text,
  p_type text default 'insertion', p_tags text[] default '{}',
  p_license text default null, p_source_url text default null, p_attribution text default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Non autorisé'; end if;
  if p_type not in ('insertion','analyse','les_deux') then
    raise exception 'Type invalide (insertion | analyse | les_deux)';
  end if;
  if p_nom is null or trim(p_nom) = '' then raise exception 'Le nom est obligatoire'; end if;
  if p_storage_path is null or trim(p_storage_path) = '' then
    raise exception 'Le chemin de stockage est obligatoire';
  end if;

  insert into public.images (nom, description, storage_path, type, tags, license, source_url, attribution, created_by)
  values (trim(p_nom), p_description, trim(p_storage_path), p_type, p_tags, p_license, p_source_url, p_attribution, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================================
--  SCRIPT COMPLET v4 "CRÈME" — SUPABASE / POSTGRESQL
--  App : import de dossiers (arborescence + fichiers), génération de
--        mémoires techniques par IA, bibliothèque d'images globale, quota.
--
--  À exécuter dans : Supabase → SQL Editor (d'un bloc, sans réorganiser).
-- ============================================================================


-- ============================================================================
--  0. EXTENSIONS
-- ============================================================================
create extension if not exists pgcrypto with schema extensions;  -- gen_random_uuid()


-- ============================================================================
--  1. TYPES ÉNUMÉRÉS
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'memo_status') then
    create type public.memo_status as enum ('pending', 'generating', 'completed', 'failed');
  end if;
end$$;


-- ============================================================================
--  2. BUCKETS STORAGE (créés ici → script auto-suffisant)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('user-files', 'user-files', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('images-library', 'images-library', false)
on conflict (id) do nothing;


-- ============================================================================
--  3. TABLES
-- ============================================================================

create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  role              text not null default 'user' check (role in ('user', 'admin')),
  generation_limit  int  not null default 10 check (generation_limit >= 0),
  generation_count  int  not null default 0  check (generation_count >= 0),
  created_at        timestamptz not null default now(),
  constraint generation_count_le_limit check (generation_count <= generation_limit)
);

create table if not exists public.dossiers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  parent_id   uuid references public.dossiers(id) on delete cascade,
  nom         text not null check (char_length(nom) between 1 and 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.fichiers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  dossier_id    uuid not null references public.dossiers(id) on delete cascade,
  nom           text not null check (char_length(nom) between 1 and 500),
  storage_path  text,
  mime_type     text,
  taille_octets bigint check (taille_octets is null or taille_octets >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.memoires_techniques (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  dossier_id    uuid references public.dossiers(id) on delete set null,
  titre         text,
  contenu       jsonb,
  statut        public.memo_status not null default 'completed',
  ai_model      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.images (
  id            uuid primary key default gen_random_uuid(),
  nom           text not null unique check (char_length(nom) between 1 and 500),
  description   text check (description is null or char_length(description) <= 2000),
  storage_path  text not null unique,
  type          text not null default 'insertion'
                  check (type in ('insertion', 'analyse', 'les_deux')),
  tags          text[] not null default '{}',
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists dossiers_user_idx      on public.dossiers (user_id);
create index if not exists dossiers_parent_idx    on public.dossiers (parent_id);
create index if not exists fichiers_user_idx      on public.fichiers (user_id);
create index if not exists fichiers_dossier_idx   on public.fichiers (dossier_id);
create index if not exists memoires_user_idx      on public.memoires_techniques (user_id);
create index if not exists memoires_dossier_idx   on public.memoires_techniques (dossier_id);
create index if not exists images_tags_idx        on public.images using gin (tags);
create index if not exists images_fulltext_idx    on public.images
  using gin (to_tsvector('french', nom || ' ' || coalesce(description, '')));


-- ============================================================================
--  4. HELPER : l'utilisateur connecté est-il admin ?
-- ============================================================================
create or replace function public.is_admin()
returns boolean
language sql security definer stable set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;


-- ============================================================================
--  5. TRIGGERS
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists dossiers_set_updated_at on public.dossiers;
create trigger dossiers_set_updated_at
  before update on public.dossiers
  for each row execute function public.set_updated_at();

drop trigger if exists fichiers_set_updated_at on public.fichiers;
create trigger fichiers_set_updated_at
  before update on public.fichiers
  for each row execute function public.set_updated_at();

drop trigger if exists memoires_set_updated_at on public.memoires_techniques;
create trigger memoires_set_updated_at
  before update on public.memoires_techniques
  for each row execute function public.set_updated_at();

drop trigger if exists images_set_updated_at on public.images;
create trigger images_set_updated_at
  before update on public.images
  for each row execute function public.set_updated_at();

-- 5.3 QUOTA VERROUILLÉ AU NIVEAU BASE (consommé à la création de la mémoire).
create or replace function public.enforce_generation_quota()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_limit int;
  v_count int;
  v_confirmed boolean;
begin
  select (email_confirmed_at is not null) into v_confirmed
  from auth.users where id = new.user_id;

  if not coalesce(v_confirmed, false) then
    raise exception 'Email non confirmé : génération impossible.';
  end if;

  select generation_limit, generation_count
    into v_limit, v_count
  from public.profiles
  where id = new.user_id
  for update;

  if v_limit is null then
    raise exception 'Profil introuvable pour l''utilisateur %.', new.user_id;
  end if;

  if v_count >= v_limit then
    raise exception 'Quota de génération atteint (% / %).', v_count, v_limit
      using errcode = 'check_violation';
  end if;

  update public.profiles
     set generation_count = generation_count + 1
   where id = new.user_id;

  return new;
end;
$$;

drop trigger if exists enforce_generation_quota_trg on public.memoires_techniques;
create trigger enforce_generation_quota_trg
  before insert on public.memoires_techniques
  for each row execute function public.enforce_generation_quota();


-- ============================================================================
--  6. FONCTIONS MÉTIER — PROFILES / QUOTA
-- ============================================================================

create or replace function public.remaining_generations()
returns int language sql security definer stable set search_path = public
as $$
  select greatest(generation_limit - generation_count, 0)
  from public.profiles where id = auth.uid();
$$;

create or replace function public.admin_set_generation_limit(p_user_id uuid, p_new_limit int)
returns void language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  if not public.is_admin() then raise exception 'Non autorisé'; end if;
  if p_new_limit < 0 then raise exception 'La limite doit être >= 0'; end if;

  select generation_count into v_count from public.profiles where id = p_user_id;
  if v_count is null then raise exception 'Utilisateur introuvable'; end if;

  if p_new_limit < v_count then
    update public.profiles
       set generation_limit = p_new_limit, generation_count = p_new_limit
     where id = p_user_id;
  else
    update public.profiles set generation_limit = p_new_limit where id = p_user_id;
  end if;
end;
$$;

create or replace function public.admin_set_global_generation_limit(p_new_limit int)
returns int language plpgsql security definer set search_path = public
as $$
declare v_affected int;
begin
  if not public.is_admin() then raise exception 'Non autorisé'; end if;
  if p_new_limit < 0 then raise exception 'La limite doit être >= 0'; end if;

  update public.profiles
     set generation_limit = p_new_limit,
         generation_count = least(generation_count, p_new_limit)
   where role = 'user';

  get diagnostics v_affected = row_count;
  return v_affected;
end;
$$;

create or replace function public.admin_set_role(p_user_id uuid, p_new_role text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Non autorisé'; end if;
  if p_new_role not in ('user', 'admin') then
    raise exception 'Rôle invalide (user | admin)';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Impossible de modifier son propre rôle';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Utilisateur introuvable';
  end if;

  update public.profiles set role = p_new_role where id = p_user_id;
end;
$$;

create or replace function public.admin_reset_generation_count(p_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Non autorisé'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Utilisateur introuvable';
  end if;
  update public.profiles set generation_count = 0 where id = p_user_id;
end;
$$;

create or replace function public.admin_list_users()
returns table (
  id uuid, email text, role text,
  generation_limit int, generation_count int,
  email_confirmed boolean, created_at timestamptz
) language plpgsql security definer stable set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Non autorisé'; end if;
  return query
    select p.id, u.email::text, p.role,
           p.generation_limit, p.generation_count,
           (u.email_confirmed_at is not null), p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;


-- ============================================================================
--  7. FONCTIONS MÉTIER — IMAGES (bibliothèque globale)
-- ============================================================================

create or replace function public.search_images(p_query text)
returns table (
  id uuid, nom text, description text,
  storage_path text, type text, tags text[]
) language plpgsql stable set search_path = public
as $$
begin
  if p_query is null or trim(p_query) = '' then
    return query
      select i.id, i.nom, i.description, i.storage_path, i.type, i.tags
      from public.images i order by i.nom limit 50;
  end if;

  return query
    select i.id, i.nom, i.description, i.storage_path, i.type, i.tags
    from public.images i
    where to_tsvector('french', i.nom || ' ' || coalesce(i.description, ''))
            @@ plainto_tsquery('french', p_query)
       or p_query = any(i.tags)
    order by i.nom limit 20;
end;
$$;

create or replace function public.admin_add_image(
  p_nom text, p_description text, p_storage_path text,
  p_type text default 'insertion', p_tags text[] default '{}'
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

  insert into public.images (nom, description, storage_path, type, tags, created_by)
  values (trim(p_nom), p_description, trim(p_storage_path), p_type, p_tags, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_update_image(
  p_image_id uuid, p_nom text default null, p_description text default null,
  p_type text default null, p_tags text[] default null
) returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Non autorisé'; end if;
  if p_type is not null and p_type not in ('insertion','analyse','les_deux') then
    raise exception 'Type invalide (insertion | analyse | les_deux)';
  end if;
  if not exists (select 1 from public.images where id = p_image_id) then
    raise exception 'Image introuvable';
  end if;

  update public.images set
    nom         = coalesce(trim(p_nom), nom),
    description = coalesce(p_description, description),
    type        = coalesce(p_type, type),
    tags        = coalesce(p_tags, tags)
  where id = p_image_id;
end;
$$;

create or replace function public.admin_delete_image(p_image_id uuid)
returns text language plpgsql security definer set search_path = public
as $$
declare v_path text;
begin
  if not public.is_admin() then raise exception 'Non autorisé'; end if;
  select storage_path into v_path from public.images where id = p_image_id;
  if v_path is null then raise exception 'Image introuvable'; end if;
  delete from public.images where id = p_image_id;
  return v_path;
end;
$$;


-- ============================================================================
--  8. ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles            enable row level security;
alter table public.dossiers            enable row level security;
alter table public.fichiers            enable row level security;
alter table public.memoires_techniques enable row level security;
alter table public.images              enable row level security;

-- 8.1 PROFILES : lecture seule.
drop policy if exists profiles_select_own   on public.profiles;
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy profiles_select_admin on public.profiles
  for select to authenticated using ((select public.is_admin()));

-- 8.2 DOSSIERS.
drop policy if exists dossiers_select_own   on public.dossiers;
drop policy if exists dossiers_select_admin on public.dossiers;
drop policy if exists dossiers_insert_own   on public.dossiers;
drop policy if exists dossiers_update_own   on public.dossiers;
drop policy if exists dossiers_delete_own   on public.dossiers;
drop policy if exists dossiers_delete_admin on public.dossiers;
create policy dossiers_select_own on public.dossiers
  for select to authenticated using ((select auth.uid()) = user_id);
create policy dossiers_select_admin on public.dossiers
  for select to authenticated using ((select public.is_admin()));
create policy dossiers_insert_own on public.dossiers
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy dossiers_update_own on public.dossiers
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy dossiers_delete_own on public.dossiers
  for delete to authenticated using ((select auth.uid()) = user_id);
create policy dossiers_delete_admin on public.dossiers
  for delete to authenticated using ((select public.is_admin()));

-- 8.3 FICHIERS.
drop policy if exists fichiers_select_own   on public.fichiers;
drop policy if exists fichiers_select_admin on public.fichiers;
drop policy if exists fichiers_insert_own   on public.fichiers;
drop policy if exists fichiers_update_own   on public.fichiers;
drop policy if exists fichiers_delete_own   on public.fichiers;
drop policy if exists fichiers_delete_admin on public.fichiers;
create policy fichiers_select_own on public.fichiers
  for select to authenticated using ((select auth.uid()) = user_id);
create policy fichiers_select_admin on public.fichiers
  for select to authenticated using ((select public.is_admin()));
create policy fichiers_insert_own on public.fichiers
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy fichiers_update_own on public.fichiers
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy fichiers_delete_own on public.fichiers
  for delete to authenticated using ((select auth.uid()) = user_id);
create policy fichiers_delete_admin on public.fichiers
  for delete to authenticated using ((select public.is_admin()));

-- 8.4 MÉMOIRES : lecture + création (gardée par le trigger quota) + update. Pas de DELETE.
drop policy if exists memoires_select_own   on public.memoires_techniques;
drop policy if exists memoires_select_admin on public.memoires_techniques;
drop policy if exists memoires_insert_own   on public.memoires_techniques;
drop policy if exists memoires_update_own   on public.memoires_techniques;
drop policy if exists memoires_delete_own   on public.memoires_techniques;
drop policy if exists memoires_delete_admin on public.memoires_techniques;
create policy memoires_select_own on public.memoires_techniques
  for select to authenticated using ((select auth.uid()) = user_id);
create policy memoires_select_admin on public.memoires_techniques
  for select to authenticated using ((select public.is_admin()));
create policy memoires_insert_own on public.memoires_techniques
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy memoires_update_own on public.memoires_techniques
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 8.5 IMAGES : lecture pour tout authentifié ; écriture via fonctions admin.
drop policy if exists images_select_authenticated on public.images;
create policy images_select_authenticated on public.images
  for select to authenticated using (true);


-- ============================================================================
--  9. STORAGE POLICIES
-- ============================================================================

-- 9.1 user-files : préfixe = "<user_id>/...".
drop policy if exists storage_userfiles_select on storage.objects;
drop policy if exists storage_userfiles_insert on storage.objects;
drop policy if exists storage_userfiles_update on storage.objects;
drop policy if exists storage_userfiles_delete on storage.objects;
create policy storage_userfiles_select on storage.objects
  for select to authenticated
  using (bucket_id = 'user-files'
     and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy storage_userfiles_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'user-files'
          and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy storage_userfiles_update on storage.objects
  for update to authenticated
  using (bucket_id = 'user-files'
     and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy storage_userfiles_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'user-files'
     and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 9.2 images-library : lecture tout authentifié, écriture admin.
drop policy if exists storage_library_select on storage.objects;
drop policy if exists storage_library_insert on storage.objects;
drop policy if exists storage_library_update on storage.objects;
drop policy if exists storage_library_delete on storage.objects;
create policy storage_library_select on storage.objects
  for select to authenticated
  using (bucket_id = 'images-library');
create policy storage_library_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'images-library' and (select public.is_admin()));
create policy storage_library_update on storage.objects
  for update to authenticated
  using (bucket_id = 'images-library' and (select public.is_admin()))
  with check (bucket_id = 'images-library' and (select public.is_admin()));
create policy storage_library_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'images-library' and (select public.is_admin()));


-- ============================================================================
--  10. PREMIER ADMIN
--      Crée ton compte via l'app, puis exécute UNE FOIS :
--        update public.profiles set role = 'admin' where id = 'TON-UUID-ICI';
-- ============================================================================

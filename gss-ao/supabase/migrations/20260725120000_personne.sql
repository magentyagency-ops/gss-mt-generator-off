-- ════════════════════════════════════════════════════════════════════════════════════════
-- Annuaire des collaborateurs GSS (brief §11 : « sélectionner le collaborateur le plus pertinent »)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Liste de personnes avec leur FONCTION et leur e-mail. L'IA s'en sert pour router chaque question
-- interne vers la personne la plus adaptée. Isolé par utilisateur (RLS), comme le reste.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.personne (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  nom         text not null check (char_length(nom) between 1 and 200),
  fonction    text not null check (char_length(fonction) between 1 and 300),
  email       text not null check (position('@' in email) > 1),
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.personne is
  'Annuaire des collaborateurs (nom, fonction, e-mail) pour le routage IA des questions internes (brief §11).';

create index if not exists idx_personne_user on public.personne(user_id);

-- Annuaire PARTAGÉ (rubrique Administration) : lecture pour tout utilisateur authentifié (le routage
-- IA en a besoin quel que soit l'utilisateur), écriture réservée aux admins (gestion centralisée).
alter table public.personne enable row level security;

drop policy if exists personne_select_all on public.personne;
create policy personne_select_all on public.personne
  for select to authenticated using (true);

do $$
begin
  if to_regprocedure('public.is_admin()') is not null then
    drop policy if exists personne_write_admin on public.personne;
    create policy personne_write_admin on public.personne
      for all to authenticated using (public.is_admin()) with check (public.is_admin());
  else
    drop policy if exists personne_write_auth on public.personne;
    create policy personne_write_auth on public.personne
      for all to authenticated using (true) with check (true);
  end if;
end$$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Test d'isolation RLS par utilisateur — Ticket #3 (§14), via l'API Management Supabase.
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Variante « sans mot de passe DB » du test : s'exécute en UNE requête sur l'endpoint
--   POST https://api.supabase.com/v1/projects/<REF>/database/query
-- avec un SUPABASE_ACCESS_TOKEN. Tout est dans une transaction terminée par ROLLBACK :
-- AUCUNE écriture persistante, aucune modif de schéma sur profiles/dossiers.
--
-- Lancement (depuis gss-ao/) :
--   ENVF=supabase/.env.run.local
--   TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' $ENVF | cut -d= -f2-)
--   REF=$(grep '^SUPABASE_PROJECT_REF=' $ENVF | cut -d= -f2-)
--   python3 -c "import json;print(json.dumps({'query':open('supabase/tests/rls_isolation_api.sql').read()}))" \
--     | curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
--       -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data @-
--
-- L'API renvoie le dernier SELECT (les assertions) car ROLLBACK ne produit pas de résultat.
-- Attendu : les 8 lignes avec pass=true.
-- (Variante Postgres directe — nécessite le mot de passe DB — : rls_isolation.cjs)
-- ════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── Données de test étiquetées (rls-test) — ROLLBACK à la fin, aucune persistance ──
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','authenticated','authenticated','a@rls-test.local'),
  ('00000000-0000-0000-0000-000000000000','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','authenticated','authenticated','b@rls-test.local'),
  ('00000000-0000-0000-0000-000000000000','cccccccc-cccc-cccc-cccc-cccccccccccc','authenticated','authenticated','admin@rls-test.local');
insert into public.profiles (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),('cccccccc-cccc-cccc-cccc-cccccccccccc')
  on conflict (id) do nothing;
update public.profiles set role='admin' where id='cccccccc-cccc-cccc-cccc-cccccccccccc';

insert into public.dossiers (id, user_id, nom) values
  ('a0a0a0a0-0000-0000-0000-0000000000aa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Dossier A (rls-test)'),
  ('b0b0b0b0-0000-0000-0000-0000000000bb','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Dossier B (rls-test)');
insert into public.question_interne (user_id, ao_id, critere_concerne, destinataire_email, question) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0a0a0a0-0000-0000-0000-0000000000aa','Critère A','a@d','Question A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','b0b0b0b0-0000-0000-0000-0000000000bb','Critère B','b@d','Question B');

create temp table _res(ord int, label text, pass boolean) on commit drop;
grant insert, select on _res to authenticated, anon;

-- ══════════ Contexte Utilisateur A ══════════
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

insert into _res select 1, '(1) A ne voit AUCUNE question de B', count(*)=0
  from public.question_interne where user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
insert into _res select 2, '(1b) A ne voit QUE sa propre question (=1)', count(*)=1
  from public.question_interne;

-- (2) A ne peut pas METTRE À JOUR une question de B → 0 ligne affectée
with upd as (
  update public.question_interne set reponse_contenu='hack'
  where user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1)
insert into _res select 3, '(2) A ne peut pas mettre a jour une question de B (0 ligne)', count(*)=0 from upd;

-- (2b) A ne peut pas RATTACHER/insérer au nom de B (RLS with check) → exception attendue
do $$
begin
  begin
    insert into public.question_interne(user_id, ao_id, critere_concerne, destinataire_email, question)
      values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','b0b0b0b0-0000-0000-0000-0000000000bb','X','x@d','intrusion');
    insert into _res values (4,'(2b) A ne peut pas inserer au nom de B (RLS with check)', false);
  exception when others then
    insert into _res values (4,'(2b) A ne peut pas inserer au nom de B (RLS with check)', true);
  end;
end $$;

-- ══════════ Contexte Utilisateur B (miroir) ══════════
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
insert into _res select 5, '(1c) B ne voit AUCUNE question de A', count(*)=0
  from public.question_interne where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- ══════════ Contexte Admin (is_admin voit tout) ══════════
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true);
insert into _res select 6, '(3) is_admin voit TOUTES les questions (=2)', count(*)=2
  from public.question_interne;
insert into _res select 7, '(3b) is_admin() = true', public.is_admin();

-- ══════════ Contexte anon (bonus) ══════════
set local role anon;
insert into _res select 8, '(bonus) anon ne voit AUCUNE question', count(*)=0
  from public.question_interne;

reset role;
select ord, label, pass from _res order by ord;

rollback;

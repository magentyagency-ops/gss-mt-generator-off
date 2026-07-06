/**
 * Test d'isolation RLS — Ticket #3 (§14 : « données isolées par organisation »).
 *
 * Prouve qu'un utilisateur d'une organisation ne peut JAMAIS voir NI rattacher les
 * questions d'une autre organisation. Tourne contre la base Supabase LOCALE (supabase start).
 *
 * Exécution :
 *   NODE_PATH="../backend/node_modules" node supabase/tests/rls_isolation.cjs
 * (le driver `pg` est celui du backend ; DB locale par défaut = postgres/postgres @54322)
 */
const { Client } = require('pg');

const CONN = {
  host: process.env.SUPA_DB_HOST || '127.0.0.1',
  port: Number(process.env.SUPA_DB_PORT || 54322),
  user: process.env.SUPA_DB_USER || 'postgres',
  password: process.env.SUPA_DB_PASSWORD || 'postgres',
  database: process.env.SUPA_DB_NAME || 'postgres',
};

// UUID déterministes pour le test (pas de Math.random requis).
const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const AO_A = 'a0a0a0a0-0000-0000-0000-0000000000aa';
const AO_B = 'b0b0b0b0-0000-0000-0000-0000000000bb';

let failures = 0;
function check(label, cond) {
  const ok = !!cond;
  console.log(`${ok ? '  ✅ PASS' : '  ❌ FAIL'} — ${label}`);
  if (!ok) failures++;
}

async function asUser(client, userId, fn) {
  // Simule une requête authentifiée : rôle `authenticated` + claim JWT `sub` = userId.
  // auth.uid() lit current_setting('request.jwt.claims')->>'sub'.
  await client.query('BEGIN');
  try {
    await client.query(
      `select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: userId, role: 'authenticated' })]
    );
    await client.query('set local role authenticated');
    return await fn();
  } finally {
    await client.query('ROLLBACK'); // remet le rôle postgres + annule tout write de test
  }
}

async function asAnon(client, fn) {
  await client.query('BEGIN');
  try {
    await client.query('set local role anon');
    return await fn();
  } finally {
    await client.query('ROLLBACK');
  }
}

async function seed(client) {
  // Idempotent : purge les données du test précédent.
  await client.query(`delete from public.question_interne where organisation_id in ($1,$2)`, [ORG_A, ORG_B]);
  await client.query(`delete from public.appel_offres     where organisation_id in ($1,$2)`, [ORG_A, ORG_B]);
  await client.query(`delete from public.organisation_membre where organisation_id in ($1,$2)`, [ORG_A, ORG_B]);
  await client.query(`delete from public.organisation      where id in ($1,$2)`, [ORG_A, ORG_B]);
  await client.query(`delete from auth.users               where id in ($1,$2)`, [USER_A, USER_B]);

  // Utilisateurs Supabase Auth (minimum requis pour la FK organisation_membre.user_id).
  for (const [id, email] of [[USER_A, 'a@rls-test.local'], [USER_B, 'b@rls-test.local']]) {
    await client.query(
      `insert into auth.users (instance_id, id, aud, role, email)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2)`,
      [id, email]
    );
  }

  await client.query(`insert into public.organisation (id, nom) values ($1,'Org A'),($2,'Org B')`, [ORG_A, ORG_B]);
  await client.query(
    `insert into public.organisation_membre (organisation_id, user_id, role)
     values ($1,$2,'responsable'),($3,$4,'responsable')`,
    [ORG_A, USER_A, ORG_B, USER_B]
  );
  await client.query(
    `insert into public.appel_offres (id, organisation_id, reference, nom_marche)
     values ($1,$2,'AO-A-2026','Marché A'),($3,$4,'AO-B-2026','Marché B')`,
    [AO_A, ORG_A, AO_B, ORG_B]
  );
  await client.query(
    `insert into public.question_interne (organisation_id, ao_id, critere_concerne, destinataire_email, question)
     values ($1,$2,'Critère A','dest-a@test.local','Question A'),
            ($3,$4,'Critère B','dest-b@test.local','Question B')`,
    [ORG_A, AO_A, ORG_B, AO_B]
  );
  console.log('Seed OK : 2 orgs, 2 users, 2 AO, 2 questions.');
}

async function main() {
  const client = new Client(CONN);
  await client.connect();
  console.log(`\n== Test isolation RLS (base locale ${CONN.host}:${CONN.port}) ==\n`);
  try {
    await seed(client);

    // ── Utilisateur A ──────────────────────────────────────────────────────────
    console.log('\n[Utilisateur A — membre de Org A]');
    await asUser(client, USER_A, async () => {
      const all = await client.query('select organisation_id from public.question_interne');
      check('A ne voit QUE les questions de Org A (1 ligne)', all.rowCount === 1 && all.rows[0].organisation_id === ORG_A);

      const qb = await client.query('select 1 from public.question_interne where organisation_id = $1', [ORG_B]);
      check('A ne voit AUCUNE question de Org B', qb.rowCount === 0);

      // Tentative de rattachement dans Org B → doit être REFUSÉE par la RLS (with check).
      let blocked = false;
      try {
        await client.query(
          `insert into public.question_interne (organisation_id, ao_id, critere_concerne, destinataire_email, question)
           values ($1,$2,'X','x@test.local','intrusion')`,
          [ORG_B, AO_B]
        );
      } catch (e) { blocked = true; }
      check('A ne peut PAS insérer une question dans Org B (RLS with check)', blocked);

      // Tentative de modification d'une question de Org B → 0 ligne affectée (invisible).
      const upd = await client.query(
        `update public.question_interne set reponse_contenu='hack' where organisation_id=$1`, [ORG_B]);
      check('A ne peut PAS modifier une question de Org B (0 ligne)', upd.rowCount === 0);
    });

    // ── Utilisateur B (miroir) ─────────────────────────────────────────────────
    console.log('\n[Utilisateur B — membre de Org B]');
    await asUser(client, USER_B, async () => {
      const all = await client.query('select organisation_id from public.question_interne');
      check('B ne voit QUE les questions de Org B (1 ligne)', all.rowCount === 1 && all.rows[0].organisation_id === ORG_B);
      const qa = await client.query('select 1 from public.question_interne where organisation_id = $1', [ORG_A]);
      check('B ne voit AUCUNE question de Org A', qa.rowCount === 0);
    });

    // ── Anonyme ────────────────────────────────────────────────────────────────
    console.log('\n[Anonyme — non authentifié]');
    await asAnon(client, async () => {
      const all = await client.query('select 1 from public.question_interne');
      check('anon ne voit AUCUNE question', all.rowCount === 0);
    });
  } finally {
    // purge des données de test
    await client.query(`delete from public.question_interne where organisation_id in ($1,$2)`, [ORG_A, ORG_B]).catch(()=>{});
    await client.query(`delete from public.appel_offres where organisation_id in ($1,$2)`, [ORG_A, ORG_B]).catch(()=>{});
    await client.query(`delete from public.organisation_membre where organisation_id in ($1,$2)`, [ORG_A, ORG_B]).catch(()=>{});
    await client.query(`delete from public.organisation where id in ($1,$2)`, [ORG_A, ORG_B]).catch(()=>{});
    await client.query(`delete from auth.users where id in ($1,$2)`, [USER_A, USER_B]).catch(()=>{});
    await client.end();
  }

  console.log(`\n== Résultat : ${failures === 0 ? 'TOUS LES TESTS PASSENT ✅' : failures + ' ÉCHEC(S) ❌'} ==\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('Erreur test:', e); process.exit(2); });

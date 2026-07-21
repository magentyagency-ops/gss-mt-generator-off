/**
 * Test d'isolation RLS — Ticket #3 (§14), branché sur le modèle réel du ticket #2.
 *
 * Prouve qu'un utilisateur ne peut JAMAIS voir NI rattacher les questions d'un AUTRE
 * utilisateur (isolation par user_id, comme public.dossiers). Tourne contre la base Supabase.
 *
 * Exécution :
 *   NODE_PATH="backend/node_modules" node supabase/tests/rls_isolation.cjs
 * (driver `pg` du backend ; DB par défaut = postgres/postgres @54322 en local, ou projet lié via env)
 */
const { Client } = require('pg');

const CONN = {
  host: process.env.SUPA_DB_HOST || '127.0.0.1',
  port: Number(process.env.SUPA_DB_PORT || 54322),
  user: process.env.SUPA_DB_USER || 'postgres',
  password: process.env.SUPA_DB_PASSWORD || 'postgres',
  database: process.env.SUPA_DB_NAME || 'postgres',
};

// UUID déterministes pour le test.
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const AO_A = 'a0a0a0a0-0000-0000-0000-0000000000aa';
const AO_B = 'b0b0b0b0-0000-0000-0000-0000000000bb';

let failures = 0;
function check(label, cond) {
  console.log(`${cond ? '  ✅ PASS' : '  ❌ FAIL'} — ${label}`);
  if (!cond) failures++;
}

async function asUser(client, userId, fn) {
  // Simule une requête authentifiée : rôle `authenticated` + claim JWT `sub` = userId.
  await client.query('BEGIN');
  try {
    await client.query(
      `select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: userId, role: 'authenticated' })]
    );
    await client.query('set local role authenticated');
    return await fn();
  } finally {
    await client.query('ROLLBACK');
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

async function cleanup(client) {
  // Supprimer les users purge en cascade profiles → dossiers → question_interne (FK on delete cascade).
  await client.query(`delete from auth.users where id in ($1,$2)`, [USER_A, USER_B]).catch(() => {});
}

async function seed(client) {
  await cleanup(client);
  // Utilisateurs Supabase Auth. Le trigger handle_new_user (ticket #2) crée public.profiles(id).
  for (const [id, email] of [[USER_A, 'a@rls-test.local'], [USER_B, 'b@rls-test.local']]) {
    await client.query(
      `insert into auth.users (instance_id, id, aud, role, email)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2)`,
      [id, email]
    );
  }
  // Filet de sécurité si le trigger n'existe pas : garantir les profiles.
  await client.query(
    `insert into public.profiles (id) values ($1),($2) on conflict (id) do nothing`,
    [USER_A, USER_B]
  );
  await client.query(
    `insert into public.dossiers (id, user_id, nom) values ($1,$2,'Dossier A'),($3,$4,'Dossier B')`,
    [AO_A, USER_A, AO_B, USER_B]
  );
  await client.query(
    `insert into public.question_interne (user_id, ao_id, critere_concerne, destinataire_email, question)
     values ($1,$2,'Critère A','dest-a@test.local','Question A'),
            ($3,$4,'Critère B','dest-b@test.local','Question B')`,
    [USER_A, AO_A, USER_B, AO_B]
  );
  console.log('Seed OK : 2 users (profiles), 2 dossiers, 2 questions.');
}

async function main() {
  const client = new Client(CONN);
  await client.connect();
  console.log(`\n== Test isolation RLS par utilisateur (base ${CONN.host}:${CONN.port}) ==\n`);
  try {
    await seed(client);

    // ── Utilisateur A ──────────────────────────────────────────────────────────
    console.log('\n[Utilisateur A]');
    await asUser(client, USER_A, async () => {
      const all = await client.query('select user_id from public.question_interne');
      check('A ne voit QUE ses questions (1 ligne)', all.rowCount === 1 && all.rows[0].user_id === USER_A);

      const qb = await client.query('select 1 from public.question_interne where user_id = $1', [USER_B]);
      check('A ne voit AUCUNE question de B', qb.rowCount === 0);

      // Rattachement/insertion au nom de B → REFUSÉ par la RLS (with check).
      let blocked = false;
      try {
        await client.query(
          `insert into public.question_interne (user_id, ao_id, critere_concerne, destinataire_email, question)
           values ($1,$2,'X','x@test.local','intrusion')`,
          [USER_B, AO_B]
        );
      } catch (e) { blocked = true; }
      check('A ne peut PAS insérer une question au nom de B (RLS with check)', blocked);

      // Modification d'une question de B → 0 ligne (invisible).
      const upd = await client.query(
        `update public.question_interne set reponse_contenu='hack' where user_id=$1`, [USER_B]);
      check('A ne peut PAS modifier une question de B (0 ligne)', upd.rowCount === 0);
    });

    // ── Utilisateur B (miroir) ─────────────────────────────────────────────────
    console.log('\n[Utilisateur B]');
    await asUser(client, USER_B, async () => {
      const all = await client.query('select user_id from public.question_interne');
      check('B ne voit QUE ses questions (1 ligne)', all.rowCount === 1 && all.rows[0].user_id === USER_B);
      const qa = await client.query('select 1 from public.question_interne where user_id = $1', [USER_A]);
      check('B ne voit AUCUNE question de A', qa.rowCount === 0);
    });

    // ── Anonyme ────────────────────────────────────────────────────────────────
    console.log('\n[Anonyme — non authentifié]');
    await asAnon(client, async () => {
      const all = await client.query('select 1 from public.question_interne');
      check('anon ne voit AUCUNE question', all.rowCount === 0);
    });
  } finally {
    await cleanup(client);
    await client.end();
  }

  console.log(`\n== Résultat : ${failures === 0 ? 'TOUS LES TESTS PASSENT ✅' : failures + ' ÉCHEC(S) ❌'} ==\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('Erreur test:', e); process.exit(2); });

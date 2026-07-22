// Test manuel (NON COMMITÉ) — Ticket #4 : endpoint POST /api/dossiers/:id/recherches.
//   Lancer depuis gss-ao/backend :  npx ts-node --transpile-only _endpoint_recherches_test.ts
//
// PROUVE (HTTP réel, de bout en bout) que le déclencheur à la demande remplit `recherche_web` :
//   1. crée un VRAI user jetable (service_role) + signInWithPassword → JWT accepté par requireAuth ;
//   2. crée un dossier possédé par ce user, avec memoire_cadre_state.missingFields (1 champ PUBLIC,
//      1 champ interne) ;
//   3. monte l'app Express (identique à main.ts) sur un port éphémère et POST l'endpoint avec le JWT ;
//   4. vérifie via service_role qu'UNE ligne recherche_web « en_attente_validation » (≥1 citation) a
//      été créée pour le champ public, et AUCUNE pour le champ interne ;
//   5. nettoie tout (recherche_web AVANT le dossier — FK on delete set null —, puis dossier, puis user).
//
// Prérequis (mêmes que _resolve_2b_test.ts) : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// PERPLEXITY_API_KEY dans gss-ao/.env. Fait un VRAI appel Perplexity (quelques centimes) quand l'endpoint
// existe. L'import de ./src/core/config déclenche dotenv (charge gss-ao/.env) au chargement du module.

import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import type { AddressInfo } from 'net';
import { createClient } from '@supabase/supabase-js';
import routes from './src/api/routes';
import { getSettings } from './src/core/config';

// L'endpoint ne résout que si le flag est ON (sinon no-op strict) — on le force pour ce test.
process.env.RESOLVE_MISSING_INFO = 'true';

const s = getSettings();
const admin = createClient(s.supabaseUrl, s.supabaseServiceRoleKey, { auth: { persistSession: false } });

const PUBLIC_MARK = "SIRET de l'acheteur Ville de Rouen (test endpoint)"; // « siret » + « acheteur » → 'public'
const INTERNAL_MARK = 'Nom de la mascotte interne du projet (test endpoint)'; // → interne/unknown → pas de web

function ok(c: boolean) { return c ? '✅' : '❌'; }
let failures = 0;
function check(cond: boolean, label: string) { console.log(`   ${ok(cond)} ${label}`); if (!cond) failures++; }

async function main() {
  // ── 1. Prérequis clés ──────────────────────────────────────────────────────────────────
  const need: Record<string, string> = {
    SUPABASE_URL: s.supabaseUrl,
    SUPABASE_ANON_KEY: s.supabaseAnonKey,
    SERVICE_ROLE: s.supabaseServiceRoleKey,
    PERPLEXITY: s.perplexityApiKey,
  };
  console.log('env :', Object.entries(need).map(([k, v]) => `${k}:${v ? 'ok' : 'ABSENT'}`).join(' | '));
  if (Object.values(need).some((v) => !v)) {
    console.error('Clés manquantes — renseigne gss-ao/.env puis relance. Je ne devine pas.');
    process.exit(1);
  }

  // ── 2. User jetable + JWT réel ──────────────────────────────────────────────────────────
  const stamp = Date.now();
  const email = `test-endpoint-recherches+${stamp}@example.com`;
  const password = `Tst-${stamp}-xA!`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (cErr || !created?.user) { console.error('createUser échec:', cErr?.message); process.exit(1); }
  const userId = created.user.id;

  const anon = createClient(s.supabaseUrl, s.supabaseAnonKey, { auth: { persistSession: false } });
  const { data: signIn, error: sErr } = await anon.auth.signInWithPassword({ email, password });
  const token = signIn?.session?.access_token;
  if (sErr || !token) {
    console.error('signInWithPassword échec:', sErr?.message);
    await admin.auth.admin.deleteUser(userId);
    process.exit(1);
  }

  // ── 3. Dossier possédé par le user, avec missingFields (1 public, 1 interne) ─────────────
  const dossierId = randomUUID(); // dossiers.id est de type uuid
  const { error: dErr } = await admin.from('dossiers').insert({
    id: dossierId,
    user_id: userId,
    nom: 'Dossier test endpoint recherches',
    contenu: {
      memoire_cadre_state: {
        tempPath: '/tmp/none.docx',
        missingFields: [
          { id: 1, label: PUBLIC_MARK, context: 'identité administrative du client acheteur' },
          { id: 2, label: INTERNAL_MARK, context: '' },
        ],
      },
    },
  });
  if (dErr) {
    console.error('insert dossier échec:', dErr.message);
    await admin.auth.admin.deleteUser(userId);
    process.exit(1);
  }

  // Propreté préalable (au cas où un run précédent aurait laissé des lignes).
  await admin.from('recherche_web').delete().eq('dossier_id', dossierId);

  // ── 4. App Express minimale (identique à main.ts) sur port éphémère + POST endpoint ──────
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api', routes);
  const server = await new Promise<any>((resolve) => { const srv = app.listen(0, () => resolve(srv)); });
  const port = (server.address() as AddressInfo).port;

  let httpStatus = 0;
  let httpOk = false;
  let body: any = null;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/dossiers/${dossierId}/recherches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    httpStatus = res.status;
    httpOk = res.ok;
    body = await res.json().catch(() => null);
  } catch (e: any) {
    console.error('fetch endpoint échec:', e?.message);
  }

  console.log('\n=== POST /api/dossiers/:id/recherches ===');
  console.log('   HTTP', httpStatus, '| body:', JSON.stringify(body));
  check(httpOk, `endpoint répond 2xx (obtenu ${httpStatus})`);

  // ── 5. recherche_web remplie pour le champ PUBLIC, rien pour l'INTERNE ───────────────────
  const { data: rows } = await admin
    .from('recherche_web')
    .select('id, query, citations, statut, dossier_id')
    .eq('dossier_id', dossierId)
    .eq('query', PUBLIC_MARK)
    .order('created_at', { ascending: false });
  const row = rows?.[0] as any;
  console.log('   ROW public :', row ? {
    statut: row.statut,
    nb_citations: Array.isArray(row.citations) ? row.citations.length : 0,
    dossier_id_ok: row.dossier_id === dossierId,
  } : 'AUCUNE');

  check(!!row, 'une ligne recherche_web créée pour le champ public');
  check(!!row && row.statut === 'en_attente_validation', `statut = en_attente_validation (obtenu ${row?.statut ?? '—'})`);
  check(!!row && Array.isArray(row.citations) && row.citations.length >= 1, '≥1 citation (règle « 0 inventé »)');

  const { count: internalCount } = await admin
    .from('recherche_web')
    .select('*', { count: 'exact', head: true })
    .eq('dossier_id', dossierId)
    .eq('query', INTERNAL_MARK);
  check((internalCount ?? 0) === 0, `champ interne → aucune recherche web (obtenu ${internalCount ?? 0} ligne)`);

  // ── 6. Nettoyage (recherche_web AVANT le dossier : FK on delete set null) ────────────────
  await admin.from('recherche_web').delete().eq('dossier_id', dossierId);
  await admin.from('dossiers').delete().eq('id', dossierId);
  await admin.auth.admin.deleteUser(userId);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  console.log('\n(nettoyage : recherche_web, dossier, user de test supprimés)');

  console.log(`\n${failures === 0 ? '✅ TOUS LES CHECKS PASSENT' : `❌ ${failures} CHECK(S) EN ÉCHEC`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('Erreur test:', e); process.exit(1); });

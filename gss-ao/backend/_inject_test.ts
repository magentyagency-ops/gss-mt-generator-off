// Test manuel (NON COMMITÉ) — Ticket #4 phase 3 : service d'injection injectValidatedRecherches().
//   npx ts-node --transpile-only _inject_test.ts
//
// PROUVE (fixture .docx avec [CHAMP_1] et [CHAMP_2], temp dans Storage) :
//   (a) une ligne statut='validee' + champ_id non nul → injectée au bon [CHAMP_<champ_id>] ;
//   (b) une ligne 'en_attente_validation' ou 'rejetee' → JAMAIS injectée (règle bloquante) ;
//   (c) c'est valeur_retenue qui est insérée, JAMAIS answer brut ;
//   (d) le .docx reste valide (re-zip + parse word/document.xml OK).
// + la ligne validée passe en 'injectee' ; l'objet Storage est supprimé après injection.
//
// Prérequis : SUPABASE_URL, SUPABASE_ANON_KEY (non requis ici), SERVICE_ROLE. (Pas de Perplexity.)

import PizZip from 'pizzip';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { getSettings } from './src/core/config';
import { uploadTempDocx, downloadTempDocx, tempObjectKey } from './src/core/temp_storage';
import { injectValidatedRecherches } from './src/generation/inject_recherches';

const s = getSettings();
const admin = createClient(s.supabaseUrl, s.supabaseServiceRoleKey, { auth: { persistSession: false } });

function ok(c: boolean) { return c ? '✅' : '❌'; }
let failures = 0;
function check(cond: boolean, label: string) { console.log(`   ${ok(cond)} ${label}`); if (!cond) failures++; }

/** Fixture .docx minimal valide : deux champs [CHAMP_1] et [CHAMP_2], chacun dans un run unique. */
function buildFixture(): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`);
  zip.file('_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`);
  zip.file('word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
    `<w:p><w:r><w:t xml:space="preserve">Adresse du siege : [CHAMP_1]</w:t></w:r></w:p>` +
    `<w:p><w:r><w:t xml:space="preserve">Dirigeant : [CHAMP_2]</w:t></w:r></w:p>` +
    `</w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function docXml(buf: Buffer): string {
  return new PizZip(buf).file('word/document.xml')!.asText();
}

// Marqueurs de test (doivent / ne doivent PAS apparaître dans le doc final)
const VAL1 = 'VALEUR_VALIDEE_CHAMP1';
const ANSWER1 = 'ANSWER_BRUT_INTERDIT_1';
const VAL2_ATTENTE = 'VAL2_ATTENTE_INTERDIT';
const VAL2_REJETE = 'VAL2_REJETE_INTERDIT';

async function main() {
  if (!s.supabaseUrl || !s.supabaseServiceRoleKey) {
    console.error('Clés Supabase manquantes — renseigne gss-ao/.env.'); process.exit(1);
  }
  // Dossier jetable (FK recherche_web.dossier_id) rattaché à un user existant.
  const dossierId = randomUUID();
  const userId = (await admin.auth.admin.listUsers()).data.users[0]?.id;
  const { error: dErr } = await admin.from('dossiers').insert({ id: dossierId, user_id: userId, nom: 'PROOF injection phase 3' });
  if (dErr) { console.error('insert dossier:', dErr.message); process.exit(1); }

  // Fixture → Storage + clé dans memoire_cadre_state (comme après génération).
  const fixture = buildFixture();
  const storageKey = await uploadTempDocx(dossierId, fixture);
  await admin.from('dossiers').update({
    contenu: { memoire_cadre_state: { tempPath: `/local/only/temp_${dossierId}.docx`, storageKey, missingFields: [
      { id: 1, label: 'Adresse du siège', context: '' }, { id: 2, label: 'Dirigeant', context: '' },
    ] } }
  }).eq('id', dossierId);

  // Lignes recherche_web : 1 validée (CHAMP_1), 1 en_attente (CHAMP_2), 1 rejetée (CHAMP_2).
  await admin.from('recherche_web').delete().eq('dossier_id', dossierId);
  const { error: iErr } = await admin.from('recherche_web').insert([
    { dossier_id: dossierId, champ_id: 1, statut: 'validee', query: 'Adresse du siège',
      valeur_retenue: VAL1, answer: ANSWER1, citations: ['https://www.insee.fr/fr/entreprise/123'], model: 'sonar' },
    { dossier_id: dossierId, champ_id: 2, statut: 'en_attente_validation', query: 'Dirigeant',
      valeur_retenue: VAL2_ATTENTE, answer: 'a', citations: ['https://exemple.fr'], model: 'sonar' },
    { dossier_id: dossierId, champ_id: 2, statut: 'rejetee', query: 'Dirigeant (bis)',
      valeur_retenue: VAL2_REJETE, answer: 'b', citations: ['https://exemple2.fr'], model: 'sonar' },
  ]);
  if (iErr) { console.error('insert recherche_web:', iErr.message); process.exit(1); }

  console.log('=== injectValidatedRecherches ===');
  let result: any = null;
  try {
    result = await injectValidatedRecherches(dossierId);
    console.log('  résultat:', JSON.stringify(result));
  } catch (e: any) {
    console.log('  ❌ injection a levé:', e.message);
    failures++;
  }

  // Lecture du .docx produit.
  let xml = '';
  if (result?.filePath && existsSync(result.filePath)) {
    xml = docXml(readFileSync(result.filePath));
  } else {
    console.log('  ❌ aucun fichier produit → assertions doc en échec');
    failures++;
  }

  console.log('\n— Assertions —');
  // (a) valeur validée injectée au bon endroit + source (host de la 1re citation).
  check(xml.includes(VAL1), `(a) valeur_retenue de la ligne validée présente ("${VAL1}")`);
  check(xml.includes('(source : insee.fr)'), '(a) source discrète "(source : insee.fr)" ajoutée');
  check(xml.includes(VAL1) && !xml.includes('[CHAMP_1]'), '(a) [CHAMP_1] remplacé (marqueur disparu)');
  // (b) lignes non validées jamais injectées ; [CHAMP_2] intact.
  check(!xml.includes(VAL2_ATTENTE), "(b) valeur d'une ligne en_attente_validation ABSENTE");
  check(!xml.includes(VAL2_REJETE), '(b) valeur d\'une ligne rejetee ABSENTE');
  check(xml.includes('[CHAMP_2]'), '(b) [CHAMP_2] NON injecté (marqueur conservé)');
  // (c) answer brut jamais inséré.
  check(!xml.includes(ANSWER1), '(c) answer brut JAMAIS inséré');
  // (d) docx valide.
  let valid = false;
  try { if (result?.filePath) { const z = new PizZip(readFileSync(result.filePath)); valid = !!z.file('word/document.xml'); } } catch {}
  check(valid, '(d) .docx re-zippable + word/document.xml parseable');

  // Transitions d'état + nettoyage Storage.
  const { data: rows } = await admin.from('recherche_web').select('champ_id, statut').eq('dossier_id', dossierId).order('champ_id');
  const r1 = (rows || []).find((r: any) => r.champ_id === 1 && r.statut === 'injectee');
  const r2ok = (rows || []).filter((r: any) => r.champ_id === 2).every((r: any) => r.statut === 'en_attente_validation' || r.statut === 'rejetee');
  check(!!r1, "(e) ligne validée passée en 'injectee'");
  check(r2ok, '(e) lignes non validées inchangées');
  // Check robuste via list() : download() sur objet supprimé peut renvoyer un Blob d'erreur (faux négatif).
  const { data: listAfter } = await admin.storage.from('memoire-temp').list('temp', { search: `${dossierId}.docx` });
  const storageGone = !(listAfter || []).some((f: any) => f.name === `${dossierId}.docx`);
  check(storageGone, '(f) objet Storage supprimé après injection');

  // Nettoyage.
  await admin.from('recherche_web').delete().eq('dossier_id', dossierId);
  await admin.from('dossiers').delete().eq('id', dossierId);
  try { if (result?.filePath && existsSync(result.filePath)) unlinkSync(result.filePath); } catch {}
  try { await (await import('./src/core/temp_storage')).deleteTempDocx(tempObjectKey(dossierId)); } catch {}

  console.log(`\n${failures === 0 ? '✅ TOUS LES CHECKS PASSENT' : `❌ ${failures} CHECK(S) EN ÉCHEC`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('Erreur test:', e); process.exit(1); });

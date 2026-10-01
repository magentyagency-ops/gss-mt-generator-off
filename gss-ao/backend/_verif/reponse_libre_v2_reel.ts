/**
 * Contrôle d'une GÉNÉRATION RÉELLE de la réponse libre v2 faite par _verif/gen.ts (GEN_RENDU=1) : lit le résultat
 * (_corpus_verif/_resultats/v-<code>-<n>.json et .pdf) et, s'il a été copié, l'état v2 ; aucun appel OpenAI.
 * Contrôles : sommaire en 5 blocs, rubriques et pages de schéma (texte du PDF), variables {{…}}, mentions
 * « Non communiqué », marqueurs internes, autres acheteurs du corpus, L. 1224-1 hors DCE, propositions et premier
 * message de l'assistant ; pages en PNG.
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/reponse_libre_v2_reel.ts <code> <n> <dossier de sortie> [état copié]
 */
import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';

const [code, n, sortie, etatCopie] = process.argv.slice(2);
const ROOT = path.resolve(__dirname, '../..');
const RES = path.join(ROOT, '_corpus_verif/_resultats');
const res = JSON.parse(fs.readFileSync(path.join(RES, `v-${code}-${n}.json`), 'utf-8'));
const pdf = path.join(RES, `v-${code}-${n}.pdf`);
const dce = fs.readFileSync(path.join(ROOT, '_corpus_verif/_dce_textes', `${code}.txt`), 'utf-8');
const ACHETEURS: Record<string, RegExp> = {
  imm: /Montsouris|Nouvel IMM/, etampes1: /[ÉE]tampes/, cstb: /CSTB/, becquerel: /Becquerel/, s2e: /Seine-Eure|S2E/, fontainebleau: /Fontainebleau/,
  caen: /ACOSS|URSSAF/, ign: /\bIGN\b|ENPC/, ifsem: /IFSeM/, ifits: /IFITS|Théodore Simon/, citedia: /Citédia|Citedia/, havre1: /Havre/, vitry: /Vitry/,
  ca_normandie: /[Cc]our d.appel|BOP Normand/, parc_expo: /Parc des Expositions/,
};
fs.mkdirSync(sortie, { recursive: true });
const pages = (spawnSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf-8', maxBuffer: 256 << 20 }).stdout || '').split('\f');
const texte = pages.join('\n');
const etat = etatCopie && fs.existsSync(etatCopie) ? JSON.parse(fs.readFileSync(etatCopie, 'utf-8')) : null;
const bilan: any = {
  id: res.id, duree_s: res.duree_s, erreur: res.erreur || '', pages: pages.length - 1, consommation: res.consommation,
  sommaire: [...new Set([...texte.matchAll(/^\s*(\d)\. (NOTRE COMPRÉHENSION[^\n]*|PRÉSENTATION DE GSS|NOS MOYENS HUMAINS|NOS MOYENS MATÉRIELS ET OPÉRATIONNELS|ORGANISATION ET CONTRÔLE DES PRESTATIONS)\s*$/gm)].map((m) => `${m[1]}. ${m[2].trim()}`))],
  variables: (texte.match(/\{\{|\}\}/g) || []).length,
  non_communique: (texte.match(/[Nn]on communiqu|[Nn]on précisé|undefined|\bnull\b|NaN/g) || []).length,
  marqueurs: (texte.match(/CONSULTATION REQUISE|⟦|⟧|\[CHAMP_/g) || []).length,
  a_completer: (texte.match(/\[À COMPLÉTER\]/g) || []).length,
  autres_acheteurs: Object.entries(ACHETEURS).filter(([c, rx]) => c !== code && rx.test(texte)).map(([c]) => c),
  client_cite: ACHETEURS[code]?.test(texte),
  l1224_hors_dce: /L\.?\s?1224/.test(texte) && !/L\.?\s?1224/.test(dce),
  covid: /[Cc]ovid|pass sanitaire|gestes barrières/.test(texte),
  consultations: res.consultations,
  elements: (res.elements || []).length,
};
if (etat?.libre?.plan) {
  bilan.plan = etat.libre.plan.blocs.map((b: any) => `${b.cle}. ${b.titre} (${b.rubriques.length})`);
  bilan.propositions = (etat.libre.ajouts || []).map((a: any) => ({ id: a.id, titre: a.title, chapitre: a.chapter, proposition: a.proposition }));
  bilan.premier_message = etat.conversation?.[0]?.texte;
  bilan.schemas = Object.keys(etat.libre.schemas || {}).length;
  bilan.comprehension = etat.libre.sections.b1_comprehension;
  bilan.propositions_textes = Object.fromEntries((etat.libre.ajouts || []).map((a: any) => [a.title, etat.libre.sections[a.id]]));
}
fs.writeFileSync(path.join(sortie, 'bilan_reel.json'), JSON.stringify(bilan, null, 1));
execSync(`pdftoppm -r 45 -png "${pdf}" "${path.join(sortie, 'p')}"`);
console.log(JSON.stringify({ ...bilan, comprehension: bilan.comprehension ? `${String(bilan.comprehension).split(/\s+/).length} mots` : undefined, propositions_textes: undefined }, null, 1));

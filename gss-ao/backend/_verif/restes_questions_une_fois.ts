/**
 * Questions à GSS qui ne dépendent pas du marché, posées une seule fois (questions_gss_une_fois) et jamais reposées à chaque
 * génération : noms de l'organigramme du registre (ALAMAT, ATTOU, DA SILVA) et variables du mémoire type (statut de PME,
 * astreinte et SSI en Normandie, responsable APR). La valeur connue reste imprimée ; rien n'est inventé. Aucun appel OpenAI.
 * Usage : npx ts-node --transpile-only _verif/restes_questions_une_fois.ts
 */
import fs from 'fs';
import path from 'path';
import { preparerMemoireType, publierMemoire, questionsDuPubliposte, chargerMemoireType, lireRegistre } from '../src/generation/memoire_type';
import { confirmationsRegistreUtilisees, blocRegistre } from '../src/generation/base_memoires';

let ko = 0;
const verifier = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const ANALYSES: Record<string, any> = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/memoire_type_analyses.json'), 'utf-8')).analyses;
const REFERENTS = 'MARCHANI Adil — Directeur d\'agence / Responsable de marché\nKANTE Rokia — Responsable RH\nDUHAMEL Leo — Responsable administratif\nLEMELE Fabrice — Responsable d\'exploitation\nPORCHAIRE Laurent — Responsable d\'exploitation\nDA SILVA Luis — Responsable d\'exploitation / Responsable commercial\nVATTIER Marie — Responsable qualité\nALAMAT Ramzi — Responsable Unité mobile\nPODKOLZIN Sergeï — Responsable Cynophile\nATTOU Nesrine — Responsable incendie';
const QUESTION_REPOSEE = /ALAMAT|ATTOU|DA SILVA|LEMELE|unit[ée] mobile|responsable incendie|responsable commercial|\bPME\b|SSI d[ée]faillant|astreinte sur n.importe quel site|protection rapproch/i;

// 1. Registre : aucune confirmation reposée, valeurs transmises sans « À CONFIRMER ».
const reg = confirmationsRegistreUtilisees('Responsable unité mobile : ALAMAT Ramzi. Responsable incendie : ATTOU NESRINE. Responsable commercial : DA SILVA Luis.');
verifier('registre : ALAMAT, ATTOU et DA SILVA jamais reposés', !reg.length, reg.join(' | '));
const bloc = blocRegistre();
for (const nom of ['ALAMAT Ramzi', 'ATTOU NESRINE', 'DA SILVA Luis']) {
  const ligne = bloc.split('\n').find((l) => l.includes(nom)) || '';
  verifier(`registre transmis aux rédactions : ${nom} présent, sans « À CONFIRMER »`, !!ligne && !/À CONFIRMER/.test(ligne), ligne);
}

// 2. Publipostage du mémoire type : valeurs imprimées, aucune question reposée.
for (const code of ['becquerel', 'caen', 'ign']) {
  const dce = fs.readFileSync(path.resolve(__dirname, `../../_corpus_verif/_dce_textes/${code}.txt`), 'utf-8');
  const prep = preparerMemoireType({ analyse: ANALYSES[code], dce, referents: REFERENTS, choix: { indicateurs: { APR: true } } } as any);
  const rubs = publierMemoire(prep);
  const qs = questionsDuPubliposte(rubs);
  const reposees = qs.filter((q) => QUESTION_REPOSEE.test(q));
  verifier(`${code} : aucune question de nom, de PME, d'astreinte, de SSI ni d'APR reposée (${qs.length} questions au total)`, !reposees.length, reposees.join(' | '));
  const texte = rubs.map((r) => r.texte || '').join('\n');
  const org = rubs.find((r) => r.id === 'b2_organigramme')?.texte || '';
  verifier(`${code} : organigramme imprimé avec ALAMAT, ATTOU et DA SILVA`, /ALAMAT Ramzi/.test(org) && /ATTOU Nesrine/.test(org) && /DA SILVA Luis/.test(org), org.slice(0, 200));
  verifier(`${code} : aucune mention « PME » inventée`, !/\bPME\b/.test(texte));
  if (code === 'becquerel') verifier('becquerel (Normandie) : délai d\'astreinte imprimé (moins de 2 heures)', /moins de 2 heures/.test(texte));
}

// 3. Cohérence : chaque variable et chaque entrée du registre « question_une_fois » a sa question dans questions_gss_une_fois.
const mt: any = chargerMemoireType();
const liste: any[] = mt.questions_gss_une_fois.questions;
for (const [nom, def] of Object.entries<any>(mt.variables)) {
  if (def.question_une_fois) verifier(`variable ${nom} : question posée une fois`, liste.some((q) => q.variable === nom && q.question));
}
const registre: any[] = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../python/base_memoires/registre_informations.json'), 'utf-8')).informations;
for (const e of registre.filter((x) => x.question_une_fois)) verifier(`registre ${e.cle} : question posée une fois`, liste.some((q) => q.registre === e.cle && q.question));
const interdit = /faits_gss|slide|AO RNE|m[ée]moire type/i;
verifier('questions_gss_une_fois : aucune référence interne', !liste.some((q) => interdit.test(q.question)), liste.filter((q) => interdit.test(q.question)).map((q) => q.question).join(' | '));
verifier('lireRegistre : champ question_une_fois lu', lireRegistre().filter((e: any) => e.question_une_fois).length === 3);
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK');

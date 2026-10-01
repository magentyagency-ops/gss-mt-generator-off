// Correction 9, bug 12 : questions du cadre (contacts avec le libellé du bloc, cases d'un tableau regroupées, doublons)
// sur les emplacements relevés dans les générations citedia2 12 et etampes1 13.
import fs from 'fs';
import path from 'path';
import { preciserQuestionsCadre, PLACEHOLDER, type ElementACompleter } from '../src/generation/completion';
let ko = 0;
const verifier = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const R = path.resolve(__dirname, '../../_corpus_verif/_resultats');
// Citédia : environnement reconstitué depuis le texte du document (bloc de contacts).
const cit = JSON.parse(fs.readFileSync(path.join(R, 'v-citedia2-12.json'), 'utf-8'));
const texte: string = cit.texte_docx;
const debut = texte.indexOf('Contact comptable');
const zone = texte.slice(debut - 400, debut + 600);
const signets: any[] = []; const elements: ElementACompleter[] = [];
let n = 0; let pos = 0;
const brut = zone.replace(/\s+/g, ' ');
while ((pos = brut.indexOf(PLACEHOLDER, pos)) >= 0) {
  n++;
  const ctx = (/([^:]*?:\s*)$/.exec(brut.slice(Math.max(0, pos - 60), pos)) || ['', ''])[1].trim().replace(/^.*?(Prénom|Numéro|Adresse)/, '$1');
  signets.push({ cle: `GSS_AC_${n}`, champ: 1, contexte: `${ctx} ${PLACEHOLDER}`, environnement: `${brut.slice(Math.max(0, pos - 700), pos)}${PLACEHOLDER}` });
  elements.push({ cle: `GSS_AC_${n}`, question: 'Quelle est l’adresse électronique du contact de GSS pour le marché de Citédia Métropole ?', contexte: `${ctx} ${PLACEHOLDER}`, statut: 'ouvert' });
  pos += PLACEHOLDER.length;
}
preciserQuestionsCadre(elements, signets);
elements.forEach((e) => console.log(`  ${e.cle} ${e.question} [${e.groupe}]`));
verifier('Citédia : chaque question nomme son bloc (comptable / commercial)', elements.every((e) => /« Contact (comptable|commercial) »/.test(e.question)) && new Set(elements.map((e) => e.question)).size === elements.length);
// Étampes : 24 cases + 1 question globale du même champ.
const et = JSON.parse(fs.readFileSync(path.join(R, 'v-etampes1-13.json'), 'utf-8'));
const els: ElementACompleter[] = []; const sig: any[] = [];
et.elements.forEach((e: any, i: number) => {
  const tableau = /\|/.test(e.contexte) || /Dimensionnement proposé/.test(e.contexte);
  els.push({ cle: `E${i}`, question: e.q, contexte: e.contexte, statut: 'ouvert' });
  sig.push({ cle: `E${i}`, champ: tableau ? 9 : i + 100, contexte: e.contexte.replace(/\[…\]/g, '[…]'), environnement: e.contexte });
});
preciserQuestionsCadre(els, sig);
const groupes = new Set(els.map((e) => e.groupe || e.cle));
const tableau = els.filter((e) => e.groupe === 'tableau du champ 9');
console.log(`  Étampes : ${els.length} emplacements, ${groupes.size} question(s) distincte(s) ; tableau : ${tableau.length} case(s) → « ${tableau[0]?.question} »`);
verifier('Étampes : cases du tableau et question globale regroupées en une question', tableau.length === 25 && new Set(tableau.map((e) => e.question)).size === 1);
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK');

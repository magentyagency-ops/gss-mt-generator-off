// Tour 1 (B6) : un repère « [À COMPLÉTER] » ne se remplace jamais par une valeur de l'adaptation ; un DCE qui dit
// « Pas de personnel transférable » (IFITS) n'a pas de rubrique de reprise du personnel.
import fs from 'fs';
import path from 'path';
import { appliquerModifications, chargerMemoireType, evaluerIndicateurs } from '../src/generation/memoire_type';
let ko = 0;
const v = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const t = 'Nous reprenons le personnel sur le même site.\n\nTaux de reprise du personnel en place : [À COMPLÉTER]. Les agents repris suivent la même intégration.';
const r = appliquerModifications(t, { remplacements: [{ extrait: 'Taux de reprise du personnel en place : [À COMPLÉTER]', par: 'Taux de reprise du personnel en place : 0 %', motif: 'annexe' }] });
v('remplacement d\'un [À COMPLÉTER] refusé', r.texte.includes('[À COMPLÉTER]') && !r.texte.includes('0 %') && r.refusees.length === 1, r.refusees[0]?.raison);
const r2 = appliquerModifications(t, { remplacements: [{ extrait: 'Nous reprenons le personnel sur le même site', par: 'Nous reprenons le personnel en place sur le même site', motif: 'x' }] });
v('autre remplacement accepté', r2.appliquees.length === 1);
const mt = chargerMemoireType();
const C = path.resolve(__dirname, '../../_corpus_verif/_dce_textes/');
const ifits = fs.readFileSync(path.join(C, 'ifits.txt'), 'utf-8');
const ind = evaluerIndicateurs(mt, { dce: ifits, analyse: {}, matrice: [{ exigence: 'Reprise du personnel en place selon l\'annexe VII', rubrique: 'b3_reprise_personnel' }] } as any);
v('IFITS : REPRISE_PERSONNEL faux (pas de personnel transférable)', ind.REPRISE_PERSONNEL.valeur === false, ind.REPRISE_PERSONNEL.raisons.join(' | '));
for (const f of fs.readdirSync(C)) {
  const d = fs.readFileSync(path.join(C, f), 'utf-8');
  if (f === 'ifits.txt') continue;
  const i = evaluerIndicateurs(mt, { dce: d, analyse: {} } as any);
  if (/écarté/.test(i.REPRISE_PERSONNEL.raisons.join(' '))) v(`${f} : reprise non écartée`, false, i.REPRISE_PERSONNEL.raisons.join(' | '));
}
console.log(ko ? `${ko} échec(s)` : 'Tout est conforme.');
process.exit(ko ? 1 : 0);

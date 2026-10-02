// T4N-3 : indicateur SSIAP et qualifications sur les 19 DCE du corpus, avec une analyse qui CITE SSIAP (pire cas :
// le modèle mentionne SSIAP partout) et avec une analyse niée (« aucun agent SSIAP exigé »).
import fs from 'fs';
import { chargerMemoireType, evaluerIndicateurs, qualificationsDuDce } from '../../src/generation/memoire_type';
const C = '../_corpus_verif/_dce_textes/';
const mt = chargerMemoireType();
const log = console.log; console.log = () => undefined;
const res: string[] = [];
for (const f of fs.readdirSync(C).filter((x) => x.endsWith('.txt'))) {
  const dce = fs.readFileSync(C + f, 'utf-8');
  const pos = evaluerIndicateurs(mt, { dce, analyse: { operationalSummary: { agentProfiles: 'Agents SSIAP 1' } }, matrice: [] } as any).SSIAP;
  const neg = evaluerIndicateurs(mt, { dce, analyse: { operationalSummary: { agentProfiles: 'Agents de sécurité (aucun agent SSIAP exigé)' } }, matrice: [{ exigence: 'Formation incendie', rubrique: 'b3_formation_ssiap_a' }] } as any).SSIAP;
  res.push(`${f.replace('.txt', '').padEnd(14)} SSIAP(analyse positive)=${pos.valeur} SSIAP(analyse niée + matrice)=${neg.valeur} qualifs(analyse positive)=${qualificationsDuDce(dce, { operationalSummary: { agentProfiles: 'Agents SSIAP 1' } }).join(',')} qualifs(niée)=${qualificationsDuDce(dce, { operationalSummary: { agentProfiles: 'Agents de sécurité (aucun agent SSIAP exigé)' } }).join(',')}`);
}
console.log = log;
console.log(res.join('\n'));

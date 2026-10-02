// Tour 1 (B5) : ordre imposé par le RC sans limite de pages (IFITS) : passages repérés seulement là où le RC impose
// l'ordre du mémoire technique ; plan reconstruit dans l'ordre du RC, sans perdre aucune rubrique du mémoire type.
import fs from 'fs';
import path from 'path';
import { passagesPlanImpose, planSelonRC } from '../src/generation/reponse_libre_v2';
import { chargerMemoireType, planMemoireType, lireJson } from '../src/generation/memoire_type';
import { repartitionLexicale } from '../src/generation/memoire_type_cadre';
let ko = 0;
const v = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const C = path.resolve(__dirname, '../../_corpus_verif/_dce_textes/');
for (const f of fs.readdirSync(C)) {
  const n = passagesPlanImpose(fs.readFileSync(path.join(C, f), 'utf-8')).length;
  const attendu = f === 'ifits.txt' || f === 'imm.txt';
  v(`${f} : passage d'ordre imposé ${attendu ? 'repéré' : 'absent'}`, attendu ? n > 0 : n === 0, String(n));
}
const mt = chargerMemoireType();
const plan = planMemoireType(mt, { SURVEILLANCE: true, CYNOPHILE: true, HORS_NORMANDIE: true } as any);
const parties = [
  { id: 'c1', title: '2-1 Moyens humains', attendu: "2-1a Nombre d'agents conducteur de chien ; 2-1d CV et attestations de formation" },
  { id: 'c2', title: '2-2 Moyens organisationnels', attendu: 'Méthodologie d’intervention ; plan de remplacement ; fréquence des contrôles' },
  { id: 'c3', title: '2-3 Moyens techniques et matériels', attendu: 'Moyens techniques ; éco-mobilité ; tenues vestimentaires' },
];
const par = repartitionLexicale(mt, plan, parties);
const p2 = planSelonRC(plan, parties, par);
v('toutes les rubriques gardées', p2.rubriques.length === plan.rubriques.length && new Set(p2.rubriques.map((r) => r.id)).size === plan.rubriques.length);
v('compréhension du besoin en tête', p2.blocs[0].rubriques.some((id) => /^b1_/.test(id)), p2.blocs[0].titre);
const titres = p2.blocs.map((b) => b.titre);
const i1 = titres.indexOf('2-1 Moyens humains'), i2 = titres.indexOf('2-2 Moyens organisationnels'), i3 = titres.indexOf('2-3 Moyens techniques et matériels');
v('parties du RC dans son ordre et avec sa numérotation', i1 >= 0 && i1 < i2 && i2 < i3, titres.join(' | '));
v('chapitres numérotés de I à n', p2.blocs.every((b, i) => b.numero === i + 1) && p2.rubriques.every((r) => p2.blocs.find((b) => b.id === r.bloc)?.cle === r.cle));
console.log(ko ? `${ko} échec(s)` : 'Tout est conforme.');
process.exit(ko ? 1 : 0);

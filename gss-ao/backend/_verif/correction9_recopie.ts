// Correction 9, bug 6 : recopie du CCTP à la voix de l'acheteur (cadre Citédia, ajouts d'adaptation IGN), échéance
// postérieure au démarrage placée avant le jour J.
import fs from 'fs';
import path from 'path';
import { sansRecopieCctp } from '../src/generation/base_memoires';
import { voixDeGss } from '../src/generation/format_court';
import { appliquerModifications, chargerMemoireType } from '../src/generation/memoire_type';
let ko = 0;
const verifier = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const T = (c: string) => fs.readFileSync(path.resolve(__dirname, `../../_corpus_verif/_dce_textes/${c}.txt`), 'utf-8');
const R = (c: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../_corpus_verif/_resultats/${c}.json`), 'utf-8'));
const cit = R('v-citedia2-12').texte_docx as string;
const dceCit = T('citedia2');
const para = (debut: string) => { const i = cit.indexOf(debut); return cit.slice(i, cit.indexOf('\n', i)); };
const p1 = para("Le Titulaire doit les actions de formation");
const p2 = para('Les tenues');
console.log(`  avant : ${p1.slice(0, 160)}…\n  avant : ${p2.slice(0, 200)}…`);
const r1 = sansRecopieCctp(p1, dceCit); const r2 = sansRecopieCctp(p2, dceCit);
console.log(`  après : ${voixDeGss(r1.texte).slice(0, 200)}\n  après : ${voixDeGss(r2.texte).slice(0, 300)}`);
verifier('Citédia : « Le Titulaire doit les actions de formation » retiré', !/Titulaire doit les actions/.test(r1.texte), r1.retires.join(' | '));
verifier('Citédia : « Vu que » et « Elle ne devra pas » retirés', !/Vu que|ne devra pas/.test(r2.texte), r2.retires.join(' | '));
// IGN : ajouts d'adaptation recopiés du CCTP, échéance du plan de prévention avant le jour J.
const ign = R('v-ign-11').sections.b5_nouveau_marche as string;
const dceIgn = T('ign');
const ajouts = [
  'Un état des lieux contradictoire des locaux et installations mis à disposition est réalisé à la notification et à l’échéance du marché ; les locaux et installations sont maintenus en parfait état d’entretien.',
  'À Coriolis, l’accueil des premiers utilisateurs du bâtiment est assuré par le SSIAP 2 dédié lors de sa prise de poste, à compter de 7h00.',
  'En cas d’absence imprévue et imprévisible d’un agent, quels que soit son niveau de qualification et son poste, constatée le jour même de sa prise de poste, son remplaçant devra être présent sur site dans les deux (2) heures suivant l’heure normale de la prise de poste de l’agent absent.',
];
const base = chargerMemoireType().rubriques.find((x) => x.id === 'b5_nouveau_marche')!.texte!;
const r = appliquerModifications(base, {
  ajouts: ajouts.map((texte) => ({ apres: '', texte })),
  remplacements: [{ extrait: 'élaboration du LMC (livre des missions et consignes)', par: 'élaboration du LMC (livre des missions et consignes) ; le projet de plan de prévention est soumis au SAIMG dans le mois suivant la prise d’effet du marché' }],
} as any, { dce: dceIgn });
r.refusees.forEach((x) => console.log(`  refusé (${x.type}) : ${x.raison}`)); r.appliquees.forEach((x) => console.log(`  appliqué (${x.type}) : ${String(x.par).slice(0, 80)}`));
verifier('IGN : l’ajout recopié du CCTP à la voix de l’acheteur (remplaçant « devra être présent ») est refusé', r.refusees.some((x) => x.type === 'ajout' && /^recopie du CCTP/.test(x.raison || '') && /devra être présent/.test(String(x.par))));
verifier('IGN : plan de prévention « dans le mois suivant la prise d’effet » refusé dans la phase J-30', r.refusees.some((x) => /avant le jour J/.test(x.raison || '')));
verifier('IGN : texte réel de la rubrique contenait bien ces ajouts', ajouts.every((a) => ign.includes(a.slice(0, 40))));
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK');

// T3C-3 / T3N-4 : schémas de secours du bloc 1 sur le contenu ; anomalies des étapes du modèle (ifsem 335).
import fs from 'fs';
import path from 'path';
import { specSecoursPuces, specSecoursBesoin, anomaliesSchemaBloc1, defautsEtapesBesoin, specProcessBesoin, resultatBesoin } from '../../src/generation/reponse_libre_v2';
const RES = path.resolve(__dirname, '../../../_corpus_verif/_resultats');
const bloc1 = (f: string) => { const d = JSON.parse(fs.readFileSync(path.join(RES, f), 'utf-8')); const s = d.sections; return s.b1_comprehension || Object.values(s).find((v: any) => /## Vos attentes/.test(v)) as string; };
let ko = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? 'OK ' : 'KO '} ${n}`); if (!c) ko++; };
const GENERIQUE = /^(?:Votre contexte|Le périmètre|Vos attentes|Les points de vigilance)/i;
for (const f of ['v-imm-341.json', 'v-citedia-341.json', 'v-ifsem-335.json']) {
  if (!fs.existsSync(path.join(RES, f))) continue;
  const t = bloc1(f);
  let imm = t;
  if (f.startsWith('v-imm')) imm = t.slice(t.indexOf('## Votre contexte'), t.indexOf('## Décomposition'));
  const a = specSecoursPuces(imm), b = specSecoursBesoin(imm);
  console.log(`\n== ${f}`);
  for (const [n, s] of [['puces', a], ['besoin', b]] as const) console.log(n, s ? JSON.stringify(s.params.etapes) : 'null');
  for (const s of [a, b]) if (s) {
    ok(`${f} : aucun intitulé générique`, !s.params.etapes.some((e: any) => GENERIQUE.test(e.titre)));
    ok(`${f} : chaque étape a un texte`, s.params.etapes.every((e: any) => String(e.texte || '').trim()));
    ok(`${f} : résultat ≠ attente citée`, !/laissé vacant|^Continuité de service$/i.test(s.params.etapes[s.params.etapes.length - 1].texte));
    ok(`${f} : aucune anomalie`, !anomaliesSchemaBloc1(s).length);
  }
  ok(`${f} : un secours au moins`, !!(a || b));
  console.log('résultat :', resultatBesoin(imm));
}
const etapes = [
  { titre: 'Lot 2, trois sites', texte: 'Le présent périmètre porte sur le lot 2.', role: 'rouge' },
  { titre: 'Remplacement sous deux heures', texte: 'Absence inopinée : remplacement dans un délai maximal de deux heures.', role: 'rouge' },
  { titre: 'Rondes pointées', texte: 'Les rondes sont pointées.', role: 'orange' },
  { titre: 'Traçabilité des rondes', texte: 'Les rondes sont pointées et consignées dans la main courante électronique.', role: 'bleu' },
  { titre: 'Continuité contrôlée', texte: 'Le CNRS bénéficie d’un service continu, tracé et contrôlé.', role: 'vert' },
];
const an = anomaliesSchemaBloc1((specProcessBesoin as any)(etapes, 'flux'));
console.log('\nifsem étapes du modèle :', an);
ok('ifsem : texte qui redit le titre', an.some((x) => /Rondes pointées.*redit le titre/.test(x)));
ok('ifsem : étapes 3 et 4 qui se répètent', an.some((x) => /étapes 3 et 4 : textes qui se répètent/.test(x)));
ok('ifsem : étape 1 limitée au lot', an.some((x) => /étape 1 .*lot ou le périmètre/.test(x)));
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK');
process.exit(ko ? 1 : 0);

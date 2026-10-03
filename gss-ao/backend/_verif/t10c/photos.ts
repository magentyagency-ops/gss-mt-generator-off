// T10C-1 : interdit des photos du DCE et son exception (citedia), sur tout le corpus.
import fs from 'fs';
import { interditPhotosDce, interditsDce } from '../../src/generation/base_memoires';
import { chargerMemoireType, preparerMemoireType } from '../../src/generation/memoire_type';
const dir = `${__dirname}/../../../_corpus_verif/_dce_textes/`;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.txt'))) {
  const r = interditPhotosDce(fs.readFileSync(dir + f, 'utf8'));
  console.log(f.padEnd(18), r ? `photos=${r.photos} videos=${r.videos} | ${r.citation.slice(0, 160)}…${r.citation.slice(-120)}` : '—');
}
const dce = fs.readFileSync(dir + 'citedia.txt', 'utf8');
const mt = chargerMemoireType();
const r = mt.rubriques.find((x) => /la réactivité/.test(x.texte || ''))!;
const t = (r.texte || '').split('\n').find((l) => /réactivité/.test(l))!;
const p = preparerMemoireType({ dce, analyse: {} } as any, { memoireType: mt });
console.log('PHOTOS_INTERDITES =', p.indicateurs.PHOTOS_INTERDITES, p.etatsIndicateurs?.PHOTOS_INTERDITES?.raisons);
const essais = [
  "- **la réactivité** : l'agent envoie en temps réel ses rapports sur les événements de sa vacation, qu'il peut illustrer de photos ou de vidéos ; l'équipe encadrante contrôle ainsi le contenu.",
  "- les systèmes de vidéosurveillance : lorsque le site en est équipé, nous formons nos agents à une utilisation ciblée du système du site : présentation du système, repérage d'une situation suspecte, suivi d'un individu en vidéo, traitement des images, communication avec l'équipe terrain.",
  'Le rondier rédige un rapport illustré de photos justificatives.',
  "Les formations techniques :\n- les talkies-walkies, oreillettes, PTI ;\n- l'agent filme les incidents en vidéo pour son rapport.\n\nSuite.",
];
for (const e of essais) console.log('\n>>', e, '\n<<', interditsDce(e, dce));
console.log('\nSans exception :');
const dce2 = 'Article 5. Il est interdit de prendre des photos sur le site.';
for (const e of essais) console.log('<<', JSON.stringify(interditsDce(e, dce2)));

// T3C-2 / T3N-2 : texte écologique de GSS (havre2, champ 37) recalé dans l'ordre de GSS, sous-titres remis, sans doublon.
import fs from 'fs';
import path from 'path';
import { recalerSurReference, texteBrut, fideliteReponse, nettoyerReponseCadre, completerSousTitresVides } from '../../src/generation/memoire_type_cadre';
import { nettoyerChampCadre } from '../../src/generation/base_memoires';
const mt = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../src/generation/memoire_type/memoire_type.json'), 'utf-8'));
const ref = ['b2_ecologie_mobilite_numerique', 'b2_ecologie_energie_recyclage'].map((id) => texteBrut(mt.rubriques.find((r: any) => r.id === id).texte)).join('\n\n');
const reponse = `Nous avons conscience qu'aujourd'hui le climat et le respect de la nature sont un enjeu primordial. Il est essentiel de changer nos habitudes et de tendre vers un impact minimal ; cette démarche n'est pas incompatible avec l'activité professionnelle, bien au contraire.
• Nous encourageons nos salariés, lorsque la nature de leur vacation le permet, à se rendre sur leur site en transports en commun ou à vélo.
Pour les fermetures des jardins suspendus et des trois parkings, où les rapports horodatés sont transmis quotidiennement, GSS privilégie des pratiques qui limitent les déplacements et les supports papier sans compromettre la traçabilité attendue par la Ville. Nous nous rapprochons autant que possible du zéro papier : nos mains courantes papier ont été remplacées par des mains courantes électroniques ; nous communiquons en interne essentiellement par mail ou par Dropbox et n'imprimons plus de documents. Nous avons noué un partenariat novateur avec l'entreprise Triethic, qui collecte les tenues professionnelles usagées et les recycle selon trois filières : Ces dispositions associent sobriété des déplacements, dématérialisation des échanges et valorisation des tenues en fin de vie, tout en maintenant la transmission quotidienne des éléments de suivi requis pour le marché.
• l'effilochage : les vêtements sont triés par couleur et par matière, puis effilochés et retissés ;
• le combustible : les matières non réutilisables et non dangereuses servent de combustible.
Les transports :
Les économies d'énergie :`;
const r = recalerSurReference(ref, reponse);
console.log(r.texte);
console.log('---');
console.log('fidélité', r.fideliteAvant.toFixed(2), '→', r.fidelite.toFixed(2));
const pos = (x: string) => r.texte.indexOf(x);
const verifs: Array<[string, boolean]> = [
  ['sous-titres présents', ['Les transports :', 'Le numérique :', "Les économies d'énergie :", 'Un réel engagement :', 'Le recyclage de nos tenues :', 'Nos déchets au bureau :'].every((x) => r.texte.includes(x))],
  ['« trois filières : » suivi de la liste', /trois filières :\n• le réemploi/.test(r.texte)],
  ['ajout de l’IA après le texte de GSS', pos('Ces dispositions associent') > pos('À l\'heure où les questions')],
  ['ordre transports < numérique < économies < engagement < recyclage < déchets', [pos('Les transports :'), pos('Le numérique :'), pos("Les économies d'énergie :"), pos('Un réel engagement :'), pos('Le recyclage de nos tenues :'), pos('Nos déchets au bureau :')].every((x, i, t) => !i || t[i - 1] < x)],
  ['« combustible : les matières » une seule fois', r.texte.split('combustible : les matières').length === 2],
  ['zéro papier sous Le numérique', pos('zéro papier') > pos('Le numérique :') && pos('zéro papier') < pos("Les économies d'énergie :")],
  ['fidélité ≥ 0,9', r.fidelite >= 0.9],
];
// Suite de la chaîne du cadre (nettoyages du générateur) : les sous-titres de GSS restent.
const chaine = nettoyerChampCadre(completerSousTitresVides(nettoyerReponseCadre(r.texte), []).texte);
verifs.push(['chaîne du cadre : sous-titres gardés', ['Les transports :', 'Le numérique :', "Les économies d'énergie :", 'Un réel engagement :', 'Le recyclage de nos tenues :', 'Nos déchets au bureau :'].every((x) => chaine.includes(x))]);
verifs.push(['chaîne du cadre : texte inchangé', chaine.trim() === r.texte.trim()]);
// Lignes de GSS seulement permutées : remises dans l'ordre.
const lignes = ref.split('\n').filter((l) => l.trim());
const desordre = [...lignes.slice(10), ...lignes.slice(0, 10)].join('\n');
console.log('permuté : fidélité mesurée', fideliteReponse(ref, desordre).toFixed(2));
const rp = recalerSurReference(ref, desordre);
verifs.push(['permuté : mesure < 0,9', fideliteReponse(ref, desordre) < 0.9]);
verifs.push(['permuté : texte remis = référence', rp.texte.replace(/\n+/g, '\n') === ref.replace(/\n+/g, '\n')]);
for (const [n, ok] of verifs) console.log(ok ? 'OK ' : 'KO ', n);
process.exit(verifs.every((v) => v[1]) ? 0 : 1);

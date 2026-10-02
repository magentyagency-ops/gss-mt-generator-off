import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { recalerSurReference, texteBrut, fideliteReponse, nettoyerReponseCadre, completerSousTitresVides } from '../src/generation/memoire_type_cadre';
import { nettoyerChampCadre } from '../src/generation/base_memoires';

/** Tour 3 (T3C-2, T3N-2, havre2 335 et 341, champ 37) : texte écologique de GSS remis dans son ordre, avec ses sous-titres. */
describe('recalage du cadre : ordre, sous-titres et listes du texte de GSS', () => {
  const mt = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/generation/memoire_type/memoire_type.json'), 'utf-8'));
  const ref = ['b2_ecologie_mobilite_numerique', 'b2_ecologie_energie_recyclage'].map((id) => texteBrut(mt.rubriques.find((r: any) => r.id === id).texte)).join('\n\n');
  const SOUS_TITRES = ['Les transports :', 'Le numérique :', "Les économies d'énergie :", 'Un réel engagement :', 'Le recyclage de nos tenues :', 'Nos déchets au bureau :'];
  const reponse = `Nous avons conscience qu'aujourd'hui le climat et le respect de la nature sont un enjeu primordial. Il est essentiel de changer nos habitudes et de tendre vers un impact minimal ; cette démarche n'est pas incompatible avec l'activité professionnelle, bien au contraire.
• Nous encourageons nos salariés, lorsque la nature de leur vacation le permet, à se rendre sur leur site en transports en commun ou à vélo.
Pour les fermetures des jardins suspendus et des trois parkings, où les rapports horodatés sont transmis quotidiennement, GSS privilégie des pratiques qui limitent les déplacements et les supports papier sans compromettre la traçabilité attendue par la Ville. Nous nous rapprochons autant que possible du zéro papier : nos mains courantes papier ont été remplacées par des mains courantes électroniques ; nous communiquons en interne essentiellement par mail ou par Dropbox et n'imprimons plus de documents. Nous avons noué un partenariat novateur avec l'entreprise Triethic, qui collecte les tenues professionnelles usagées et les recycle selon trois filières : Ces dispositions associent sobriété des déplacements, dématérialisation des échanges et valorisation des tenues en fin de vie, tout en maintenant la transmission quotidienne des éléments de suivi requis pour le marché.
• l'effilochage : les vêtements sont triés par couleur et par matière, puis effilochés et retissés ;
• le combustible : les matières non réutilisables et non dangereuses servent de combustible.
Les transports :
Les économies d'énergie :`;

  it('réponse qui reprend peu le texte de GSS : texte de GSS dans l’ordre, puis les ajouts', () => {
    const r = recalerSurReference(ref, reponse);
    const pos = (x: string) => r.texte.indexOf(x);
    for (const st of SOUS_TITRES) expect(r.texte).toContain(st);
    const positions = SOUS_TITRES.map(pos);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(r.texte).toMatch(/trois filières :\n• le réemploi/);
    expect(pos('Ces dispositions associent')).toBeGreaterThan(pos("À l'heure où les questions"));
    expect(r.texte.split('combustible : les matières')).toHaveLength(2);
    expect(r.fidelite).toBeGreaterThanOrEqual(0.9);
    // Chaîne de nettoyage du cadre : rien n'est retiré ni inséré dans le texte de GSS.
    const chaine = nettoyerChampCadre(completerSousTitresVides(nettoyerReponseCadre(r.texte), [{ texte: ref }]).texte);
    expect(chaine.trim()).toBe(r.texte.trim());
  });

  it('lignes de GSS permutées : la mesure baisse et le recalage rétablit l’ordre', () => {
    const lignes = ref.split('\n').filter((l) => l.trim());
    const desordre = [...lignes.slice(10), ...lignes.slice(0, 10)].join('\n');
    expect(fideliteReponse(ref, desordre)).toBeLessThan(0.9);
    const r = recalerSurReference(ref, desordre);
    expect(r.texte.replace(/\n+/g, '\n')).toBe(ref.replace(/\n+/g, '\n'));
    expect(r.fidelite).toBe(1);
  });

  it('sous-titre perdu ou phrase de GSS en double : la mesure baisse', () => {
    expect(fideliteReponse(ref, ref)).toBe(1);
    expect(fideliteReponse(ref, ref.replace('Un réel engagement :\n', ''))).toBeLessThan(1);
    const double = ref.replace('Nos déchets au bureau :', "• le combustible : les matières non réutilisables et non dangereuses servent de combustible, ce qui réduit la consommation d'énergies fossiles et l'enfouissement de déchets.\nNos déchets au bureau :");
    expect(fideliteReponse(ref, double)).toBeLessThan(1);
  });

  it('nettoyage du champ : sous-titre suivi de son texte gardé, étiquette vide retirée', () => {
    expect(nettoyerChampCadre('Un réel engagement :\nAu-delà des gestes du quotidien, nous donnons une dimension particulière à l’écologie.')).toContain('Un réel engagement :');
    expect(nettoyerChampCadre('Les événements sont catégorisés. Outil de pointage des rondes et points de contrôle :\n\nContenu des rapports')).not.toMatch(/contrôle :/);
  });
});

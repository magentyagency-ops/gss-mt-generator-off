import { describe, it, expect } from 'vitest';
import { completerSousTitresVides } from '../src/generation/memoire_type_cadre';

/** Tour 8 (T8N-1) : sous-titre du cadre resté vide, rempli par le texte de GSS qui porte le même sous-titre. */
describe('sous-titre vide du cadre (T8N-1, etampes1 594)', () => {
  const sources = [{ texte: [
    'Notre équipe dédiée au marché est composée de 4 agents titulaires et de 2 agents suppléants formés au site.',
    "Les agents de l'équipe dédiée sont titulaires des diplômes suivants : CQP APS.",
    '',
    'La stabilité des équipes :',
    "Nous privilégions la stabilité sur les sites fixes, tout en maintenant un léger roulement : les agents acquièrent ainsi une très bonne connaissance du site et de vraies compétences, sans laisser de mauvaises habitudes s'installer.",
    '',
    "Les équipes encadrantes se déplacent régulièrement sur le terrain pour rencontrer nos agents et leurs équipes.",
  ].join('\n') }];
  it('« Stabilité des équipes » reçoit le paragraphe de GSS sous « La stabilité des équipes : », jamais [À COMPLÉTER]', () => {
    const r = completerSousTitresVides('Stabilité des équipes\n\nLe management de proximité\nToujours dans le but de stabiliser nos équipes, nous veillons à un management de proximité.', sources, [], 'Engagement de la société sur la stabilité des équipes');
    expect(r.texte.split('\n').slice(0, 2)).toEqual(['Stabilité des équipes', "Nous privilégions la stabilité sur les sites fixes, tout en maintenant un léger roulement : les agents acquièrent ainsi une très bonne connaissance du site et de vraies compétences, sans laisser de mauvaises habitudes s'installer."]);
    expect(r.texte).not.toMatch(/\[À COMPLÉTER\]/);
  });
  it('ex aequo sur un seul mot : le mot le plus rare départage (« stabilité » plutôt que « équipes »)', () => {
    const sans = [{ texte: sources[0].texte.replace('La stabilité des équipes :\n', '') }];
    const r = completerSousTitresVides('Stabilité des équipes\n\nLe management de proximité\nTexte.', sans, [], '');
    expect(r.texte.split('\n')[1]).toMatch(/^Nous privilégions la stabilité/);
  });
});

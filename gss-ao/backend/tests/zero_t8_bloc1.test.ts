// Tour 8 (correcteur) : bloc 1 Marine v3, libellés EXIGENCE et cartes du schéma de process (T8N-5, T8-CONS-9, T8-CONS-16).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { libelleExigenceBloc1, libelleBloc1Valide, specSecoursBesoin, anomaliesSchemaBloc1 } from '../src/generation/reponse_libre_v2';
import { pageBloc1Marine } from '../src/generation/bloc1_marine';

describe('libellés EXIGENCE entiers (T8N-5)', () => {
  const cas: Array<[string, string]> = [
    ['Tout personnel affecté, même ponctuellement, aux prestations incendie doit détenir un SSIAP 2 à jour depuis moins de 3 ans', 'SSIAP 2 de moins de 3 ans'],
    ['Disposer d’une carte professionnelle en cours de validité, datant de moins de 5 ans, et être en mesure de la présenter à tout moment', 'Carte professionnelle en cours de validité'],
    ['À Villejuif et Thiais : présence permanente d’un SSIAP 1, toute l’année, 7j/7 et 24h/24', 'Présence permanente d’un SSIAP 1'],
    ['Agents de chaque site : secourisme à jour (AFPS, SST, PSE1 ou équivalent), avec attestation de recyclage annuelle', 'Secourisme à jour'],
    ['En cas de défaillance ou de perte d’un matériel, le délai de remplacement est de 24 heures maximum.', 'Remplacement sous 24 heures'],
    ['Réaliser une ronde de fermeture du lundi au vendredi, de 19 h 30 à 20 h 30 ; le CSTB peut ajuster les horaires', 'Ronde de fermeture'],
    ['Effectuer 3 rondes de nuit entre 21 h 30 et 06 h 30, du lundi au vendredi et les jours de fermeture', '3 rondes de nuit'],
    ['Fournir à chaque agent un téléphone utilisé comme PTI, avec alerte d’urgence', 'Téléphone utilisé comme PTI'],
  ];
  for (const [c, l] of cas) it(l, () => expect(libelleExigenceBloc1('', c)).toBe(l));
  it('jamais « Copie du canidé » (génitif sans sa tête)', () => expect(libelleExigenceBloc1('', 'Une copie des documents règlementaires du canidé est transmise dans les trois (3) jours ouvrés')).not.toMatch(/Copie du canidé/));
  it('libellés refusés', () => {
    for (const l of ['Détenir un SSIAP 2 à jour depuis moins', 'Disposer d’une carte professionnelle en cours', 'Villejuif et Thiais : présence permanente d’un', 'Défaillance ou de perte d’un matériel', '3 rondes de nuit, et les jours de fermeture', 'Fournir à chaque agent un téléphone utilisé', 'Affecté, même ponctuellement, aux prestations']) expect(libelleBloc1Valide(l), l).toBe(false);
    for (const l of ['Journée portes ouvertes', 'Autocontrôles effectués', 'Rondes d’ouverture et de fermeture']) expect(libelleBloc1Valide(l), l).toBe(true);
  });
  it('jamais une case EXIGENCE vide', () => {
    const md = String(pageBloc1Marine('## Notre compréhension de votre besoin\n\nTexte.\n\n## Vos attentes et nos engagements\n- Agents de chaque site : secourisme à jour (AFPS, SST, PSE1 ou équivalent), avec attestation de recyclage annuel → notre réponse : « Formations et certifications : habilitation électrique, SST et PSC1 », développée au bloc 3.\n', {}, {}));
    expect(md).toMatch(/\| Secourisme à jour \|/);
  });
});

describe('cartes du schéma de process (T8-CONS-9, T8-CONS-16)', () => {
  it('imm : ni « Faite », ni « Développé dans la partie 2 », poste entier', () => {
    const s = specSecoursBesoin(fs.readFileSync(path.join(__dirname, 'fixtures/bloc1_imm_1883.md'), 'utf-8'));
    const e = s!.params.etapes as Array<{ titre: string; texte: string }>;
    expect(e.map((x) => x.titre)).not.toContain('Faite');
    expect(e.some((x) => /partie\s+\d/.test(x.texte))).toBe(false);
    expect(e.some((x) => x.titre === 'Chef d’équipe ou agent N1 au poste')).toBe(false);
    expect(e.some((x) => /^Besoins ponctuels sous 24\s+h$/u.test(x.titre))).toBe(true);
  });
  it('titre à la première personne et texte sans antécédent refusés', () => {
    const an = anomaliesSchemaBloc1({ gabarit: 'flux', params: { etapes: [{ titre: 'Poste d’accueil', texte: 'Entre 20h et 7h tous les soirs' }, { titre: 'Nous préparons l’affectation', texte: 'La relève de ce poste' }, { titre: 'Votre résultat', texte: 'Continuité de service' }] } });
    expect(an.some((a) => /titre est une phrase/.test(a))).toBe(true);
    expect(an.some((a) => /sans antécédent/.test(a))).toBe(true);
  });
});

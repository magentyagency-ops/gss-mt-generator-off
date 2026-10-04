// Tour 7 (correcteur) : cadre imposé et couverture du CCTP (T7-CONS-1, T7-CONS-2, T7-REG-1).
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { recalerSurReference, candidatsReference, referencesDeSecours } from '../src/generation/memoire_type_cadre';
import { engagementSansRedite, engagementDejaEcrit, phraseAjouteeConjuguee } from '../src/generation/reponse_libre_v2';
import { chargerMemoireType, preparerMemoireType, publierMemoire } from '../src/generation/memoire_type';

describe('recalage d’une réponse de grille sans limite de mots (T7-REG-1)', () => {
  const L = fs.readFileSync(path.join(__dirname, 'fixtures/recalage_etampes2_ecologie_t7.jsonl'), 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
  for (const [i, x] of L.entries()) it(`etampes2, clauses environnementales, réponse ${i + 1} : texte de GSS remis en entier, à sa place`, () => {
    const r = recalerSurReference(x.reference, x.reponse, { limite: true, attendus: [] });
    expect(r.texte.length).toBeGreaterThan(5000);
    expect(r.reinserees).toBeGreaterThan(10);
    expect(r.texte.indexOf('Écogestes')).toBeLessThan(r.texte.indexOf('économies d'));
    expect(r.texte).not.toMatch(/^\s*•?\s*Nous budgétons/m);
  });
});

describe('rubriques du mémoire type choisies sans modèle (T7-CONS-1)', () => {
  it('« Moyens humains affectés au marché… réactivité » : une rubrique de GSS, jamais une proposition hors mémoire type', () => {
    const mt = chargerMemoireType();
    const prep = preparerMemoireType({ analyse: { clientName: 'Ville de Vitry-sur-Seine' }, dce: 'Ville de Vitry-sur-Seine, 94400. Sécurité événementielle.', referents: '' } as any, { memoireType: mt } as any);
    const textes: Record<string, string> = Object.fromEntries(publierMemoire(prep).map((r: any) => [r.id, r.texte || '']));
    const q = "SOUS CRITERE 3 : Moyens humains affectés au marché permettant d'assurer la bonne organisation de l'entreprise et sa réactivité";
    const s = referencesDeSecours(candidatsReference(mt, textes, q, {}), q);
    expect(s.map((x) => x.id)).toContain('b3_adequation');
  });
});

describe('engagement déjà écrit dans la réponse (T7-CONS-2)', () => {
  it('cadre vitry : fichiers, déchets ; réponse libre ifsem : réunion de démarrage', () => {
    const v = 'Pour les échanges liés aux bons de commande et aux plannings, GSS limite la taille et le poids des fichiers transmis et privilégie les liens de partage.\nGSS assure également la gestion conforme des déchets produits sur le site.';
    expect(engagementSansRedite('GSS limite la taille et le poids des fichiers transmis.', v)).toBe('');
    expect(engagementSansRedite('GSS assure la gestion conforme des déchets.', v)).toBe('');
    expect(engagementSansRedite('GSS équipe chaque agent d’un outil de pointage NFC lors des rondes à pied.', v)).toMatch(/NFC/);
    const t = 'La réunion de démarrage a lieu au moins 10 jours avant la première intervention de GSS sur le site, avec le pôle achats IFSeM, le représentant du service prescripteur et le responsable d’encadrement de GSS.';
    expect(engagementSansRedite('GSS tiendra la réunion de démarrage au moins 10 jours avant la première intervention, avec le pôle achats IFSeM, le représentant du service prescripteur et le responsable d’encadrement de GSS, et formera les services bénéficiaires aux outils du marché, notamment à la main courante.', t))
      .toBe('GSS formera les services bénéficiaires aux outils du marché, notamment à la main courante.');
    expect(engagementDejaEcrit('GSS réalise trois rondes de nuit.', 'GSS réalise deux rondes de nuit.')).toBe(false);
  });
  it('phrase ajoutée d’après le CCTP à la voix de GSS', () => {
    expect(phraseAjouteeConjuguee('La réunion de démarrage devra avoir lieu au moins 10 jours avant la première intervention de GSS sur le site.')).toBe('La réunion de démarrage a lieu au moins 10 jours avant la première intervention de GSS sur le site.');
    expect(phraseAjouteeConjuguee('Les agents devront être titulaires du SST.')).toBe('Les agents sont titulaires du SST.');
  });
});

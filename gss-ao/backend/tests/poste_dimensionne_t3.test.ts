// T3N-9 : un poste du CCTP déjà dimensionné n'est pas une question nouvelle ; un engagement laissé en blanc n'est jamais imprimé.
import { describe, it, expect } from 'vitest';
import { exigenceDePosteDimensionne } from '../src/generation/dimensionnement';
import { controlerProposition } from '../src/generation/reponse_libre_v2';

const dim: any = {
  profils: [
    { profil: 'Agent de sécurité incendie', qualification: 'SSIAP 1', lieux: ['Campus de Villejuif', 'Campus de Thiais'], heuresSemaine: 336, heuresAn: 0, etp: 10.9, titulaires: 11 },
    { profil: 'Agent de sécurité', qualification: 'CQP APS', lieux: ['Campus de Villejuif', 'Campus de Thiais', "Site d'Ivry-sur-Seine"], heuresSemaine: 298, heuresAn: 0, etp: 9.6, titulaires: 10 },
  ],
  titulaires: 21, suppleants: 7, casPratique: [],
};

describe('poste déjà dimensionné (T3N-9)', () => {
  it('ADS permanent à Ivry, 7 j/7 et 24 h/24, vacations 7 h-19 h et 19 h-7 h : couvert par le dimensionnement', () => {
    expect(exigenceDePosteDimensionne('Présence permanente à Ivry : un ADS toute l’année, 7 j/7 et 24 h/24, en vacations de 7 h à 19 h et de 19 h à 7 h.', dim)).toBe(true);
  });
  it('autre site, autre poste ou sans horaires : question nouvelle possible', () => {
    expect(exigenceDePosteDimensionne('Un ADS permanent à Gentilly, 24 h/24.', dim)).toBe(false);
    expect(exigenceDePosteDimensionne('Un maître-chien à Ivry de 19 h à 7 h.', dim)).toBe(false);
    expect(exigenceDePosteDimensionne('Plan de prévention des risques à Ivry.', dim)).toBe(false);
    expect(exigenceDePosteDimensionne('Un ADS permanent à Ivry, 24 h/24.', null)).toBe(false);
  });
  it('SSIAP 1 de Villejuif en vacations : couvert', () => {
    expect(exigenceDePosteDimensionne('Un agent SSIAP 1 à Villejuif en vacations de 12 heures, jour et nuit.', dim)).toBe(true);
  });
});

describe('engagement laissé en blanc retiré des propositions (T3N-9)', () => {
  it('« Engagement de GSS … : [À COMPLÉTER]. » et sa question partent', () => {
    const t = `À Ivry, le poste fixe d’ADS est implanté à l’accueil.\n\n**Engagement de GSS sur la couverture permanente de ce poste et ces horaires : [À COMPLÉTER].**\n[CONSULTATION REQUISE : Pouvez-vous confirmer que GSS s’engage… ?]\n\nÀ chaque prise de service, l’agent vérifie sa tenue.`;
    const r = controlerProposition(t);
    expect(r.texte).not.toMatch(/Engagement de GSS|\[À COMPLÉTER\]|CONSULTATION REQUISE/);
    expect(r.texte).toMatch(/À chaque prise de service/);
  });
});

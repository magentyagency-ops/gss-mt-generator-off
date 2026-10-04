// Campagne « zéro défaut », tour 2 : nom de l'acheteur (T2-COH-1, T2-COH-3, T2-GEN-8).
import { describe, it, expect } from 'vitest';
import { formesClient, preparerMemoireType, publierMemoire, chargerMemoireType } from '../src/generation/memoire_type';
import { completerDelaisCadre } from '../src/generation/memoire_type_cadre';

const texte = (nom: string, dce: string) => publierMemoire(preparerMemoireType({ dce, analyse: { clientName: nom }, cover: { client: nom }, referents: '' } as any, { memoireType: chargerMemoireType() })).map((r: any) => r.texte || '').join('\n');

describe('forme juridique, nom propre et service après le tiret (T2-COH-1)', () => {
  it('« l’Opéra de Rouen Normandie », jamais « l’Établissement public »', () => {
    const dce = "CCTP\nL'Établissement public de coopération culturelle Opéra de Rouen Normandie (ci-après « l'Opéra de Rouen Normandie ») confie la surveillance du Théâtre des Arts, 7 rue du Docteur Rambert, 76000 Rouen. L'Opéra de Rouen Normandie se réserve le droit.";
    const nom = 'Établissement public de coopération culturelle Opéra de Rouen Normandie - Direction des bâtiments et de la logistique';
    expect(formesClient(nom, dce).court).toMatchObject({ article: "l'", nom: 'Opéra de Rouen Normandie' });
    const t = texte(nom, dce);
    expect(t).not.toMatch(/[ÉE]tablissement public(?! de coop)/);
    expect(t).toMatch(/Pour l'Opéra de Rouen Normandie, nous mobilisons/);
  });
  it('« industriel et commercial » : le service après le tiret n’est jamais gardé', () => {
    const f = formesClient('Établissement public industriel et commercial Rouen Normandie Tourisme & Congrès - Service des achats', "L'EPIC Rouen Normandie Tourisme & Congrès confie la surveillance. Rouen Normandie Tourisme & Congrès se réserve.");
    expect(f.court).toMatchObject({ article: '', nom: 'Rouen Normandie Tourisme & Congrès' });
  });
});

describe('élision devant un nom en h muet (T2-COH-3)', () => {
  it('« d’Habitat 76 », jamais « de Habitat 76 »', () => {
    const t = texte('HABITAT 76', "Habitat 76 lance un marché de surveillance. Les locaux d'Habitat 76 sont situés au 53 avenue de Bretagne, 76100 Rouen.");
    expect(t).not.toMatch(/\bde Habitat 76/i);
    expect(t).toMatch(/d'Habitat 76/);
  });
  it('question du cadre : « du CHU », « d’Habitat 76 »', () => {
    const q = "Délais d'interventions proposés par le candidat concernant : une action d'urgence liée à un débordement";
    const r = completerDelaisCadre("Une action d'urgence liée à un débordement\nGSS déclenche l'astreinte.", q, { client: 'Habitat 76' });
    expect(r.ajouts[0]?.question).toMatch(/^Pour le marché d'Habitat 76,/);
    expect(completerDelaisCadre("Une action d'urgence liée à un débordement\nGSS déclenche l'astreinte.", q, { client: 'le CHU de Rouen' }).ajouts[0]?.question).toMatch(/^Pour le marché du CHU de Rouen,/);
  });
});

describe('nom court suivi de son sigle (T2-GEN-8)', () => {
  it.each([
    ['Établissement Français du Sang (EFS)', "L'Établissement Français du Sang (EFS) lance une consultation. L'EFS… les sites de l'EFS… à l'EFS… 76000 Rouen", "l'", 'EFS'],
    ['Centre Hospitalier Universitaire de Rouen (CHU)', 'Le Centre Hospitalier Universitaire de Rouen (CHU) lance une consultation. Le CHU… les sites du CHU… au CHU… 76000 Rouen', 'le', 'CHU'],
  ])('%s : forme courte « %s »', (nom, dce, article, sigle) => {
    expect(formesClient(nom, dce).court).toMatchObject({ article, nom: sigle });
    expect((texte(nom, dce).match(new RegExp(`\\(${sigle}\\)`, 'g')) || []).length).toBe(0);
  });
});

describe('intitulé du marché en capitales mis en casse normale (T2-CONS-14)', () => {
  it('graphie du DCE mot par mot, sigles gardés', () => {
    const dce = "Le Centre scientifique et technique du bâtiment (CSTB) confie des prestations de rondes de surveillance du site du CSTB à Grenoble. Le CSTB précise les rondes.";
    const prep: any = preparerMemoireType({ dce, analyse: { clientName: 'CSTB', projectTitle: 'PRESTATIONS DE RONDES DE SURVEILLANCE DU SITE DU CSTB GRENOBLE' }, referents: '' } as any, { memoireType: chargerMemoireType() });
    expect(prep.variables.OBJET_MARCHE.valeur).toBe('Prestations de rondes de surveillance du site du CSTB Grenoble');
  });
});

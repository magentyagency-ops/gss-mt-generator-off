import { describe, it, expect } from 'vitest';
import { delaisHorsNormandie } from '../src/generation/base_memoires';
import { DCE, aCorpus } from './fixtures/corpus';

/** Tour 7 (T7N-4) : un délai de remise de documents fixé par l'acheteur n'est ni un délai normand, ni une pénalité de remplacement. */
const EXTRAIT_CSTB = `Gardiennage du site du CSTB, 38400 Saint-Martin-d'Hères.
• Pénalité pour non remise de document (bon d’intervention, reporting d’activités, habilitation
des personnels, plannings, etc…)
En cas de non remise d’un document dans les délais de la prise en charge ou de remise tardive lors
d’une sollicitation ponctuelle (+ 72h à partir de la 1ère demande du CSTB), une pénalité forfaitaire de
100 € sera appliquée.`;
const PHRASE = "Les documents demandés, notamment les bons d’intervention, reportings, habilitations et plannings, sont remis dans le délai applicable et, après sollicitation, au plus tard dans les 72 h suivant la première demande.";

describe('délai de remise des documents hors Normandie (T7N-4)', () => {
  it('la phrase de GSS sur la remise des documents est gardée, sans question ni phrase de pénalité', () => {
    const r = delaisHorsNormandie(`Jalons J-10, J-7 et J-3. ${PHRASE}`, EXTRAIT_CSTB, true);
    expect(r.texte).toContain(PHRASE);
    expect(r.retires).toEqual([]);
    expect(r.texte).not.toMatch(/GSS organise ses remplacements|pénalise tout dépassement/);
  });
  it('une promesse d’intervention en 72 h n’est pas couverte par le délai des documents : retirée, question posée, sans « GSS organise ses remplacements »', () => {
    const r = delaisHorsNormandie("Un agent de remplacement intervient sur site en 72 h.", EXTRAIT_CSTB, true);
    expect(r.retires).toHaveLength(1);
    expect(r.texte).not.toMatch(/72 h|GSS organise/);
  });
  it('seuil de pénalité dont l’objet n’est pas reconnu : jamais « GSS organise ses remplacements »', () => {
    const dce = 'Site à Lyon (69003). Tout dépassement constaté de 48 heures entraîne une pénalité de 200 € HT.';
    const r = delaisHorsNormandie("Nous intervenons sur site en 48 heures.", dce, true);
    expect(r.retires).toHaveLength(1);
    expect(r.texte).not.toMatch(/GSS organise ses remplacements|48 heures/);
  });
  it('seuil d’absence d’agent : la phrase type reste celle de T5-COH-4', () => {
    const dce = 'Site à Lyon (69003). Absence d’un agent ou retard supérieur à 60 min : 300 € HT par manquement.';
    const r = delaisHorsNormandie("L'agent absent est remplacé en 60 minutes.", dce, true);
    expect(r.texte).toMatch(/Le marché pénalise toute absence ou tout retard d’agent de plus de 60 minutes ; GSS organise ses remplacements en conséquence\./);
  });
  it.skipIf(!aCorpus('cstb'))('DCE complet du cstb (551)', () => {
    const r = delaisHorsNormandie(PHRASE, DCE('cstb'), true);
    expect(r.texte).toBe(PHRASE);
    expect(r.retires).toEqual([]);
  });
});

describe('délai de présence imposé à côté d’une remise de document (T7N-4, non-régression)', () => {
  it('« Le rapport est remis à l’acheteur. L’agent intervient en 30 minutes. » : le délai d’intervention du DCE reste imposé', () => {
    const dce = 'Site à Lyon (69003). Le rapport d’intervention est remis à l’acheteur. En cas d’alarme, l’agent intervient sur site en 30 minutes.';
    const r = delaisHorsNormandie("En cas d'alarme, notre agent intervient sur site en 30 minutes.", dce, true);
    expect(r.retires).toEqual([]);
  });
});

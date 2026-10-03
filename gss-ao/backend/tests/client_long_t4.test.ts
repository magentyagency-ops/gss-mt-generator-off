import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { formesClient, preparerMemoireType, publierMemoire, sansFormeJuridiqueFinale, teteNominale } from '../src/generation/memoire_type';

import { DCE, aCorpus } from './fixtures/corpus';

/** Tour 4 (T4C-3, T4-COH-4) : jamais le nom long de l'acheteur, forme juridique ou service compris, à chaque mention. */
describe('nom de l\'acheteur : forme juridique, capitales et noms très longs (T4C-3, T4-COH-4)', () => {
  const IMM = 'ASSOCIATION NOUVEL INSTITUT MÉDICO-CHIRURGICAL MONTSOURIS (Nouvel IMM) – Association régie par la loi du 1er juillet 1901';
  it.skipIf(!aCorpus('imm'))('la forme juridique après le tiret est retirée ; « l\'IMM » après la première mention', () => {
    expect(sansFormeJuridiqueFinale(IMM)).toBe('ASSOCIATION NOUVEL INSTITUT MÉDICO-CHIRURGICAL MONTSOURIS (Nouvel IMM)');
    expect(sansFormeJuridiqueFinale('Ville du Havre - Direction de la commande publique')).toBe('Ville du Havre - Direction de la commande publique');
    expect(formesClient(IMM, DCE('imm')).court).toMatchObject({ article: "l'", nom: 'IMM' });
  });
  it.skipIf(!aCorpus('imm'))('publipostage imm : nom écrit comme dans le DCE, sans la loi de 1901, puis « l\'IMM »', () => {
    const prep: any = preparerMemoireType({ dce: DCE('imm'), analyse: { clientName: IMM } } as any);
    expect(prep.variables.CLIENT.valeur).toBe('Association Nouvel Institut Médico-Chirurgical Montsouris (Nouvel IMM)');
    const t = publierMemoire(prep).map((r: any) => r.texte || '').join('\n');
    expect(t).not.toMatch(/1901|MONTSOURIS/);
    expect(t).toMatch(/l'IMM/);
  });
  it('nom de plus de 8 mots sans sigle, ou tutelle longue avant un service : tête nominale après la première mention', () => {
    expect(teteNominale('Syndicat mixte de gestion des déchets ménagers et assimilés de la région elbeuvienne et du plateau du Neubourg')).toBe('Syndicat mixte');
    expect(formesClient('Syndicat mixte de gestion des déchets ménagers et assimilés de la région elbeuvienne et du plateau du Neubourg').court).toMatchObject({ article: 'le', nom: 'Syndicat mixte' });
    const ep = 'Établissement public de coopération culturelle et environnementale du Grand Paris Sud - Direction des moyens généraux et de la logistique';
    expect(formesClient(ep).court).toMatchObject({ article: "l'", nom: 'Établissement public' });
    const dce = `Pouvoir adjudicateur : ${ep}. Objet : surveillance du siège, 76000 Rouen. Le titulaire assure des rondes.`;
    const t = publierMemoire(preparerMemoireType({ dce, analyse: { clientName: ep } } as any)).map((r: any) => r.texte || '').join('\n');
    expect((t.match(/Direction des moyens généraux/g) || []).length).toBeLessThanOrEqual(1);
  });
});

import { nomClientCourtApresPremiere } from '../src/generation/memoire_generator';

describe('nom de l\'acheteur dans le texte rédigé (T4C-3)', () => {
  it('le nom brut de l\'analyse (forme juridique comprise) n\'est écrit qu\'une fois, en forme longue ; ensuite « l\'IMM »', () => {
    const brut = 'ASSOCIATION NOUVEL INSTITUT MÉDICO-CHIRURGICAL MONTSOURIS (Nouvel IMM) – Association régie par la loi du 1er juillet 1901';
    const long = 'Association Nouvel Institut Médico-Chirurgical Montsouris (Nouvel IMM)';
    const sections: Record<string, string> = {
      a: `L'équipe dédiée à l'${brut} Après avoir analysé le CCTP.`,
      b: `J-3 : envoi des plannings à l'${brut}. Rapport à l'${long}.`,
    };
    nomClientCourtApresPremiere(sections, { valeur: long, court: 'IMM', articleCourt: "l'", article: "l'" }, brut);
    expect(sections.a).toBe(`L'équipe dédiée à l'${long} Après avoir analysé le CCTP.`);
    expect(sections.b).toBe("J-3 : envoi des plannings à l'IMM. Rapport à l'IMM.");
  });
});

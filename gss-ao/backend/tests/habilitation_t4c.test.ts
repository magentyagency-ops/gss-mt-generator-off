/**
 * Tour 4, correcteur (T4G-5) : niveau d'habilitation électrique exigé par le CCTP lu tel qu'écrit, jamais ramené à H0B0 ; un
 * niveau que GSS ne déclare pas (BS-BE manœuvre, H0/BE manœuvre, H0B0V/BE, B1V, BR) n'est jamais écrit dans les diplômes de
 * l'équipe dédiée : une question est posée à GSS.
 */
import { describe, it, expect } from 'vitest';
import { qualificationsDuDce, preparerMemoireType, publierMemoire } from '../src/generation/memoire_type';

describe('habilitation électrique (T4G-5)', () => {
  it('niveau lu tel que le DCE l\'écrit', () => {
    expect(qualificationsDuDce('Les agents détiennent une habilitation électrique BS-BE manœuvre.')).toContain('habilitation électrique BS-BE manœuvre');
    expect(qualificationsDuDce('Habilitation électrique HO/BE Manœuvre')).toContain('habilitation électrique H0/BE manœuvre');
    expect(qualificationsDuDce('habilitation électrique H0B0V/BE')).toEqual(['habilitation électrique H0B0V/BE']);
    expect(qualificationsDuDce('habilitation électrique B1V')).toEqual(['habilitation électrique B1V']);
    // Niveau de GSS, ou aucun niveau écrit : inchangé.
    expect(qualificationsDuDce('habilitation électrique H0B0')).toEqual(['habilitation électrique H0B0']);
    expect(qualificationsDuDce('Les agents ont une habilitation électrique.')).toEqual(['habilitation électrique H0B0']);
  });
  it('niveau que GSS ne déclare pas : absent des diplômes de l\'équipe, question à GSS', () => {
    const dce = "\n\n--- CCTP ---\nCAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES\nArticle 1 - Objet\nSurveillance incendie du site, 12 rue Jeanne d'Arc, 76000 Rouen. Les agents SSIAP 1 détiennent une habilitation électrique BS-BE manœuvre.\n";
    const prep: any = preparerMemoireType({ analyse: { clientName: 'Ville de Rouen' }, dce } as any);
    expect(prep.variables.QUALIFICATIONS_REQUISES.valeur).toContain('habilitation électrique BS-BE manœuvre');
    expect(JSON.stringify(prep.variables.DIPLOMES_EQUIPE.valeur || [])).not.toMatch(/BS-BE|H0B0/);
    const pub = publierMemoire(prep);
    expect(pub.map((p: any) => p.texte || '').join('\n')).not.toMatch(/diplômes suivants : [^\n]*habilitation électrique (?:H0B0|BS)/);
    expect(pub.flatMap((p: any) => p.aConfirmer.map((x: any) => x.question)).join('\n')).toMatch(/habilitation électrique BS-BE manœuvre : vos agents la détiennent-ils/);
  });
});

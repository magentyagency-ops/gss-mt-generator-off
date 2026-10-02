// Génération réelle de contrôle ca_normandie 241 (suite de T2C-9) : nom « Ministère de la Justice – Service administratif
// régional de Rouen (SAR de Rouen), BOP Normand, pour les cours d'appel de Rouen et de Caen » écrit 8 fois en entier.
import { describe, it, expect } from 'vitest';
import { formesClient, formeCourteApresPremiere } from '../src/generation/memoire_type';

const dce = "Le responsable du SAR de Rouen pour la cour d'appel. Correspondance adressée au SAR de Rouen. Plateforme achats du SAR de Rouen (RPA).";
const nom = "Ministère de la Justice – Service administratif régional de Rouen (SAR de Rouen), BOP Normand, pour les cours d’appel de Rouen et de Caen";

describe('forme courte de l’acheteur par son sigle d’usage (ca_normandie 241)', () => {
  it('sigle entre parenthèses employé par le DCE : « le SAR de Rouen »', () => {
    const f = formesClient(nom, dce);
    expect(f.court).toEqual({ article: 'le', nom: 'SAR de Rouen', genre: '' });
    expect(f.pluriel).toBeUndefined();
  });
  it('forme longue à la première mention, forme courte ensuite, variantes du nom comprises', () => {
    const f = formesClient(nom, dce);
    const r = formeCourteApresPremiere([`Réponse au ${f.long}.`, `Présentation au ${nom} ; réunion avec le ${f.long}.`], f.long, f.court, 'le', [nom]);
    expect(r).toEqual([`Réponse au ${f.long}.`, 'Présentation au SAR de Rouen ; réunion avec le SAR de Rouen.']);
  });
  it('sigle absent du DCE : pas de forme courte inventée', () => {
    expect(formesClient(nom, 'Aucun sigle ici.').court?.nom).not.toBe('SAR de Rouen');
  });
});

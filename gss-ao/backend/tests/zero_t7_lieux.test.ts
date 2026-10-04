// Tour 7 (correcteur) : commune du site et horaires imposés (T7G-6, T7G-7, T7G-8).
import { describe, it, expect } from 'vitest';
import { communeLisible, communesParCodePostal, lieuDuMarche, horairesImposes } from '../src/generation/base_memoires';

const cp = (t: string) => communesParCodePostal(t).map((x) => x.commune);
describe('commune lue à côté du code postal (T7G-6)', () => {
  it('libellés de formulaire, mention Cedex', () => {
    expect(cp("Adresse : 12 rue Jeanne d'Arc\nCP : 76000 – Commune : ROUEN")).toEqual(['Rouen']);
    expect(cp("Adresse du site : 12 rue Jeanne d'Arc – CP 76000 – Ville ROUEN")).toEqual(['Rouen']);
    expect(cp("Site d'exécution | 12 rue Jeanne d'Arc | 76000 | Localité : Rouen")).toEqual(['Rouen']);
    expect(cp("Adresse : 12 rue Jeanne d'Arc, 76000 Commune de Rouen")).toEqual(['Rouen']);
    for (const [c, v] of [['LE HAVRE - CEDEX', 'Le Havre'], ['ROUEN - CEDEX 1', 'Rouen'], ['EVREUX-CEDEX', 'Évreux'], ['Rouen Cédex', 'Rouen'], ['Le Havre – Cedex', 'Le Havre']]) expect(communeLisible(c), c).toBe(v);
  });
  it('commune coupée après son article, jamais le mot avant le code', () => {
    expect(cp('Lot n°2 – Gardiennage des jardins suspendus – 65 rue du\nFort 76600 LE\nHAVRE')).toEqual(['Le Havre']);
    expect(cp('Gardiennage – 4 avenue des Canadiens 76120 LE\nGRAND-QUEVILLY')).toEqual(['Le Grand-Quevilly']);
  });
});

describe('commune de deux lettres et nom de voie (T7G-7)', () => {
  it('Eu lue par son code postal ou après « à », jamais Orléans d’une voie', () => {
    expect(cp('Site : Médiathèque, 2 rue de la Gare, 76260 EU')).toEqual(['Eu']);
    for (const t of ["Le présent marché porte sur le gardiennage du Château d'Eu, place Isabelle d'Orléans, 76260 EU.", "Le site est situé 12 rue Louis-Philippe d'Orléans à Eu."]) {
      const l = lieuDuMarche({ clientName: "Ville d'Eu" }, t);
      expect(l.statut, t).toBe('normandie');
      expect(l.horsNormandie).toEqual([]);
    }
    expect(lieuDuMarche({}, 'Le site est situé rue Isabelle d’Orléans au Tréport.').horsNormandie).toEqual([]);
  });
});

describe('durée « N h » jamais un horaire imposé (T7G-8)', () => {
  const cctp = (ph: string) => `\n\n--- CCTP ---\nCAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES\nARTICLE 3 – HORAIRES\n${ph}\n`;
  it('durées, pauses, chevauchements, amplitudes', () => {
    for (const ph of ["Les vacations seront d'une durée minimale de 4 h.", 'Chaque vacation a une durée de 12 h, pause comprise.', "Un temps de pause de 1 h est accordé à l'agent de poste.",
      'La relève entre deux agents donne lieu à un chevauchement de 0 h 15.']) expect(horairesImposes(cctp(ph)), ph).toEqual([]);
    expect(horairesImposes(cctp('Le poste de sécurité fonctionne avec un agent présent du lundi au vendredi de 8 h à 18 h.'))).toHaveLength(1);
    // T8-REG-2 : une présence continue d'un service (« surveillé 24 h sur 24 h par un agent ») est un horaire imposé, pas une durée.
    expect(horairesImposes(cctp('Le site est surveillé 24 h sur 24 h par un agent de poste.'))).toHaveLength(1);
  });
});

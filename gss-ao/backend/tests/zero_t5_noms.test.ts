/**
 * Tour 5, correcteur : nom de l'acheteur écrit seulement en capitales (T5-COH-2), sigle d'après ses adresses électroniques
 * (T5G-4), accord du pluriel féminin (T5-COH-4) et du nom qui garde son article (T5G-9).
 */
import { describe, it, expect } from 'vitest';
import { preparerMemoireType, publierMemoire, chargerMemoireType, casseDuDce } from '../src/generation/memoire_type';

const client = (nom: string, corps = '') => {
  const dce = `\n\n--- RC.pdf ---\nREGLEMENT DE LA CONSULTATION\n${nom}\nObjet : gardiennage des bâtiments.\n${corps}\n`;
  const prep: any = preparerMemoireType({ analyse: { clientName: nom }, dce, referents: '' } as any, { memoireType: chargerMemoireType() } as any);
  return { v: prep.variables.CLIENT, t: publierMemoire(prep).map((r: any) => r.texte).join('\n') };
};

describe('nom d\'institution écrit seulement en capitales (T5-COH-2)', () => {
  const cas: Array<[string, string, string]> = [
    ['VILLE DU HAVRE', 'Ville du Havre', 'la'],
    ['CENTRE HOSPITALIER DU HAVRE', 'Centre hospitalier du Havre', 'le'],
    ['LYCÉE PIERRE CORNEILLE', 'Lycée Pierre Corneille', 'le'],
    ['CENTRE HOSPITALIER JEAN MARTIN CHARCOT', 'Centre hospitalier Jean Martin Charcot', 'le'],
    ['UNIVERSITÉ PIERRE ET MARIE CURIE', 'Université Pierre et Marie Curie', "l'"],
    ['LYCÉE JACQUES PRÉVERT', 'Lycée Jacques Prévert', 'le'],
    ["LYCÉE JEANNE D'ARC", "Lycée Jeanne d'Arc", 'le'],
    ['MAISON DE RETRAITE LES ROSES', 'Maison de retraite Les Roses', 'la'],
    ["MUSÉE D'ART MODERNE ANDRÉ MALRAUX DU HAVRE", "Musée d'art moderne André Malraux du Havre", 'le'],
    ['COMMUNAUTÉ URBAINE LE HAVRE SEINE MÉTROPOLE', 'Communauté urbaine Le Havre Seine Métropole', 'la'],
    ['OFFICE DE TOURISME ROUEN VALLÉE DE SEINE', 'Office de tourisme Rouen Vallée de Seine', "l'"],
    ["ÉTABLISSEMENT PUBLIC DE SANTÉ MENTALE DE L'AGGLOMÉRATION LILLOISE", "Établissement public de santé mentale de l'agglomération lilloise", "l'"],
    ['SYNDICAT DES EAUX DU BASSIN RENNAIS', 'Syndicat des eaux du bassin rennais', 'le'],
    ['MÉTROPOLE DU GRAND NANCY', 'Métropole du Grand Nancy', 'la'],
    ['GROUPE HOSPITALIER DU HAVRE', 'Groupe hospitalier du Havre', 'le'],
    ['FOYER DE JEUNES TRAVAILLEURS DE ROUEN', 'Foyer de jeunes travailleurs de Rouen', 'le'],
  ];
  for (const [nom, forme, article] of cas) {
    it(`${nom} → ${forme}`, () => {
      const { v } = client(nom);
      expect(v.valeur).toBe(forme);
      expect(v.article).toBe(article);
    });
  }
  it('« Grand » devant un lieu, même quand le DCE écrit ailleurs « grand » en minuscules', () => {
    const { v } = client('COMMUNAUTÉ URBAINE DU GRAND REIMS', 'Le Grand Reims gère un grand nombre de bâtiments, dont un grand gymnase.');
    expect(v.valeur).toBe('Communauté urbaine du Grand Reims');
  });
  it('mot du dictionnaire en place de nom propre, sans appui du DCE : graphie soumise à GSS', () => {
    const { v } = client('MAIRIE DU TRAIT');
    expect(v.aConfirmer).toMatch(/« MAIRIE DU TRAIT ».*« Mairie du trait ».*« trait »/);
    expect(client('VILLE DU HAVRE').v.aConfirmer).toBeFalsy();
    expect(client('LYCÉE PIERRE CORNEILLE').v.aConfirmer).toBeFalsy();
  });
  it('intitulé : « grand » devant un lieu, jamais d\'article pris pour un nom propre', () => {
    expect(casseDuDce('SURVEILLANCE DES BATIMENTS DU GRAND REIMS', 'Les bâtiments du Grand Reims sont gardés.', true)).toBe('Surveillance des bâtiments du Grand Reims');
  });
});

describe('sigle ou marque et adresses électroniques (T5G-4)', () => {
  for (const [nom, corps] of [['NEOMA', 'NEOMA lance une consultation. Contact : surete@neoma-bs.fr – www.neoma-bs.fr'], ['CNRS', 'Le CNRS lance une consultation. Contact : achats@cnrs.fr'], ['RATP', 'La RATP lance une consultation. Renseignements : marches@ratp.fr'], ['INSA', "L'INSA lance une consultation sur son campus. Renseignements : marches@insa.fr"]]) {
    it(`${nom} reste ${nom}`, () => {
      const { v, t } = client(nom, corps);
      expect(v.valeur).toBe(nom);
      expect(t).not.toMatch(new RegExp(`${nom.charAt(0)}${nom.slice(1).toLowerCase()}(?![a-zé])`));
    });
  }
});

describe('accord de l\'acheteur au pluriel féminin ou avec son propre article (T5-COH-4, T5G-9)', () => {
  it('« les Archives départementales … peuvent, si elles le souhaitent »', () => {
    const { t } = client('Archives départementales de la Seine-Maritime', 'Les Archives départementales de la Seine-Maritime confient au titulaire la surveillance du bâtiment.');
    expect(t).toMatch(/Archives départementales de la Seine-Maritime peuvent, si elles le souhaitent/);
    expect(t).not.toMatch(/s'ils le souhaitent/);
  });
  it('« les Hospices civils de Lyon … s\'ils le souhaitent »', () => {
    const { t } = client('Hospices civils de Lyon', 'Les Hospices civils de Lyon confient au titulaire la surveillance.');
    expect(t).toMatch(/Hospices civils de Lyon peuvent, s'ils le souhaitent/);
  });
  it('« La Poste peut, si elle », « Les Docks Vauban peuvent, s\'ils »', () => {
    expect(client('La Poste', 'La Poste confie au titulaire la surveillance.').t).toMatch(/La Poste peut, si elle le souhaite/);
    const d = client('Les Docks Vauban', 'Les Docks Vauban confient au titulaire la surveillance.').t;
    expect(d).toMatch(/Les Docks Vauban peuvent, s'ils le souhaitent/);
    expect(d).not.toMatch(/Les Docks Vauban (?:y )?dispose /);
    expect(client('La Halle aux Toiles', 'La Halle aux Toiles confie au titulaire la surveillance.').t).toMatch(/La Halle aux Toiles peut, si elle le souhaite/);
  });
});

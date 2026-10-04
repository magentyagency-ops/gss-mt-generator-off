/**
 * Tour 6, correcteur : lieu du marché (site exclu du marché, commune du nom de l'acheteur), indicateur des vacations de nuit
 * et article d'un acheteur au pluriel.
 */
import { describe, it, expect } from 'vitest';
import { lieuDuMarche, masquerAcheteur } from '../src/generation/base_memoires';
import { preparerMemoireType, chargerMemoireType, publierMemoire, evaluerIndicateurs } from '../src/generation/memoire_type';

const mt = chargerMemoireType();
const prep = (client: string, corps: string, sites: any[] = []) => preparerMemoireType({ analyse: { clientName: client, sites }, dce: `\n\n--- CCTP ---\nCAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES\nARTICLE 1 – OBJET\n${corps}\n`, referents: '' } as any, { memoireType: mt } as any) as any;

describe('site expressément exclu du marché (T6-COH-2)', () => {
  it.each([
    "Le site de Lyon n'est pas concerné par le présent marché.",
    "Le site de Lyon fait l'objet d'un marché distinct.",
    "L'établissement dispose d'un second site à Lyon, hors du présent marché.",
    'Le site de Lyon est exclu du périmètre du présent marché.',
    "Seul le site de Rouen est concerné ; le site de Lyon relève d'un autre marché.",
    "Les autres sites de l'établissement (Lyon, Marseille) sont exclus du marché.",
    "Le titulaire indique l'adresse de son agence, par exemple à Paris ou à Lille.",
    'Le bâtiment a été construit en 1975 sur le modèle de celui de Lyon.',
  ])('%s', (ph) => {
    const dce = `\n\n--- CCTP ---\nSurveillance du site, 1 rue d'Amiens, 76000 Rouen.\n${ph}\n`;
    const l = lieuDuMarche({}, dce);
    expect(l.statut).toBe('normandie');
    expect(l.horsNormandie).toEqual([]);
  });
  it('un vrai second site reste un site (T5-COH-3)', () => {
    expect(lieuDuMarche({}, "\n\n--- CCTP ---\nSurveillance du site, 1 rue d'Amiens, 76000 Rouen. Un second site est situé à Lyon.\n").statut).toBe('mixte');
  });
});

describe('commune du nom de l\'acheteur jamais prise pour celle du site (T6G-7)', () => {
  it.each([
    ['Métropole Rouen Normandie', 'La Métropole Rouen Normandie confie au titulaire le gardiennage de son centre technique situé à Louviers.', ['Louviers'], []],
    ['ESID de Rennes', "L'Établissement du service d'infrastructure de la défense (ESID) de Rennes confie au titulaire le gardiennage de la base aérienne 105 située à Évreux.", ['Évreux'], []],
    ['Université de Lille', "L'Université de Lille confie au titulaire le gardiennage de son antenne située à Dieppe.", ['Dieppe'], []],
    ['CHU de Rouen', "Le CHU de Rouen confie au titulaire le gardiennage de l'hôpital situé à Oissel.", ['Oissel'], []],
    ['Ville du Havre', 'La Ville du Havre confie au titulaire le gardiennage de son centre de loisirs situé à Saint-Romain-de-Colbosc.', ['Saint-Romain-de-Colbosc'], []],
    ['Ville de Rouen', "La Ville de Rouen confie au titulaire le gardiennage de l'Hôtel de Ville.", ['Rouen'], []],
  ])('%s', (client, ph, normands, hors) => {
    const p = prep(client, ph);
    expect(p.variables.VILLE.valeur).toEqual(normands);
    const l = lieuDuMarche({ clientName: client }, `\n\n--- CCTP ---\n${ph}\n`);
    expect(l.statut).toBe('normandie');
    expect(l.normands).toEqual(normands);
    expect(l.horsNormandie).toEqual(hors);
  });
  it('le masque garde les positions', () => {
    const t = "L'Université de Lille confie le site.";
    expect(masquerAcheteur(t, { clientName: 'Université de Lille' }).length).toBe(t.length);
    expect(masquerAcheteur(t, { clientName: 'Université de Lille' })).not.toContain('Lille');
  });
});

describe('vacations de nuit : seule la mention du passage de fermeture est ignorée (T6-COH-3)', () => {
  const nuit = (ph: string) => (evaluerIndicateurs(mt, { dce: `\n\n--- CCTP.pdf ---\nCAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES\nLe titulaire assure l'accueil du public du lundi au vendredi de 8h00 à 18h00, 1 place de l'Hôtel de Ville, 76000 Rouen.\n${ph}\n`, analyse: {} } as any) as any).VACATIONS_NUIT.valeur;
  it.each([
    'Le bâtiment étant fermé la nuit, un agent assure une ronde de nuit de 22h à 6h.',
    "Le musée est fermé la nuit et placé sous la surveillance d'un agent de nuit.",
    "La nuit, le bâtiment est fermé et un agent assure le gardiennage jusqu'à 6h.",
  ])('%s', (ph) => expect(nuit(ph)).toBe(true));
  it.each([
    'Le bâtiment est fermé la nuit, les week-ends et les jours fériés.',
    'La nuit, le bâtiment est placé sous alarme.',
    "La nuit, le bâtiment est fermé et aucun agent n'est présent.",
  ])('%s', (ph) => expect(nuit(ph)).toBe(false));
});

describe('acheteur au pluriel sans article dans le DCE (T6-COH-4)', () => {
  it.each([
    ['ARCHIVES NATIONALES', 'Archives nationales', 'si elles'],
    ['Archives départementales de la Seine-Maritime', 'Archives départementales de la Seine-Maritime', 'si elles'],
    ['Hospices civils de Lyon', 'Hospices civils de Lyon', "s'ils"],
  ])('%s', (brut, nom, pronom) => {
    const p = preparerMemoireType({ analyse: { clientName: brut }, dce: `\n\n--- RC.pdf ---\nREGLEMENT DE LA CONSULTATION\n${brut}\nObjet : gardiennage.\n`, referents: '' } as any, { memoireType: mt } as any) as any;
    expect(p.variables.CLIENT.valeur).toBe(nom);
    expect(p.variables.CLIENT.article).toBe('les');
    const t = publierMemoire(p).map((r: any) => r.texte).join('\n');
    expect(t).not.toMatch(new RegExp(`l['’]${nom}|à ${nom}|et ${nom}`));
    expect(t).toContain(`les ${nom} peuvent, ${pronom}`);
  });
});

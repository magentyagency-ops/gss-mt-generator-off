/**
 * Tour 5, correcteur : commune lue sur la ligne qui suit un code postal (T5-REG-1, T5-REG-2), mémoire d'un seul lot
 * (T5-REG-3 : mentions plurielles au milieu d'une phrase ; T5G-5 : lots en chiffres romains ; T5G-6 : CCTP sans titres
 * « Article n »), question des lots sans ponctuation double (T5N-15).
 */
import { describe, it, expect } from 'vitest';
import { communesParCodePostal, perimetreDuLot, horairesImposes, obligationsChiffrees, numeroDeLot, lotsDuMemoireDce } from '../src/generation/base_memoires';

const c = (t: string) => communesParCodePostal(t).map((x) => x.commune);

describe('commune sur la ligne qui suit le code postal (T5-REG-1)', () => {
  it('jamais un titre ni un début de phrase', () => {
    expect(c("Adresse : 12 rue Jeanne d'Arc, 76000\nObjet du marché")).toEqual([]);
    expect(c('Siège : 76000\nLe titulaire assure')).toEqual([]);
    expect(c("1 place de l'Hôtel de Ville 76000\nREGLEMENT DE LA CONSULTATION")).toEqual([]);
    expect(c('Ville de Rouen – 2 place du Général de Gaulle – 76000\nPouvoir adjudicateur')).toEqual([]);
    expect(c('parc des expositions, situé avenue Maréchal Joffre, 76210\nDescription des lieux')).toEqual([]);
  });
  it('une commune connue ou un nom propre reste lu', () => {
    expect(c('situé 3 rue du Château Gaillard, 27700\nLes Andelys')).toEqual(['Les Andelys']);
    expect(c("place de l'Hôtel de Ville, 76000\nROUEN")).toEqual(['Rouen']);
    expect(c('12 rue de la Marne 76210\nBolbec')).toEqual(['Bolbec']);
  });
});

describe('commune jamais recollée à un début de phrase (T5-REG-2)', () => {
  it('« du lundi », « sur demande », « en cas » restent hors de la commune', () => {
    expect(c("Site : 12 rue Jeanne d'Arc 76000 Rouen\ndu lundi au vendredi")).toEqual(['Rouen']);
    expect(c('Lieu : 1 rue de la Gare 76600 Le Havre\nsur demande du client')).toEqual(['Le Havre']);
    expect(c('Adresse : 2 rue X 27000 Évreux\nen cas d’absence')).toEqual(['Évreux']);
  });
  it('nom composé coupé : le nom entier de la ligne suivante', () => {
    expect(c('Adresse : 3 rue Verte 76800 Saint\nÉtienne-du-Rouvray')).toEqual(['Saint-Étienne-du-Rouvray']);
    expect(c("24 rue Joseph Fourier 38400 Saint Martin\nd'Hères.")).toEqual(["Saint-Martin-d'Hères"]);
    expect(c('1 rue Thomas Becket, 76821 Mont Saint\nAignan Cedex')).toEqual(['Mont-Saint-Aignan']);
  });
});

describe('mémoire d\'un seul lot : mention plurielle au milieu d\'une phrase (T5-REG-3)', () => {
  const lot = (dce: string, lots: any[]) => { const r: any = perimetreDuLot({ lots }, dce); return { h: horairesImposes(r.dce), o: obligationsChiffrees(r.dce).map((x: any) => x.phrase), dce: r.dce as string }; };
  it('« Comme pour chaque lot » dans le passage du lot 2 ne rend pas la suite commune', () => {
    const r = lot("\n\n--- CCTP Lot 1 - Gardiennage.pdf ---\nARTICLE 1 - OBJET\nLe marché comporte deux lots.\nLOT 1 : Gardiennage du centre administratif\nLes agents assurent une présence de 8h à 18h.\nLe délai d'intervention est de 30 minutes.\nLOT 2 : Surveillance du parking Saint-Marc\nComme pour chaque lot, le titulaire tient une main courante.\nLe parking est surveillé par 3 agents de 20h à 6h.\nLe délai d'intervention sur alarme est de 15 minutes.\n",
      [{ num: '1', perimetre: 'Gardiennage' }, { num: '2', perimetre: 'Parking' }]);
    expect(r.dce).not.toContain('20h à 6h');
    expect(r.dce).not.toContain('15 minutes');
    expect(r.dce).not.toMatch(/^pour chaque lot/m);
    expect(r.o).toEqual(["Le délai d'intervention est de 30 minutes."]);
  });
  it('« propres aux lots 2 et 3 » dans le passage du lot 1 ne fait pas changer de lot', () => {
    const r = lot("\n\n--- Cadre de réponse Lot 1.docx ---\nCadre\n\n--- CCTP.pdf ---\nARTICLE 1 - OBJET\nLOT 1 : Gardiennage de l'hôtel de ville\nLes dispositions propres aux lots 2 et 3 figurent à l'annexe 4.\nLes agents assurent une présence de 7h à 21h.\nLe délai de remplacement d'un agent absent est de 1 heure.\nLOT 2 : Rondes\nLes rondes sont effectuées de nuit.\nLOT 3 : Événementiel\nLes agents sont mobilisés sur bon de commande.\n",
      [{ num: '1', perimetre: 'Gardiennage' }, { num: '2', perimetre: 'Rondes' }, { num: '3', perimetre: 'Événementiel' }]);
    expect(r.dce).toContain("Les dispositions propres aux lots 2 et 3 figurent à l'annexe 4.");
    expect(r.h.join(' ')).toContain('7h à 21h');
    expect(r.o).toEqual(["Le délai de remplacement d'un agent absent est de 1 heure."]);
    expect(r.dce).not.toContain('bon de commande');
  });
  it('une mention plurielle en tête de phrase vaut pour sa phrase seulement', () => {
    const r = lot("\n\n--- Cadre Lot 1 ---\nCadre\n\n--- CCTP ---\nARTICLE 1\nLOT 1 : Gardiennage\nPour les lots 2 et 3, une ronde de nuit est réalisée. Les agents du lot 1 sont présents de 7h à 19h.\nLOT 2 : Rondes\nRondes de nuit.\n",
      [{ num: '1' }, { num: '2' }, { num: '3' }]);
    expect(r.dce).not.toContain('ronde de nuit est réalisée');
    expect(r.dce).toContain('Les agents du lot 1 sont présents de 7h à 19h.');
  });
});

describe('lots en chiffres romains (T5G-5)', () => {
  it('« I », « V », « X » sont des chiffres romains, sauf lots en lettres', () => {
    expect(['I', 'II', 'IV', 'V', 'X'].map((x) => numeroDeLot(x))).toEqual(['1', '2', '4', '5', '10']);
    expect(numeroDeLot('V', true)).toBe('V');
    expect(numeroDeLot('B')).toBe('B');
  });
  it('mémoire du lot 1 d\'un DCE en « Lot I / Lot II » : son propre périmètre est gardé', () => {
    const dce = "\n\n--- Cadre de réponse technique lot 1 ---\nCADRE\n\n--- CCTP ---\nARTICLE 2 – ALLOTISSEMENT\nLot I : gardiennage de la Médiathèque, 76000 Rouen. Un agent est présent du lundi au samedi de 9h00 à 19h00.\nLot II : sécurité incendie du Théâtre, 27000 Évreux. Deux agents SSIAP 1 sont présents de 18h00 à 23h00.\nARTICLE 3 – DÉLAIS\nEn cas d'absence d'un agent, le titulaire assure son remplacement dans un délai d'une heure.\n";
    for (const lots of [['Lot I', 'Lot II'], ['Lot 1', 'Lot 2'], ['I', 'II']]) {
      const an = { lots: lots.map((num) => ({ num })) };
      expect(lotsDuMemoireDce(an, dce).lots).toEqual(['1']);
      const p = perimetreDuLot(an, dce)!;
      expect(p.dce).toContain('Médiathèque');
      expect(p.dce).not.toContain('Théâtre');
      expect(p.dce).toContain("délai d'une heure");
    }
  });
});

describe('CCTP à plusieurs lots sans titres « Article n » (T5G-6)', () => {
  const variantes: Record<string, string> = {
    capitales: "ALLOTISSEMENT\nLot 1 : gardiennage de la Médiathèque, 76000 Rouen.\nLot 2 : sécurité incendie du Théâtre, 27000 Évreux.\nDÉLAIS D'INTERVENTION\nEn cas d'absence d'un agent, le titulaire assure son remplacement dans un délai d'une heure.\nCONTRÔLES\nLe titulaire réalise au moins quatre contrôles inopinés par mois.",
    casse: "Allotissement\nLot 1 : gardiennage de la Médiathèque, 76000 Rouen.\nLot 2 : sécurité incendie du Théâtre, 27000 Évreux.\n\nDélais d'intervention\nEn cas d'absence d'un agent, le titulaire assure son remplacement dans un délai d'une heure.\n\nContrôles\nLe titulaire réalise au moins quatre contrôles inopinés par mois.",
    romains: "I. ALLOTISSEMENT\nLot 1 : gardiennage de la Médiathèque, 76000 Rouen.\nLot 2 : sécurité incendie du Théâtre, 27000 Évreux.\nII. DÉLAIS D'INTERVENTION\nEn cas d'absence d'un agent, le titulaire assure son remplacement dans un délai d'une heure.\nIII. CONTRÔLES\nLe titulaire réalise au moins quatre contrôles inopinés par mois.",
    lettres: "A. Allotissement\nLot 1 : gardiennage de la Médiathèque, 76000 Rouen.\nLot 2 : sécurité incendie du Théâtre, 27000 Évreux.\nB. Délais d'intervention\nEn cas d'absence d'un agent, le titulaire assure son remplacement dans un délai d'une heure.\nC. Contrôles\nLe titulaire réalise au moins quatre contrôles inopinés par mois.",
    markdown: "**Allotissement**\nLot 1 : gardiennage de la Médiathèque, 76000 Rouen.\nLot 2 : sécurité incendie du Théâtre, 27000 Évreux.\n**Délais d'intervention**\nEn cas d'absence d'un agent, le titulaire assure son remplacement dans un délai d'une heure.\n**Contrôles**\nLe titulaire réalise au moins quatre contrôles inopinés par mois.",
  };
  for (const [nom, corps] of Object.entries(variantes)) {
    it(`titres ${nom} : le délai et les contrôles communs restent au lot 1`, () => {
      const dce = `\n\n--- Cadre de réponse lot 1 ---\nCADRE\n\n--- CCTP ---\nCAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES\n${corps}\n`;
      const p = perimetreDuLot({ lots: [{ num: '1' }, { num: '2' }] }, dce)!;
      expect(p.dce).toContain("délai d'une heure");
      expect(p.dce).toContain('quatre contrôles');
      expect(p.dce).not.toContain('Théâtre');
    });
  }
});

describe('question des lots (T5N-15)', () => {
  it('périmètre sans son point final devant « ; » et « ) »', () => {
    const q = lotsDuMemoireDce({ lots: [{ num: '1', perimetre: 'Hub Expo & congrès et Le Moulin, à Louviers.' }, { num: '2', perimetre: 'Carré Saint Cyr, au Vaudreuil.' }] }, '').question!;
    expect(q).toContain('(1 : Hub Expo & congrès et Le Moulin, à Louviers ; 2 : Carré Saint Cyr, au Vaudreuil)');
  });
});

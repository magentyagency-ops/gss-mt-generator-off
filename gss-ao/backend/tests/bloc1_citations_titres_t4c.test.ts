/**
 * Tour 4, correcteur (T4-COH-2, T4-COH-3, T4-COH-7, T4N-1) : bloc 1 resserré en 2 pages sans perdre l'exigence de ses
 * citations ; libellés EXIGENCE en groupe nominal sur les phrases réelles du CCTP d'IGN ; colonne NOTRE RÉPONSE remplie quand
 * une rubrique traite nettement l'exigence ; schéma de secours du bloc 1 construit sans les cartes fautives.
 */
import { describe, it, expect } from 'vitest';
import { abregerCitationAttente, resserrerBesoin, titreExigence, MAX_LIBELLE_EXIGENCE, renvoisManquantsBloc1, specSecoursBesoin, specSansEtapesFautives, anomaliesSchemaBloc1, etapesDuPerimetre } from '../src/generation/reponse_libre_v2';
import { preparerMemoireType } from '../src/generation/memoire_type';

const IGN = [
  "En cas d’absence imprévue et imprévisible d’un agent, quels que soit son niveau de qualification et son poste, constatée le jour même de sa prise de poste, son remplaçant devra être présent sur site dans les deux (2) heures suivant l’heure normale de la prise de poste de l’agent absent.",
  "Les modifications de plannings sont transmis au SAIMG dès qu’elles sont connues par le titulaire et au plus tard 4 jours ouvrés avant leur prise d’effet.",
  "Le titulaire dispose d’un délai de 2 heures à compter de la survenance de l’évènement ou de la demande (même verbale) du SAIMG pour faire intervenir les agents sur le site.",
  "Si les connaissances s’avèrent insuffisantes, le titulaire met en place un plan d’action sous 15 jours pour y remédier.",
];

describe('citations des attentes abrégées sans perdre l\'exigence (T4-COH-2)', () => {
  it('la proposition qui porte l\'obligation, avec sa valeur et son unité', () => {
    const a = IGN.map((q) => abregerCitationAttente(q, 110));
    expect(a[0]).toBe('[…] son remplaçant devra être présent sur site dans les deux (2) heures […]');
    expect(a[1]).toBe('[…] au plus tard 4 jours ouvrés avant leur prise d’effet');
    expect(a[2]).toBe('Le titulaire dispose d’un délai de 2 heures […] pour faire intervenir les agents sur le site');
    expect(a[3]).toBe('[…] le titulaire met en place un plan d’action sous 15 jours pour y remédier');
    for (const x of a) expect(x!.length).toBeLessThanOrEqual(110);
  });
  it('resserrement du bloc 1 (forme de secours et forme du modèle) : jamais « sous 15 […] »', () => {
    for (const forme of ['secours', 'modele']) {
      const puces = IGN.map((q) => (forme === 'secours' ? `- « ${q} »` : `- **« ${q} »** → notre réponse : « Le remplacement d'un agent absent : absence non prévue », développée au bloc 5.`));
      const r = resserrerBesoin(`## Votre contexte et votre site\n\nTexte.\n\n## Vos attentes et nos engagements\n\n${puces.join('\n')}\n`);
      expect(r).not.toMatch(/\d\s*\[…\]|\(\d\)\s*\[…\]|de la \[…\]/);
      expect(r).toContain('dans les deux (2) heures');
      expect(r).toContain('sous 15 jours');
    }
  });
});

describe('libellés EXIGENCE (T4-COH-3)', () => {
  it('phrases réelles d\'IGN : groupe nominal, jamais une incise, une préposition ou un verbe en tête', () => {
    expect(titreExigence(IGN[0], MAX_LIBELLE_EXIGENCE)).toBe('Remplaçant présent sous 2 heures');
    expect(titreExigence(IGN[2], MAX_LIBELLE_EXIGENCE)).toBe('Faire intervenir les agents en 2 heures');
    expect(titreExigence(IGN[3], MAX_LIBELLE_EXIGENCE)).toBe('Plan d’action sous 15 jours');
    expect(titreExigence('Les agents ne doivent en aucun cas quitter leur poste sans être relevés.', MAX_LIBELLE_EXIGENCE)).toMatch(/^Ne jamais quitter leur poste/);
    // Citation abrégée : même libellé, sans « […] ».
    expect(titreExigence('[…] son remplaçant devra être présent sur site dans les deux (2) heures […]', MAX_LIBELLE_EXIGENCE)).toBe('Remplaçant présent sous 2 heures');
  });
});

describe('colonne NOTRE RÉPONSE du texte de secours (T4-COH-2)', () => {
  it('rubrique qui traite nettement l\'exigence citée ; aucune rubrique sur un seul mot générique', () => {
    const prep = preparerMemoireType({ analyse: { clientName: "l'IGN" }, dce: 'Champs-sur-Marne (77420). Rondes, PCS, SSIAP.' } as any);
    const t = `## Vos attentes et nos engagements\n\n${IGN.map((q) => `- « ${q} »`).join('\n')}`;
    const r = renvoisManquantsBloc1(t, prep.plan).texte.split('\n');
    expect(r[2]).toMatch(/→ notre réponse : « Le remplacement d'un agent absent : absence non prévue », développée au bloc 5\.$/);
    expect(r[3]).toMatch(/→ notre réponse : « La planification », développée au bloc 4\.$/);
    // « le titulaire » n'est jamais un mot-clé distinctif.
    expect(r[5]).not.toMatch(/→/);
  });
});

describe('schéma de secours du bloc 1 sans cartes fautives (T4-COH-7, T4N-1)', () => {
  it('carte « Rondes » dont le texte redisait le titre : la suite seulement', () => {
    const e = etapesDuPerimetre('- Rondes : oui, rondes intérieures/extérieures, techniques et de sûreté, jour et nuit selon consignes ; pointage et rapports requis.');
    expect(e[0].titre).toBe('Rondes');
    expect(e[0].texte).toMatch(/^Intérieures\/extérieures, techniques et de sûreté/);
  });
  it('carte fautive retirée, le schéma reste (deux cartes au moins avant le résultat)', () => {
    const spec = specSansEtapesFautives([
      { titre: 'PC sécurité', texte: '24h / 24h, 7 jours sur 7', role: 'rouge' },
      { titre: 'Le CCTP confie les rondes', texte: 'La planification structure les affectations et les relèves', role: 'rouge' },
      { titre: "L'agent SSIAP 1", texte: 'Le CCTP exige, pour le personnel affecté aux prestations incendie', role: 'bleu' },
      { titre: "Poste d'accueil", texte: 'Entre 20h et 7h tous les soirs', role: 'bleu' },
      { titre: 'Votre résultat', texte: 'Continuité de service et traçabilité de chaque intervention', role: 'vert' },
    ]);
    expect(spec).not.toBeNull();
    expect(anomaliesSchemaBloc1(spec)).toEqual([]);
    const titres = spec!.params.etapes.map((e: any) => e.titre);
    expect(titres).toEqual(['PC sécurité', "Poste d'accueil", 'Votre résultat']);
  });
  it('texte de secours d\'IGN (périmètre en puces) : un schéma de process', () => {
    const t = "## Le périmètre de la prestation demandée\n\n- Postes fixes : oui, aux PCS de Carnot-Cassini et de Coriolis. Carnot-Cassini : SSIAP 2, 7j/7 de 7h à 19h puis de 19h à 7h.\n- Rondes : oui, rondes intérieures/extérieures, techniques et de sûreté, jour et nuit selon consignes ; pointage et rapports requis.\n\n## Les points de vigilance identifiés et nos réponses\n\n- **Assurer le gardiennage et la surveillance** du site 7 j/7 et 24 h/24, dimanches et jours fériés compris → notre réponse : « L'adéquation de nos moyens humains avec votre besoin », développée au bloc 3.\n\nNous assurons la continuité de service et la traçabilité de chaque intervention.";
    const s = specSecoursBesoin(t);
    expect(s).not.toBeNull();
    expect(anomaliesSchemaBloc1(s)).toEqual([]);
  });
});

// Génération réelle becquerel 1401 (T4N-1) : bloc 1 sans schéma de process, la carte « nous » tirée d'une autre rubrique de GSS
// (« Nous privilégions la stabilité sur les sites fixes ») étant refusée par le contrôle du schéma.
import fs from 'fs';
import path from 'path';
import { dessinerProcessSecoursBloc1 } from '../src/generation/memoire_generator';
import { phraseDeRubriqueGss } from '../src/generation/reponse_libre_v2';
import { chargerMemoireType } from '../src/generation/memoire_type';
describe('schéma de process du bloc 1 de becquerel 1401 (T4N-1)', () => {
  const t = fs.readFileSync(path.join(__dirname, 'fixtures', 'bloc1_becquerel_1401.md'), 'utf-8');
  const phraseDe = (x: string) => phraseDeRubriqueGss(chargerMemoireType(), x);
  it('spécification sans carte fautive (« Le CCTP confie les rondes », « Le CCTP exige, pour le personnel… »)', () => {
    const s = specSecoursBesoin(t, phraseDe);
    expect(s).not.toBeNull();
    expect(anomaliesSchemaBloc1(s)).toEqual([]);
    expect(JSON.stringify(s)).not.toMatch(/Le CCTP confie|Le CCTP exige,/);
  });
  it('page de schéma dessinée (phrase de GSS de la carte « nous » admise comme source)', async () => {
    const svg = await dessinerProcessSecoursBloc1(t, 'b1_comprehension', 'Notre réponse à votre besoin, en un process', undefined, phraseDe);
    expect(svg).toMatch(/^<svg/);
  }, 60_000);
});

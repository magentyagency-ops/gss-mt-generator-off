// Tour 6 (T6C-6, T6C-7, T6N-5) : bloc 1 de caen 475 et de cstb 551 — schéma de secours, paragraphe des étapes, texte de secours.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { etapesDesPuces, specSecoursBesoin, retirerParagrapheEtapes, horairesLisibles, completerBesoinMinimum, texteSecoursBesoin } from '../src/generation/reponse_libre_v2';

const B1 = fs.readFileSync(path.join(__dirname, 'fixtures/bloc1_caen475.md'), 'utf-8');
const ETAPES = [
  { texte: 'Le site CAEN a des horaires d’ouverture de 07h00 à 19h00.' }, { texte: 'Les agents accèdent aux zones privées et sensibles avec clés et badges.' },
  { texte: 'Les agents réalisent les rondes et interviennent sur alarme.' }, { texte: 'Les rapports d’intervention sont déposés sous 2 jours ouvrés.' },
  { texte: 'L’ACOSS dispose d’une continuité des prestations et d’une traçabilité quotidienne.' },
];

describe('Schéma de secours du bloc 1 (caen 475, T6C-6)', () => {
  it('titres avec la valeur du DCE, jamais coupés ; texte jamais fait d\'un titre de rubrique', () => {
    const e = etapesDesPuces(B1);
    expect(e.map((x) => x.titre)).toContain('Mobiliser les équipes en 2 heures');
    expect(e.some((x) => x.titre === 'Dépêcher sur le site le personnel')).toBe(false);
    expect(e.some((x) => /remplacement d'un agent absent/i.test(String(x.texte)))).toBe(false);
  });
  it('le secours commence par le périmètre (rondes d\'ouverture et de fermeture, horaires du DCE)', () => {
    const s = specSecoursBesoin(B1);
    expect(s).not.toBeNull();
    expect(s!.params.etapes[0].titre).toBe('Rondes d’ouverture et de fermeture');
    expect(s!.params.etapes[0].texte).toMatch(/05H30/);
    expect(s!.params.etapes[s!.params.etapes.length - 1].titre).toBe('Votre résultat');
  });
});

describe('Paragraphe des textes d\'étapes non retenues (caen 475, T6C-7)', () => {
  it('retiré quand 3 phrases sur 4 sont des textes d\'étapes et que la quatrième n\'apporte aucune donnée nouvelle', () => {
    const r = retirerParagrapheEtapes(B1, ETAPES, []);
    expect(r.retire).toMatch(/^Les rondes d’ouverture et de fermeture assurent les passages prévus à Caen/);
    expect(r.texte).not.toMatch(/assurent les passages prévus à Caen/);
  });
  it('gardé si la phrase restante porte une donnée absente du bloc', () => {
    const t = B1.replace('assurent les passages prévus à Caen.', 'assurent les passages prévus à Hérouville à 6h45.');
    expect(retirerParagrapheEtapes(t, ETAPES, []).retire).toBe('');
  });
});

describe('Texte de secours du bloc 1 (cstb 551, T6N-5)', () => {
  it('horaires sans repère interne ni fragment coupé', () => {
    expect(horairesLisibles([
      '[LE CENTRE SCIENTIFIQUE ET TECHNIQUE DU BATIMENT] Le site est ouvert en semaine de 07 h 20 à 19 h 30.',
      '[LE CENTRE SCIENTIFIQUE ET TECHNIQUE DU BATIMENT] à distance par le prestataire d’accueil entre 08h00 et 18h00 (interphone) pour les visiteurs,',
      '[Mise sous alarme anti-intrusion des bâtiments (Note 2) X] Si pour des raisons de service, la présence d’un collaborateur est nécessaire après 19h30, ce dernier doit présenter un accord écrit (Cf.',
      'Ronde de fermeture du site du CSTB (Note 4) 1 ronde, de 19h30 à 20h30 (RF) Ronde de jour (RJ) 2 rondes',
    ])).toEqual(['Le site est ouvert en semaine de 07 h 20 à 19 h 30.']);
  });
  it('jamais de clause contractuelle ni de renvoi du bloc 1 vers lui-même', () => {
    const plan: any = { rubriques: [{ id: 'b1_comprehension', titre: 'Notre compréhension de votre besoin', mode: 'besoin', bloc: 'besoin' }, { id: 'b2_catalogue', titre: 'Notre catalogue de prestations', mode: 'fixe', bloc: 'presentation' }], blocs: [{ id: 'besoin', numero: 1 }, { id: 'presentation', numero: 2 }] };
    const sources = [
      { exigence: 'Cette lettre doit être communiquée au CSTB dans le délai de deux mois, sous peine de forclusion.' },
      { exigence: 'Prendre en compte les 140 personnes travaillant en moyenne sur le site et l’accès unique.', rubrique: 'b1_comprehension' },
      { exigence: 'Réaliser 3 rondes de nuit entre 21h30 et 06h30, aussi bien les jours d’ouverture que de fermeture.', rubrique: 'b2_catalogue' },
    ];
    const t = completerBesoinMinimum('## Vos attentes et nos engagements\n\n## Les points de vigilance identifiés et nos réponses\n', sources, plan, '').texte;
    expect(t).not.toMatch(/forclusion|140 personnes|développée au bloc 1/);
    expect(t).toMatch(/3 rondes de nuit/);
    const s = texteSecoursBesoin({ amorce: 'Le CSTB lance le marché.', client: 'le CSTB', objet: '', sites: [], villes: [], prestations: [], horaires: [], obligations: ['Confirmée par écrit dans les trente (30) jours de la divulgation, cette confidentialité est due.'] } as any);
    expect(s).not.toMatch(/divulgation/);
  });
});

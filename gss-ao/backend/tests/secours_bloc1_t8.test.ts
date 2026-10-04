import { describe, it, expect } from 'vitest';
import { texteSecoursBesoin, horairesLisibles, obligationsLisibles, phraseSites, siteDansPhrase } from '../src/generation/reponse_libre_v2';
import { horairesImposes, obligationsChiffrees, communesParCodePostal, communeLisible, sitesDuMarche } from '../src/generation/base_memoires';
import { exigenceHorsNormandie } from '../src/generation/adaptations_cctp';
import { voixDeGss } from '../src/generation/format_court';
import { DCE, aCorpus } from './fixtures/corpus';

/** Tour 8 (T8CS-1, T8-COH-1) : horaires et obligations du CCTP cités dans le texte de secours du bloc 1. */
const base = { client: 'X', objet: '', lots: '', duree: '', sites: [] as string[], villes: [] as string[], secteur: '', horaires: [] as string[], obligations: [] as string[], qualifications: [], enjeux: [], prestations: [] as string[], horsNormandie: false, amorce: 'X lance le marché.' };

describe('texte de secours du bloc 1 : obligations citées (T8CS-1, T8-COH-1)', () => {
  it('titre de partie, pied de page, caractère à usage privé et titre collé retirés (caen 475, ign, becquerel)', () => {
    expect(obligationsLisibles([
      '3.6 DELAIS D’INTERVENTION En cas de sinistre, le Titulaire aura la capacité de mobiliser les équipes nécessaires, dans un délai de DEUX (2) heures.',
      'Page 9 sur 11 Dans le cas de défaillance de l’effectif prévu, le Titulaire doit dépêcher sur le site le personnel de remplacement dans les UNE (1) heure suivant la constatation.',
      ' Les rapports d’intervention sont établis et déposés dans un délai maximal de 2 jours ouvrés.',
      'Plannings Les plannings mensuels devront être transmis au responsable sécurité du CHB au moins 10 jours avant le début du mois considéré.',
    ])).toEqual([
      'En cas de sinistre, le Titulaire aura la capacité de mobiliser les équipes nécessaires, dans un délai de DEUX (2) heures.',
      'Dans le cas de défaillance de l’effectif prévu, le Titulaire doit dépêcher sur le site le personnel de remplacement dans les UNE (1) heure suivant la constatation.',
      'Les rapports d’intervention sont établis et déposés dans un délai maximal de 2 jours ouvrés.',
      'Les plannings mensuels devront être transmis au responsable sécurité du CHB au moins 10 jours avant le début du mois considéré.',
    ]);
  });
  it('fragments, renvois, listes coupées et obligations de l’acheteur jamais imprimés (ign, becquerel, ca_normandie, vitry, rouen_univ, imm, parc_expo)', () => {
    expect(obligationsLisibles([
      'Dans ce cas, le délai de deux (2) heures court à partir du moment où l’agent s’est vu signifier oralement son interdiction.',
      'Cette transmission se fait de manière systématique au moins sept (7) jours avant le début du mois concerné.',
      'Ce CR devra être établi dans les 5 jours ouvrés suivants.',
      '11 DOCUMENTS EXIGIBLES Au plus tard 5 jours avant toute prise de fonction, le titulaire doit fournir au SAIMG les pièces suivantes : − CV de l’agent ;',
      'Une fois par mois de nuit',
      'devront être communiqués au responsable sécurité du CHB au moins 2 jours ouvrés avant la modification.',
      'Dans les dix (10) jours avant la date de début d’intervention de ce personnel sur site',
      'Prendre connaissance au moins une fois par semaine des informations concernant l’exécution des prestations ;',
      'En cas de désaccord avec la personne chargée de contrôler le devis, celle-ci devra l’annoter et le retourner au Titulaire par mail, dans un délai maximal de 48 heures ouvrées.',
      'Si le Pouvoir Adjudicateur souhaite ne pas reconduire le marché, le titulaire en sera visé par courrier au moins trois mois avant la date anniversaire du marché.',
      'Ces fiches de poste devant être établies et validées par les deux Parties sous trente (30) jours après la date de mise en application du Contrat.',
      'Le Titulaire aura alors pour obligation de faire une nouvelle proposition, dans un délai de 24 heures ouvrées.',
      'A partir de ces consignes, le Titulaire s’engage à constituer un manuel dans un délai de 2 mois maximum.',
      'aux exigences requises, le Titulaire devra être en mesure de fournir le personnel dans un délai de 24h ouvrables.',
      '5-1- Délais de livraison Suite à toute demande de la ville, le Titulaire devra transmettre un devis dans un délai maximum de 72 heures ouvrées.',
      'En cas de panne ils devront être remplacés en moins de 24H par un véhicule équivalent.',
      'La commande est réputée acceptée par le Titulaire à défaut de réserves écrites dans les quarante-huit (48) heures suivant sa réception.',
    ]).filter((o) => !/^Délais de livraison : /.test(o))).toEqual([]);
  });
  it('doublons réécrits fusionnés (citedia : « sous un délai de 3 minutes » / « dans un délai maximal de 3 minutes »)', () => {
    const o = obligationsLisibles([
      'A réception d’une alarme au frontal du PC de télésurveillance, le chef d’équipe SSIAP 2 du Titulaire doit appliquer les consignes définies par Citédia Métropole sous un délai de 3 minutes maximum.',
      'À réception d’une alarme au frontal du PC de télésurveillance, le Chef d’équipe SSIAP 2 du Titulaire applique les consignes définies par Citédia Métropole dans un délai maximal de 3 minutes.',
    ]);
    expect(o).toHaveLength(1);
  });
  it('citation entre guillemets : « le titulaire » / « au titulaire » jamais passés à la voix de GSS (caen 475, ign)', () => {
    const t = texteSecoursBesoin({ ...base, obligations: ['Les modifications de plannings sont transmises au SAIMG dès qu’elles sont connues par le titulaire et au plus tard 4 jours ouvrés avant leur prise d’effet.', 'Le Titulaire met en place un système d’astreinte permettant d’assurer le remplacement des absents dits « de dernière minute », dans un délai maximal de deux heures.'] });
    const v = voixDeGss(t);
    expect(v).toContain('- « Les modifications de plannings sont transmises au SAIMG dès qu’elles sont connues par le titulaire et au plus tard 4 jours ouvrés avant leur prise d’effet. »');
    expect(v).toContain('dits “de dernière minute”');
    expect(v).not.toMatch(/connues par GSS/);
  });
  it('sous-titre du périmètre jamais imprimé vide (T8-COH-1)', () => {
    const t = texteSecoursBesoin({ ...base });
    expect(t).not.toMatch(/## Le périmètre/);
    expect(texteSecoursBesoin({ ...base, prestations: ['rondes'] })).toMatch(/## Le périmètre de la prestation demandée\n\nLe marché comprend : rondes\./);
  });
});

describe('texte de secours du bloc 1 : horaires cités (T8CS-1, T8-COH-1)', () => {
  it('délai, durée minimale, phrase qui renvoie à la précédente, tableau aplati et phrases collées refusés (parc_expo, citedia, ifits, havre)', () => {
    expect(horairesLisibles([
      'A ce titre le prestataire devra être capable de proposer des vacations d’agents de courte durée (minimum 4h).',
      'L’agent de Citédia Métropole basé 24h/24 et 7 jours/7 au Poste de Contrôle et Régulations (PCR) doit être informé des interventions dans les 3 minutes qui suivent l’alerte.',
      'Enfin, il doit informer l’agent de Citédia Métropole basé 24h/24 dans les 3 minutes qui suivent l’alerte.',
      'SEMAINE (LUNDI AU VENDREDI) WEEK-END ET/OU JOURS FÉRIÉS MATIN SOIR JOUR NUIT 5h00 à 8h00 17h00 à 20h00.',
      'Les Samedis de 8h00 à 1h00 Les horaires indiqués ci-dessous sont applicables.',
      'Ils transmettent les informations de la vacation au CSU tous les matins avant 7h00.',
      'Du Mardi Bureau du Parc Lices ouvert : Les 4 401 Rue du Louis d’Or Les Lices au Samedi de 7h00 à 2h00 Lundis de 09h00 à 00h00.',
    ])).toEqual([]);
  });
  it('titre de poste collé écrit en libellé ; « Horaires : » seul écrit avec son bâtiment (becquerel, ign)', () => {
    expect(horairesLisibles([
      'Poste PC sécurité Le poste devra être couvert 24h / 24h, 7 jours sur 7 par un agent SSIAP2.',
      '[Bâtiment Coriolis] Horaires : du lundi au vendredi de 7h00 à 19h00.',
      '[ARTICLE 3 – PRESTATIONS du lot 2] Horaires : 14h00 – 21h00, du lundi au vendredi.',
    ])).toEqual(['Poste PC sécurité : Le poste devra être couvert 24h / 24h, 7 jours sur 7 par un agent SSIAP2.', 'Bâtiment Coriolis : Horaires : du lundi au vendredi de 7h00 à 19h00.']);
  });
  it('deux horaires qui ne diffèrent que par leurs heures : imprimés seulement avec leur période (fontainebleau, ca_normandie)', () => {
    expect(horairesLisibles(['Prévoir deux agents en poste à l’instant T de 9h20 à 18h10.', 'Prévoir deux agents en poste à l’instant T de 9h20 à 17h40.'])).toEqual([]);
    expect(horairesLisibles(['Du 1er avril au 30 septembre : Prévoir deux agents en poste de 9h20 à 17h40 ;', 'Du 1er avril au 30 septembre : Prévoir deux agents en poste de 9h20 à 18h10.', 'Du 1er octobre au 31 mars : Prévoir deux agents en poste de 9h20 à 16h40 ;']))
      .toEqual(['Du 1er avril au 30 septembre : Prévoir deux agents en poste de 9h20 à 17h40.', 'Du 1er avril au 30 septembre : Prévoir deux agents en poste de 9h20 à 18h10.', 'Du 1er octobre au 31 mars : Prévoir deux agents en poste de 9h20 à 16h40.']);
  });
  it('période de l’année écrite seule sur sa ligne reprise devant chaque horaire (option « periodes »), jusqu’à la fin de sa liste', () => {
    const dce = '\n\n--- CCTP.pdf ---\nLes agents sont présents selon les horaires décrits ci-dessous :\n      Du 1er avril au 30 septembre :\n            Prévoir deux agents en poste de 9h20 à 17h40 ;\n            Prévoir deux agents en poste de 9h20 à 18h10.\n      Du 1er octobre au 31 mars :\n            Prévoir deux agents en poste de 9h20 à 16h40.\n    Janvier, février, novembre et décembre :\n           •    Jardin Anglais : fermeture à 16h30 ;\n    Le parc est quant à lui ouvert de 0h00 à 24h00 tous les jours de l’année.\n';
    expect(horairesImposes(dce, 30, undefined, { periodes: true })).toEqual([
      'Du 1er avril au 30 septembre : Prévoir deux agents en poste de 9h20 à 17h40 ;',
      'Du 1er avril au 30 septembre : Prévoir deux agents en poste de 9h20 à 18h10.',
      'Du 1er octobre au 31 mars : Prévoir deux agents en poste de 9h20 à 16h40.',
      'Janvier, février, novembre et décembre : Jardin Anglais : fermeture à 16h30 ;',
      'Le parc est quant à lui ouvert de 0h00 à 24h00 tous les jours de l’année.',
    ]);
    // Sans l'option : sortie inchangée (contrôle des contradictions), la période reste dans la phrase d'introduction.
    expect(horairesImposes(dce, 30)[0]).toBe('Les agents sont présents selon les horaires décrits ci-dessous : Du 1er avril au 30 septembre : Prévoir deux agents en poste de 9h20 à 17h40 ;');
  });
  it.skipIf(!aCorpus('fontainebleau'))('fontainebleau : chaque horaire des agents imprimé avec sa période', () => {
    const h = horairesLisibles(horairesImposes(DCE('fontainebleau'), 15, undefined, { periodes: true }));
    expect(h.filter((x) => /Prévoir deux agents/.test(x)).every((x) => /^Du 1er (?:avril|octobre)/.test(x))).toBe(true);
    expect(h.filter((x) => /Prévoir deux agents/.test(x))).toHaveLength(4);
  });
  it.skipIf(!aCorpus('caen') || !aCorpus('ign') || !aCorpus('becquerel'))('corpus : aucune forme refusée dans le texte de secours (caen, ign, becquerel, citedia, ifits, vitry, parc_expo)', () => {
    for (const c of ['caen', 'ign', 'becquerel', 'citedia', 'ifits', 'vitry', 'parc_expo', 'ca_normandie', 'rouen_univ', 'imm', 'ifsem']) {
      if (!aCorpus(c)) continue;
      const d = DCE(c);
      const t = texteSecoursBesoin({ ...base, horaires: horairesImposes(d, 15, undefined, { periodes: true }), obligations: obligationsChiffrees(d).slice(0, 25).map((o) => o.phrase) });
      const puces = t.split('\n').filter((l) => l.startsWith('- '));
      for (const p of puces) {
        expect(p, c).toMatch(/^- « [A-ZÀ-Ý].*[.!?] »$/);
        expect(p, c).not.toMatch(/\bPage \d+ sur \d+|[-]|^- « \d+(?:\.\d+)* [A-Z]{3,}|^- « (?:Dans ce cas|Ce |Cette |Ces |Il |Ils |Enfin|A ce titre|À ce titre)|ci-dessous|: [−–-] /);
      }
    }
  });
});

describe('commune du marché lue par code postal (T8CS-2, T8REG-1, T8-COH-3)', () => {
  it('commune avant le code, pays refusé ; jamais le mot de la ligne suivante ; trait d’union ; casse de nom propre', () => {
    expect(communesParCodePostal('Adresse : Fontainebleau 77300 France').map((c) => c.commune)).toEqual(['Fontainebleau']);
    expect(communesParCodePostal('Tribunal de proximité, rue X à DIEPPE 76200\nClassification établissement | ERP').map((c) => c.commune)).toEqual(['Dieppe']);
    expect(communesParCodePostal('Campus, 76130 Mont -Saint-Aignan').map((c) => c.commune)).toEqual(['Mont-Saint-Aignan']);
    expect(communesParCodePostal('CS 40051 76084 LE HAVRE Cedex').map((c) => c.commune)).toEqual(['Le Havre']);
    expect(communeLisible('LE GRAND QUEVILLY')).toBe('Le Grand-Quevilly');
    expect(communeLisible('SAINT ETIENNE DU ROUVRAY')).toBe('Saint-Étienne-du-Rouvray');
    expect(communeLisible('Marne la Vallée')).toBe('Marne la Vallée');
    expect(communeLisible('France')).toBe('');
    expect(communesParCodePostal('Sa superficie sera d’environ 15000\nm² au sol.').map((c) => c.commune)).toEqual([]);
  });
  it('motif D8 : « site de Fontainebleau », jamais « site de France »', () => {
    const dce = 'Pouvoir adjudicateur\nÉtablissement public du château de Fontainebleau\nAdresse : Fontainebleau 77300 France\nCCTP : surveillance du château.';
    expect(sitesDuMarche({}, dce).horsNormandie).toEqual(['Fontainebleau']);
    expect(exigenceHorsNormandie(dce, {})).toMatch(/^Marché hors Normandie \(site de Fontainebleau\)/);
  });
  it('nom de site jamais lu comme une commune (« le site de Site VESTA »)', () => {
    expect(siteDansPhrase('Site VESTA', ['Site VESTA'])).toBe('le site VESTA');
    expect(phraseSites(['Lycée de Beauvais', 'Lycée du Tréport'], ['Lycée de Beauvais', 'Lycée du Tréport'])).toBe('La prestation porte sur le Lycée de Beauvais et le Lycée du Tréport.');
  });
});

// Tour 4, correcteur (T4G-2) : commune lue quand l'adresse est coupée après le code, quand le code est suivi d'une espace
// insécable, ou quand code et ville sont en colonnes ; jamais un mot de la voie.
describe('commune par code postal, adresses coupées et colonnes (T4G-2)', () => {
  const c = (t: string) => communesParCodePostal(t).map((x) => x.commune);
  it('code en fin de ligne : la commune de la ligne suivante, jamais un mot de la voie', () => {
    expect(c('situé 3 rue du Château Gaillard, 27700\nLes Andelys')).toEqual(['Les Andelys']);
    expect(c('12 avenue du Parc des Sports, 76300\nSotteville-lès-Rouen')).toEqual(['Sotteville-lès-Rouen']);
    expect(c("place de l'Hôtel de Ville, 76000\nROUEN")).toEqual(['Rouen']);
    expect(c('rue du Musée des Beaux-Arts, 76000\nRouen')).toEqual(['Rouen']);
  });
  it('commune coupée en fin de ligne : recollée', () => {
    expect(c("24 rue Joseph Fourier 38400 Saint Martin\nd'Hères.")).toEqual(["Saint-Martin-d'Hères"]);
    expect(c("24 rue Joseph Fourier, 38400 Saint-Martin-\nd'Hères.")).toEqual(["Saint-Martin-d'Hères"]);
    expect(c('1 rue Thomas Becket, 76821 Mont Saint\nAignan Cedex')).toEqual(['Mont-Saint-Aignan']);
  });
  it('espace insécable après le code, colonnes « Code postal » et « Ville »', () => {
    expect(c('4 rue Pasteur, 76360 Barentin')).toEqual(['Barentin']);
    expect(c('Code postal: 05000 ; Ville: Gap')).toEqual(['Gap']);
    expect(c('Agence | 12 rue Carnot | 05000 | Gap')).toEqual(['Gap']);
  });
});

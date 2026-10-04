/**
 * Tour 6, correcteur : lectures sans modèle du DCE rédigé autrement (délais, tableaux Word et PDF, lots, interdits,
 * qualifications, limite de pages) et typographie (fêtes, apostrophes, unité saisie).
 */
import { describe, it, expect } from 'vitest';
import { normaliserExpressionsDelai, typographieDce, RX_RONDES_A_PIED, lotsDuMemoireDce, perimetreDuLot, heureEstUnDelai } from '../src/generation/base_memoires';
import { preparerMemoireType, chargerMemoireType, delaisDuDce, qualificationsDuDce, tableauxEnColonnes } from '../src/generation/memoire_type';
import { limitePagesMemoire } from '../src/generation/format_court';
import { sansUniteRedite } from '../src/generation/completion';
import { surtitre, essentielV3 } from '../src/generation/marp_pages_marine';
import { chiffresCles } from '../src/generation/bloc1_marine';
import { libelleEmplacementSeul } from '../src/generation/reponse_libre_v2';
import { questionExacte, definirDceDesQuestions } from '../src/generation/questions_gss';

const mt = chargerMemoireType();
const prep = (corps: string) => preparerMemoireType({ analyse: { clientName: 'Ville de Rouen' }, dce: `\n\n--- CCTP ---\nCAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES\nARTICLE 1 – OBJET\nSurveillance de l'Hôtel de Ville, 2 place du Général de Gaulle, 76000 Rouen. Le titulaire assure la télésurveillance et l'intervention sur alarme.\n${corps}\n`, referents: '' } as any, { memoireType: mt } as any) as any;
const minutes = (dce: string, s: any) => delaisDuDce(dce, s).map((x) => x.minutes);

describe('heure d\'un tableau de planning jamais lue comme délai (REG6-1)', () => {
  it('planning « | 19h00 | », « | 22:00 | » : délais du registre, pas « 19 heures »', () => {
    const p = prep("ARTICLE 3 - PLANNING DES POSTES\n| Prestation | Heure |\n|---|---|\n| Relève et remplacement de l'agent de jour par l'agent de nuit | 19h00 |\n| Intervention sur alarme du rondier (prise de poste) | 22:00 |");
    expect(p.variables.DELAI_ASTREINTE.valeur).not.toMatch(/19 heures/);
    expect(p.variables.DELAI_INTERVENTION_ALARME.valeur).not.toMatch(/22 heures/);
  });
  it('colonnes Début / Fin et lignes jamais fusionnées', () => {
    expect(minutes("| Mission | Début | Fin |\n| Intervention sur alarme et levée de doute | 21:00 | 07:00 |", 'alarme')).toEqual([]);
    expect(normaliserExpressionsDelai('| Total heures | 95H45 (avec le renfort) |\n| 76 |')).not.toMatch(/dans 76/);
  });
  it('délai nommé ou durée courte d\'une action de présence : lu', () => {
    expect(minutes("| Délai d'intervention sur alarme | 0h20 |", 'alarme')).toEqual([20]);
    expect(normaliserExpressionsDelai("Intervention sur déclenchement d'alarme | 0h20")).toBe("Intervention sur déclenchement d'alarme | dans 20 minutes");
    expect(heureEstUnDelai('Prise de service', '01h00')).toBe(false);
  });
});

describe('délais du CCTP écrits autrement (T6G-5)', () => {
  it.each([
    ["Sur déclenchement d'alarme, le délai d'intervention sur site ne devra pas dépasser vingt-cinq (25) minutes.", 25],
    ["Sur déclenchement d'alarme, le délai d'intervention sur site ne devra pas dépasser trente (30) minutes.", 30],
    ["Délai d'intervention sur alarme : vingt (20) minutes.", 20],
    ["En cas d'alarme, le temps d'intervention garanti est de 20 minutes.", 20],
    ["En cas d'alarme, le titulaire garantit un temps d'arrivée sur site de 20 minutes.", 20],
    ["En cas d'alarme, l'intervenant sera sur place 20 minutes maximum après l'appel.", 20],
    ["Le temps d'arrivée sur site du rondier, en cas d'alarme, ne pourra excéder trente (30) minutes.", 30],
  ])('%s', (ph, n) => {
    expect(minutes(`--- CCTP ---\n${ph}`, 'alarme')).toEqual([n]);
    expect(prep(ph).variables.DELAI_INTERVENTION_ALARME.valeur).toBe(`${n} minutes`);
  });
  it('« ne saurait excéder quinze (15) minutes » et « cent vingt minutes »', () => {
    expect(normaliserExpressionsDelai('le temps d\'intervention ne saurait excéder quinze (15) minutes')).toMatch(/dans 15 minutes/);
    expect(minutes("--- CCTP ---\nEn cas d'absence d'un agent, le titulaire assure son remplacement dans un délai maximal de cent vingt minutes.", 'remplacement')).toEqual([120]);
  });
  it('« Remplacement d\'un agent absent : 1 h maximum. »', () => {
    expect(minutes("--- CCTP ---\nRemplacement d'un agent absent : 1 h maximum.", 'remplacement')).toEqual([60]);
  });
});

describe('tableaux de délais lus cellule par cellule (T6G-2)', () => {
  it('une colonne par délai, une ligne par site', () => {
    const corps = "ARTICLE 7 – DÉLAIS\nSite | Délai d'intervention sur alarme | Délai de remplacement d'un agent absent\nHôtel de Ville | 20 minutes | 1 heure\nMédiathèque | 20 minutes | 1 heure\n\n=== TABLEAUX (cellules étiquetées par en-tête de colonne) ===\nHôtel de Ville — Délai d'intervention sur alarme: 20 minutes ; Délai de remplacement d'un agent absent: 1 heure\n";
    const p = prep(corps);
    expect(p.variables.DELAI_INTERVENTION_ALARME.valeur).toBe('20 minutes');
    expect(p.variables.DELAI_ASTREINTE.valeur).toBe('1 heure');
    expect(p.variables.DELAI_INTERVENTION_ALARME.question || '').toBe('');
  });
});

describe('lignes « libellé : durée » et intitulés non numérotés (T6G-3)', () => {
  const lignes = "Remplacement d'un agent absent : 1 heure.\nIntervention sur alarme : 30 minutes.\nLevée de doute PTI : 15 minutes.\n";
  it.each([
    ['ARTICLE 7 – DÉLAIS D\'INTERVENTION\n', lignes],
    ['DÉLAIS D\'INTERVENTION\nLe titulaire respecte les délais maximaux suivants :\n', lignes],
    ['Délais d\'intervention\n\n', lignes],
    ['**Délais maximaux**\n', "- remplacement d'un agent absent : 1 heure ;\n- intervention sur alarme : 30 minutes ;\n- levée de doute PTI : 15 minutes.\n"],
    ['B. Délais\n', "Le remplacement d'un agent absent : 1 heure maximum.\nL'intervention sur alarme : 30 minutes maximum.\nLevée de doute PTI : 15 minutes maximum.\n"],
  ])('%s', (titre, corps) => {
    const dce = `--- CCTP ---\n${titre}${corps}`;
    expect(minutes(dce, 'remplacement')).toEqual([60]);
    expect(minutes(dce, 'alarme')).toEqual([30]);
    expect(minutes(dce, 'pti')).toEqual([15]);
  });
  it('le délai du CCTP est imprimé, jamais le délai normand', () => {
    const p = prep(`DÉLAIS D'INTERVENTION\n${lignes}`);
    expect(p.variables.DELAI_PTI.valeur).toBe('15 minutes');
    expect(p.variables.DELAI_INTERVENTION_ALARME.valeur).toBe('30 minutes');
  });
});

describe('tableaux d\'un vrai PDF (T6G-4)', () => {
  const pdf = "ARTICLE 7 – DÉLAIS D'INTERVENTION\nLe titulaire respecte les délais maximaux suivants :\nÉvénement   Délai maximal\nRemplacement d'un agent absent   1 heure\nIntervention sur déclenchement d'alarme 30 minutes\nDéclenchement d'un PTI   15 minutes\nARTICLE 8 – SUIVI\nObligation du titulaire   Fréquence minimale\nContrôle inopiné des agents sur site 4 par mois\nRéunion de suivi avec l'acheteur   Mensuelle";
  it('colonnes réécrites en lignes « a | b »', () => {
    const t = tableauxEnColonnes(pdf);
    expect(t).toContain("Intervention sur déclenchement d'alarme | 30 minutes");
    expect(t).toContain('Réunion de suivi avec l\'acheteur | Mensuelle');
    expect(t).toContain('Le titulaire respecte les délais maximaux suivants :');
  });
  it('délais, contrôles inopinés et réunions lus', () => {
    const p = prep(pdf);
    expect(p.variables.DELAI_ASTREINTE.valeur).toBe('1 heure');
    expect(p.variables.DELAI_INTERVENTION_ALARME.valeur).toBe('30 minutes');
    expect(p.variables.DELAI_PTI.valeur).toBe('15 minutes');
    expect(p.variables.FREQ_REUNIONS.valeur).toBe('chaque mois');
    expect(p.variables.FREQ_CONTROLE_2.valeur).toMatch(/^(?:au moins )?quatre fois par mois$/);
  });
});

describe('CCTP commun à plusieurs lots : têtes de lot dans les intitulés (T6G-1)', () => {
  const L1 = "Le site est situé 10 avenue de la République, 59000 Lille.\nEn cas d'alarme, l'agent intervient sur site dans un délai de 30 minutes.\n";
  const L2 = "Le site est situé 2 place du Général de Gaulle, 76000 Rouen.\nEn cas d'alarme, l'agent intervient sur site dans un délai de 20 minutes.\n";
  const analyse = { clientName: 'Groupe Exemple', lots: [{ num: '1', perimetre: 'gardiennage Lille' }, { num: '2', perimetre: 'sécurité Rouen' }] };
  it.each([
    [`LOT N°1 – GARDIENNAGE LILLE\n1.1 Lieu\n${L1}\nLOT N°2 – SÉCURITÉ ROUEN\n2.1 Lieu\n${L2}`],
    [`ARTICLE 5 – LOT 1 : GARDIENNAGE LILLE\n5.1 Lieu\n${L1}\nARTICLE 6 – LOT 2 : SÉCURITÉ ROUEN\n6.1 Lieu\n${L2}`],
    [`TITRE II – DISPOSITIONS PARTICULIÈRES AU LOT N°1\n${L1}\nTITRE III – DISPOSITIONS PARTICULIÈRES AU LOT N°2\n${L2}`],
    [`CHAPITRE 2 – LOT 1 – GARDIENNAGE LILLE\n${L1}\nCHAPITRE 3 – LOT 2 – SÉCURITÉ ROUEN\n${L2}`],
    [`PARTIE A – DISPOSITIONS PROPRES AU LOT 1 (LILLE)\n${L1}\nPARTIE B – DISPOSITIONS PROPRES AU LOT 2 (ROUEN)\n${L2}`],
    [`Lot 1 – Gardiennage Lille\n\nLieu\n${L1}\nLot 2 – Sécurité Rouen\n\nLieu\n${L2}`],
  ])('%s', (corps) => {
    const dce = `\n\n--- Cadre de réponse lot 2 ---\nCadre\n\n--- CCTP commun ---\nCAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES\nARTICLE 1 – OBJET\nLe marché comporte deux lots.\n${corps}`;
    const p = perimetreDuLot(analyse, dce)!;
    expect(p.lot).toBe('2');
    expect(p.dce).not.toMatch(/Lille|30 minutes/);
    expect(p.dce).toMatch(/76000 Rouen[\s\S]*20 minutes/);
  });
  it('dispositions communes gardées ; « LOTS » et « lot d\'agents » ne sont jamais des lots', () => {
    const dce = `\n\n--- Cadre de réponse lot 2 ---\nCadre\n\n--- CCTP ---\nARTICLE 3 – CONSISTANCE DES LOTS\nLOT N°1 – LILLE\n1.1 Lieu\nSite 59000 Lille.\nLOT N°2 – ROUEN\n2.1 Lieu\nSite 76000 Rouen.\nARTICLE 4 – DISPOSITIONS COMMUNES\nLes agents portent une tenue.\nLe titulaire fournit un lot d'équipements.\n`;
    const p = perimetreDuLot({ lots: [{ num: '1' }, { num: '2' }] }, dce)!;
    expect(p.dce).toContain('Les agents portent une tenue.');
    expect(p.dce).toContain("un lot d'équipements");
    expect(p.dce).not.toContain('Lille');
  });
});

describe('lot écrit dans le nom des pièces (T6G-11)', () => {
  const analyse = { lots: [{ num: '1', perimetre: 'gardiennage' }, { num: '2', perimetre: 'incendie' }] };
  it.each(['CCTP_LOT-2', 'CCTP - LOT-2', 'Cadre de réponse - Lot II', 'Cadre memoire technique - lot#2', 'CRT_Lot_02'])('%s', (nom) => {
    expect(lotsDuMemoireDce(analyse, `\n\n--- ${nom} ---\nTexte.\n`)).toEqual({ lots: ['2'] });
  });
  it('référence de contrat jamais lue comme un lot', () => {
    expect(lotsDuMemoireDce(analyse, '\n\n--- Contrat lots 54.6.09 ---\nTexte.\n').lots).toEqual(['1', '2']);
  });
});

describe('rondes imposées à pied, quel que soit le verbe (T6G-8)', () => {
  it.each(["Les rondes s'effectuent exclusivement à pied.", "Les rondes s’effectueront à pied sur l'ensemble du site.", 'Les rondes se feront de manière pédestre.', 'Les rondes sont effectuées exclusivement à pied.', "Les rondes s'effectuent à pied, l'usage de tout véhicule est interdit."])('%s', (ph) => {
    expect(RX_RONDES_A_PIED.test(ph)).toBe(true);
  });
  it.each(['Les rondes ne sont pas effectuées à pied.', "Les rondes s'effectuent en voiture ou à pied.", 'Les rondes extérieures sont effectuées en véhicule et les rondes intérieures à pied.', 'Les agents se rendent à pied au poste.'])('%s', (ph) => {
    expect(RX_RONDES_A_PIED.test(ph)).toBe(false);
  });
});

describe('qualifications à points et en toutes lettres (T6G-13)', () => {
  it('« S.S.T. », « P.S.C.1 », « certificat de qualification professionnelle APS »', () => {
    expect(qualificationsDuDce('Les agents sont titulaires du S.S.T. en cours de validité.')).toContain('SST');
    expect(qualificationsDuDce('Les agents sont titulaires du P.S.C.1.')).toContain('PSC1');
    expect(qualificationsDuDce('Les agents sont titulaires du certificat de qualification professionnelle APS.')).toContain('CQP APS');
  });
});

describe('limite de pages « annexes non comprises » (T6G-12)', () => {
  it.each([
    'Le mémoire technique (20 pages A4 maximum, annexes non comprises) présentera les moyens.',
    'Le mémoire technique de 20 pages maximum (annexes non comprises) présentera les moyens.',
    'Le mémoire technique de 20 pages maximum, annexes non comprises, présentera les moyens.',
    "Le mémoire technique ne devra pas excéder 20 pages, les annexes n'étant pas comptabilisées.",
  ])('%s', (ph) => {
    expect(limitePagesMemoire([ph])?.pages).toBe(20);
  });
});

describe('typographie (REG6-5, T6N-7)', () => {
  it('fêtes et noms propres composés gardent leur majuscule', () => {
    expect(typographieDce('Les vacations de Noël et du Nouvel An sont renforcées.')).toBe('Les vacations de Noël et du Nouvel An sont renforcées.');
    expect(typographieDce('Les rondes de Pâques et de la Toussaint.')).toBe('Les rondes de Pâques et de la Toussaint.');
    expect(typographieDce("La ronde d'Ouverture du site.")).toBe("La ronde d'ouverture du site.");
  });
  it('apostrophe typographique devant une voyelle accentuée', () => {
    expect(surtitre("L'équipe de contrôle et l'état d'ébriété")).toContain('L’équipe de contrôle et l’état d’ébriété');
    expect(essentielV3("Nos agents s'efforcent d'être présents. Suite du texte.") || '').toContain('d’être');
  });
});

describe('saisie d\'un montant (T6N-6)', () => {
  it('l\'unité écrite après l\'emplacement n\'est pas redite', () => {
    expect(sansUniteRedite('15 200 000 €', ' €')).toBe('15 200 000');
    expect(sansUniteRedite('15 200 000 euros HT', ' € HT')).toBe('15 200 000');
    expect(sansUniteRedite('15 200 000 €', '')).toBe('15 200 000 €');
    expect(sansUniteRedite('30 minutes', ' maximum')).toBe('30 minutes');
  });
});

describe('bandeau, libellé d\'emplacement et exigence du DCE (T6-CONS-13, T6-CONS-7, T6-CONS-8)', () => {
  it('légende du 24 h/24 sans nombre', () => {
    const c = chiffresCles('Le marché a une durée de 1 an.\n## Votre contexte\nLa surveillance à distance, active 365 jours sur 365 et 24 heures sur 24, garantit la sécurité du site.\n');
    const h = c.find((x) => x.valeur === '24 h/24')!;
    expect(h.legende).toBe('surveillance à distance');
  });
  it('libellé d\'emplacement en groupe nominal, jamais coupé sur une préposition', () => {
    expect(libelleEmplacementSeul('Décrire le processus interne et les échéances appliqués par GSS pour instruire une éventuelle reprise de salariés en cours de marché.', ''))
      .toBe('Processus interne et échéances pour instruire une éventuelle reprise de salariés en cours de marché');
    const l = libelleEmplacementSeul(`Préciser ${'la procédure détaillée de contrôle des agents '.repeat(4)}en cours de marché.`, '');
    expect(l).toMatch(/…$/);
    expect(l).not.toMatch(/\s(?:de|en|du|des|à)…$/);
  });
  it('consigne nominale du modèle absente du DCE : jamais « Exigence du DCE »', () => {
    definirDceDesQuestions("ARTICLE 3 – Le titulaire doit remettre la liste des agents affectés au marché avant le démarrage.");
    expect(questionExacte("identité de l’agent affecté et disponibilité de ses titres, de sa carte professionnelle CNAPS valide.")).toMatch(/^Pouvez-vous préciser ce point : « identité/);
    expect(questionExacte('le titulaire doit remettre la liste des agents affectés au marché avant le démarrage.')).toMatch(/^Exigence du DCE/);
    definirDceDesQuestions('');
  });
});

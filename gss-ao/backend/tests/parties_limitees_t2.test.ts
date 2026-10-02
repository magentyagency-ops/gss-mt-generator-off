// Tour 2 (T2C-4) : parties du cadre limitées en pages (ca_normandie 221 : partie 1 « 1 page maximum » débordant sur une
// deuxième page). Hauteur estimée sur le document, retraits de passages entiers signalés, schéma de la compréhension borné.
import { describe, it, expect } from 'vitest';
import { ajusterPartiesLimitees, partiesDuDocument, paragraphesCadre, geometrieCadre, hauteurPartie, ligneTableau, reduireComprehensionCadre, hauteurSchemaPt, textesSchemaSvg } from '../src/generation/memoire_type_cadre';

const p = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const styles = '<w:styles><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style></w:styles>';
const doc = (corps: string[]) => `<w:document><w:body>${corps.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr></w:body></w:document>`;
const phrase = 'Nos agents de sûreté, qualifiés et expérimentés, mettent leur savoir-faire à votre disposition selon vos besoins, sur chaque site du marché.';
const CADRE = doc([
  p('1 - Compréhension de la mission'), p('1 page maximum'), p('Annexes autorisées (1 planning par site)'),
  p('1.1 - Compréhension des sujétions du site et du contrat'), p('[CHAMP_1]'), p(''),
  p('Organisation des effectifs sur site et planning des interventions (agents, RTA)'), p('[CHAMP_2]'), p(''),
  p('Méthodologie et moyens mis en œuvre pour garantir la sécurité sur site'), p('[CHAMP_3]'), p(''), p(''),
  p('2- Moyens humains'), p('10 pages maximum'), p('2.1 – Organisation de la structure'), p('[CHAMP_4]'),
  p('3 – Mise en œuvre de l’astreinte'), p('8 pages maximum'), p('3.1 – Astreinte'), p('[CHAMP_5]'),
  p('4 – Suivi et contrôle de la prestation'), p('8 pages maximum'), p('4.1 – Contrôles'), p('[CHAMP_6]'),
]);
const comprehension = [
  "Le SAR de Rouen lance le marché « Prestation de sécurité incendie et de gardiennage » (lots 1 et 2).",
  '',
  `Le périmètre comprend le Palais de justice de Rouen et le Tribunal judiciaire du Havre. ${phrase} ${phrase}`,
  '',
  `Les horaires fractionnés appellent une continuité multisite. ${phrase}`,
  '',
  ...Array.from({ length: 5 }, (_, i) => `• Point de vigilance : sujet ${i + 1} du CCTP, ${phrase} → notre réponse : planification et remplacement.`),
  '• GSS réalise les rondes intérieures au moins toutes les trois heures et les rondes extérieures au moins deux fois par jour.',
].join('\n');
const equipe = [
  'Catégorie de personnel : Qualification : Nombre : Observations',
  'Agent de sécurité incendie : SSIAP 1 : 33 : 1001 h par semaine, soit 32,39 ETP',
  "Chef d'équipe de sécurité incendie : SSIAP 2 : 8 : 224,25 h par semaine, soit 7,26 ETP",
  'Agent de sécurité : CQP APS : 42 : 1277,52 h par semaine, soit 41,3 ETP',
  '',
  `Nous mettons en place une équipe de 83 agents titulaires, qui assurent les missions de façon régulière. ${phrase}`,
  '• GSS communique au RSEM, au début de chaque mois, le planning prévisionnel des agents pour au moins les deux mois à venir, avec leur poste, leurs noms, prénoms, jours et horaires.',
].join('\n');
const methodo = Array.from({ length: 12 }, (_, i) => `• Étape ${i + 1} : ${phrase}`).join('\n');

describe('Parties du cadre limitées en pages (T2C-4)', () => {
  it('repère les parties dans le document, deux parties « 8 pages maximum » consécutives restent distinctes', () => {
    const parties = partiesDuDocument(paragraphesCadre(CADRE));
    expect(parties.map((x) => [x.titre, x.pages, x.ids])).toEqual([
      ['1 - Compréhension de la mission', 1, [1, 2, 3]],
      ['2- Moyens humains', 10, [4]],
      ['3 – Mise en œuvre de l’astreinte', 8, [5]],
      ['4 – Suivi et contrôle de la prestation', 8, [6]],
    ]);
  });

  it('la dernière partie limitée s’arrête au titre de la partie suivante, limitée ou non (ca_normandie 241)', () => {
    const cadre = doc([
      p('6 – Organisation pendant la phase de prise en charge'), p('3 pages maximum'), p('Organisation de la prise en charge'), p('[CHAMP_7]'),
      p('7 – Mise en œuvre de la responsabilité environnementale'), p('Nombre de page libre'), p('Éco-gestes'), p('[CHAMP_8]'),
    ]);
    expect(partiesDuDocument(paragraphesCadre(cadre)).map((x) => [x.titre, x.ids])).toEqual([['6 – Organisation pendant la phase de prise en charge', [7]]]);
    const cadre2 = doc([p('4 – Suivi'), p('8 pages maximum'), p('[CHAMP_1]'), p('5 – Moyens matériels'), p('1 page par site pour le 5.1'), p('5.1 – Description'), p('[CHAMP_2]')]);
    expect(partiesDuDocument(paragraphesCadre(cadre2)).map((x) => [x.titre, x.ids])).toEqual([['4 – Suivi', [1]]]);
  });

  it('une partie trop longue est ramenée à sa limite, passages retirés entiers dans l’ordre prévu, tableau gardé', () => {
    const valeurs = new Map<number, string>([[1, comprehension], [2, equipe], [3, methodo], [4, 'Texte.'], [5, 'Texte.'], [6, 'Texte.']]);
    const g = geometrieCadre(CADRE, styles);
    const r = ajusterPartiesLimitees({
      documentXml: CADRE, stylesXml: styles, valeurs,
      comprehension: { id: 1, hauteurPt: 110 },
      ajoutsCouverture: new Map([[2, [equipe.split('\n').pop()!]]]),
    });
    const p1 = r.parties[0];
    expect(p1.avantPt).toBeGreaterThan(p1.budgetPt);
    expect(p1.apresPt).toBeLessThanOrEqual(p1.budgetPt);
    expect(p1.depasse).toBe(false);
    // Compréhension d'abord (engagement ajouté, puis points de vigilance au-delà de trois), puis couverture du CCTP.
    expect(p1.retires[0]).toMatchObject({ id: 1, origine: 'comprehension' });
    expect(p1.retires[0].texte).toMatch(/^GSS réalise les rondes/);
    const ordre = p1.retires.map((x) => x.origine);
    expect(ordre.indexOf('couverture')).toBeGreaterThan(ordre.lastIndexOf('comprehension'));
    if (ordre.includes('memoire_type')) expect(ordre.indexOf('memoire_type')).toBeGreaterThan(ordre.indexOf('couverture'));
    // Aucun passage réécrit : chaque ligne gardée figure telle quelle dans la valeur d'origine ; tableau entier.
    for (const id of [1, 2, 3]) for (const l of r.valeurs.get(id)!.split('\n').filter(Boolean)) expect(valeurs.get(id)!.split('\n')).toContain(l);
    for (const l of equipe.split('\n').filter(ligneTableau)) expect(r.valeurs.get(2)).toContain(l);
    expect(r.valeurs.get(2)).toMatch(/^Catégorie de personnel/);
    // Les autres parties ne sont pas touchées.
    expect(r.parties.slice(1).every((x) => !x.retires.length && !x.depasse)).toBe(true);
    // Hauteur recalculée indépendamment.
    const paras = paragraphesCadre(CADRE);
    const h = hauteurPartie(paras, r.parties[0].debut, r.parties[0].fin, g, r.valeurs, new Map([[1, (p1.imageComprehensionPt || 0) + g.lignePt]]));
    expect(h).toBeLessThanOrEqual(p1.budgetPt);
  });

  it('une partie qui tient sa limite reste identique', () => {
    const valeurs = new Map<number, string>([[1, 'Le SAR de Rouen lance le marché.'], [2, equipe], [3, '• Lampes torches.']]);
    const r = ajusterPartiesLimitees({ documentXml: CADRE, stylesXml: styles, valeurs, comprehension: { id: 1, hauteurPt: 110 } });
    expect(r.parties[0].retires).toEqual([]);
    expect(r.parties[0].imageComprehensionPt).toBe(110);
    expect([...r.valeurs]).toEqual([...valeurs]);
  });

  it('lignes de tableau « A : B : C » reconnues, phrases à deux « : » non', () => {
    expect(ligneTableau('Agent de sécurité incendie : SSIAP 1 : 33 : 1001 h par semaine, soit 32,39 ETP')).toBe(true);
    expect(ligneTableau("Les agents d'accueil occupent une place primordiale : celle du premier contact avec le client ou le visiteur. Ils sont la vitrine ; il est donc essentiel qu'ils fassent preuve de courtoisie. Ce poste demande une réelle polyvalence : ils accueillent et orientent le public.")).toBe(false);
  });

  it('réduction de la compréhension : lignes entières, sous-titre vidé retiré', () => {
    const t = 'Le SAR de Rouen lance le marché.\n\nLes points de vigilance :\n• Point de vigilance : A → notre réponse : B.\n\nNos engagements :\n• GSS réalise les rondes toutes les trois heures.';
    const r = reduireComprehensionCadre(t, (x) => !/rondes/.test(x));
    expect(r.texte).toBe('Le SAR de Rouen lance le marché.\n\nLes points de vigilance :\n• Point de vigilance : A → notre réponse : B.');
    expect(r.retirees).toEqual(['GSS réalise les rondes toutes les trois heures.']);
    // Un seul point de vigilance : jamais retiré (au moins deux gardés).
    expect(reduireComprehensionCadre(r.texte, () => false).texte).toContain('Point de vigilance : A');
  });

  it('ca_normandie 241 : attentes « citation — réponse » gardées avant les engagements ajoutés, ligne de tableau longue et ligne du schéma jamais retirées', () => {
    expect(ligneTableau('Agent de sécurité : 1 ADS : 20 : 613,77 h par semaine (Cour d’appel de Caen, Tribunal judiciaire de Caen, Tribunal de proximité de Vire, Tribunal judiciaire de Lisieux, Conseil de prud’hommes de Caen, Tribunal de commerce de Caen, Tribunal judiciaire de Coutances), soit 19,86 ETP')).toBe(true);
    const t = ['Le SAR de Rouen lance le marché.', '', 'Vos attentes et nos engagements :',
      '• « main courante tenue en temps réel » — réponse : main courante électronique consultable par le RSEM.',
      '• « Au moins deux fois par jour pour les rondes extérieures » — réponse : planification et contrôleur de rondes.',
      '• « délai maximum de 20 minutes » pour la levée de doute — réponse : procédure d’intervention sur alarme.',
      '• GSS réalise les rondes intérieures au moins toutes les trois heures.'].join('\n');
    const svg = '<svg><text>Votre résultat</text><text>Au moins deux fois par</text><text>jour pour les rondes</text><text>extérieures</text></svg>';
    expect(textesSchemaSvg(svg)).toEqual(['Votre résultat Au moins deux fois par jour pour les rondes extérieures']);
    const r1 = reduireComprehensionCadre(t, (x) => x.split('\n').length <= 5);
    expect(r1.retirees[0]).toBe('GSS réalise les rondes intérieures au moins toutes les trois heures.');
    expect(r1.texte).toContain('« main courante tenue en temps réel »');
  });

  it('hauteur d’un schéma paysage à la largeur du texte, bornée à 11 cm', () => {
    expect(Math.round(hauteurSchemaPt('<svg viewBox="0 0 1000 250"></svg>', 453.6))).toBe(110);
    expect(Math.round(hauteurSchemaPt('<svg viewBox="0 0 1000 1270"></svg>', 453.6))).toBe(312);
  });
});

// Campagne « zéro défaut », tour 2 : bloc 1 du style « marine » v3 sur les formes réelles de la rédaction (T2-CONS-5, T2N-1 à
// T2N-5). Phrases tirées des générations réelles cstb 1201, ifsem 1001, caen 701 à 706, citedia 701, ifits 701,
// fontainebleau 901.
import { describe, it, expect } from 'vitest';
import { articlesBloc1, chiffresCles, pageBloc1Marine } from '../src/generation/bloc1_marine';

const rangs = (t: string) => pageBloc1Marine(t, {}, { sources: false, bandeau: false }).split('\n').filter((l) => /^\| (?!Exigence|---)/.test(l));

describe('attentes et points de vigilance toujours en tableau (T2-CONS-5, T2N-1)', () => {
  it('une puce sans « → notre réponse » ne fait plus abandonner le tableau (cstb 1201)', () => {
    const t = [
      '## Vos attentes et nos engagements',
      '- **« une ouverture effective à 07h20 »** : nous organisons la ronde d’ouverture → notre réponse : « La planification », développée au bloc 4, et « La mise en place d’une prestation », développée au bloc 5.',
      '- **« délai moyen maximum pour intervenir sur site »** : le CCTP exige que ce délai soit indiqué pour les levées de doute.',
      '',
      '## Les points de vigilance identifiés et nos réponses',
      '- **Présence après 19h30** : aucun collaborateur ne doit rester sur le site → notre réponse : « Le livre des missions et consignes (LMC) » et « La mise en place d’une prestation », blocs 4 et 5.',
    ].join('\n');
    const r = rangs(t);
    expect(r).toHaveLength(3);
    expect(pageBloc1Marine(t, {}, { sources: false, bandeau: false })).not.toMatch(/^\s*- \*\*/m);
    expect(r[0]).toContain('Nous organisons la ronde d’ouverture : « La planification » et « La mise en place d’une prestation » <span class="gss-bloc">→ BLOC 4 ET 5</span>');
    // T7-CONS-5 : le libellé est un groupe nominal ; le constat du modèle reste dans la colonne du CCTP.
    expect(r[1]).toBe('| Délai moyen maximum | « délai moyen maximum pour intervenir sur site » : le CCTP exige que ce délai soit indiqué pour les levées de doute |  |');
    expect(r[2]).toBe('| Présence après 19h30 | Aucun collaborateur ne doit rester sur le site | « Le livre des missions et consignes (LMC) » et « La mise en place d’une prestation » <span class="gss-bloc">→ BLOC 4 ET 5</span> |');
  });
  it('formes sans flèche de ifsem 1001 et caen 706 : réponse et renvoi séparés du constat', () => {
    const t = [
      '## Vos attentes et nos engagements',
      '- **« délai maximal de deux heures à compter du début de la vacation concernée »** : nous organisons le remplacement sans interruption du service selon « Le remplacement d\'un agent absent : absence non prévue », développé au bloc 5.',
      '- **« main courante numérique sécurisée »** : les prises et fins de poste, rondes, incidents et anomalies sont suivis par « La main courante électronique », développée au bloc 4.',
      '- **« présent sur site dans un délai maximal de 30 minutes »** : nous planifions l’intervention sur alarme, avec « La planification » et « Notre socle de procédures : l\'intervention sur alarme et la télésurveillance », développées au bloc 4.',
      '## Les points de vigilance identifiés et nos réponses',
      '- **Ouverture avant vacation** : à Villejuif et Thiais, les vacations commencent à 7h, mais les portails doivent ouvrir dès 6h30. Cette articulation est à cadrer au démarrage selon « La mise en place d\'une prestation », développée au bloc 5.',
      '- **Rondes et présence au PC** : les missions prévoient à la fois des rondes du SSIAP 1 et la surveillance du PC.',
    ].join('\n');
    const r = rangs(t);
    expect(r).toEqual([
      // Colonne EXIGENCE tirée de la citation du CCTP, jamais du titre d'une rubrique de GSS (T3N-5).
      '| Délai maximal de deux heures | « délai maximal de deux heures à compter du début de la vacation concernée » | Nous organisons le remplacement sans interruption du service selon « Le remplacement d\'un agent absent : absence non prévue » <span class="gss-bloc">→ BLOC 5</span> |',
      '| Main courante numérique sécurisée | « main courante numérique sécurisée » | Les prises et fins de poste, rondes, incidents et anomalies sont suivis par « La main courante électronique » <span class="gss-bloc">→ BLOC 4</span> |',
      '| Présent sur site en 30 minutes | « présent sur site dans un délai maximal de 30 minutes » | Nous planifions l’intervention sur alarme, avec « La planification » et « Notre socle de procédures : l\'intervention sur alarme et la télésurveillance » <span class="gss-bloc">→ BLOC 4</span> |',
      '| Ouverture avant vacation | À Villejuif et Thiais, les vacations commencent à 7h, mais les portails doivent ouvrir dès 6h30 | Cette articulation est à cadrer au démarrage selon « La mise en place d\'une prestation » <span class="gss-bloc">→ BLOC 5</span> |',
      '| Rondes et présence au PC | Les missions prévoient à la fois des rondes du SSIAP 1 et la surveillance du PC |  |',
    ]);
  });
});

describe('renvoi à plusieurs blocs (T2N-2)', () => {
  it.each([
    ['développées au bloc 4 et au bloc 5', '4 ET 5'],
    ['développées aux blocs 4 et 5', '4 ET 5'],
    ['développée au bloc 4, et au bloc 5', '4 ET 5'],
    ['blocs 3 et 5', '3 ET 5'],
    ['développé au bloc 4', '4'],
  ])('« %s »', (renvoi, attendu) => {
    const t = `## Les points de vigilance identifiés et nos réponses\n- **Parc ouvert en continu** : le parc est ouvert 24h/24 → notre réponse : « La planification » et « La gestion d'une commande supplémentaire », ${renvoi}.\n`;
    const r = rangs(t)[0];
    expect(r).toBe(`| Parc ouvert en continu | Le parc est ouvert 24h/24 | « La planification » et « La gestion d'une commande supplémentaire » <span class="gss-bloc">→ BLOC ${attendu}</span> |`);
  });
  it('renvoi placé avant le titre (citedia 701) : « détaillé dans « … » »', () => {
    const t = '## Vos attentes et nos engagements\n- **« sous un délai de 3 minutes maximum »** : le SSIAP 2 traite chaque alarme → ce circuit est détaillé au bloc 4, « Notre socle de procédures : l’intervention sur alarme ».\n';
    expect(rangs(t)[0]).toContain('| Ce circuit est détaillé dans « Notre socle de procédures : l’intervention sur alarme » <span class="gss-bloc">→ BLOC 4</span> |');
  });
});

describe('bandeau des chiffres clés : légendes justes (T2N-3, T2N-4)', () => {
  const amorce = "L'acheteur lance le marché « Gardiennage », d'une durée de 1 an.\n\n";
  const leg = (t: string) => chiffresCles(amorce + t, {}).map((c) => `${c.valeur} | ${c.legende}`);
  it('surface avec son verbe (caen 703) : le groupe nominal', () => {
    expect(leg('## Votre contexte et votre site\nLe site se situe à Caen ; sa surface utile brute est de 2 820 m² et ses horaires d’ouverture sont 07h00–19h00.\n')).toContain('2 820 m² | surface utile brute');
  });
  it('« 24 h/24 » après un verbe (ifits 701) : légende générique', () => {
    expect(leg('## Votre contexte et votre site\nLa surveillance à distance doit être active 24 h/24, 365 jours par an.\n')).toContain('24 h/24 | présence continue');
  });
  it('délai classé sur la citation du CCTP seulement (citedia 701, caen 701, caen 702)', () => {
    expect(leg('## Vos attentes et nos engagements\n- **« sous un délai de 3 minutes maximum »** : le SSIAP 2 traite chaque alarme en 3 minutes et informe le PCR ; ce circuit est détaillé au bloc 4, « Notre socle de procédures : l’intervention sur alarme ».\n')).toContain('3 minutes | délai imposé');
    expect(leg('## Le périmètre de la prestation demandée\nLa télésécurité comprend une intervention, la vérification des accès selon les consignes, et un rapport ; l’arrivée sur site est exigée dans un délai maximal de 30 minutes.\n')).toContain('30 minutes | pour être sur site');
    expect(leg('## Vos attentes et nos engagements\n- **« présent sur site dans un délai maximal de 30 minutes »** : nous appliquons les consignes et le traitement de l’alarme → notre réponse : « La planification », développée au bloc 4.\n')).toContain('30 minutes | pour être sur site');
    expect(leg('## Vos attentes et nos engagements\n- **« l’opérateur traite l’alarme dans un délai de 2 minutes »** : → notre réponse : « La télésurveillance », développée au bloc 4.\n')).toContain("2 minutes | pour traiter l'alarme");
  });
  it('plusieurs surfaces sans objet propre (ifsem 1001) : aucune présentée comme « surface du site »', () => {
    const c = leg("## Votre contexte et votre site\nVillejuif et Thiais comprennent respectivement 12 bâtiments et 27 494 m², et 10 bâtiments et 30 370 m² ; Ivry-sur-Seine est un site tertiaire d’environ 6 000 m².\n");
    expect(c.join('\n')).not.toMatch(/m²/);
  });
  it('« 24 heures sur 24 » d’un rang de tableau : légende du poste', () => {
    expect(leg('## Le périmètre de la prestation demandée\n| Site | Poste | Jours et horaires |\n|---|---|---|\n| Campus | Agent de sécurité incendie (SSIAP 1) | Toute l’année, 24 heures sur 24 |\n')).toContain('24 h/24 | Agent de sécurité incendie');
  });
});

describe('articles du bloc 1 lus dans le cahier des charges et sur le bon fait (T2N-5)', () => {
  it('jamais l’article du règlement de la consultation', () => {
    const dce = "\n\n--- CCTP ---\nARTICLE 1 – OBJET ET PERIMETRE\nLa surveillance des parcs.\n\n--- R_C ---\n1.2 Durée - Délais d'exécution\nLe Marché est conclu pour une durée d’un an à compter du 01/01/2027.\n";
    expect(articlesBloc1("L'acheteur lance le marché « Gardiennage », d'une durée de 1 an.", dce)).toEqual({});
  });
  it('le même nombre sur un autre fait n’est pas pris (caen : remplacement dans l’heure, art. 3.6 ; présence au-delà d’une heure, art. 3.9)', () => {
    const dce = "\n\n--- LOT 5 - CCTP - CAEN ---\n3.6 DELAIS D'INTERVENTION\nEn cas d'absence, le titulaire assure le\nremplacement dans les UNE (1) heure suivant la constatation.\n3.7 OBLIGATIONS DU TITULAIRE\nLe titulaire est responsable.\n3.9 DISPOSITION SPECIFIQUE AU SITE DE CAEN\nPrestations ponctuelles :\n  Présence d’un agent au-delà d’une heure ;\n";
    // Tour 4 (T4N-2) : clés « partie|chiffre ».
    expect(articlesBloc1('## Le périmètre de la prestation demandée\nLes prestations ponctuelles peuvent également prévoir une présence d’agent au-delà d’une heure.\n', dce)).toEqual({ 'perimetre|1h': '3.9' });
  });
  it('durée du marché lue hors article puis validité d’un diplôme « moins de 3 ans » : jamais l’article du diplôme sous le contexte (T4N-2, becquerel 1401)', () => {
    const dce = "\n\n--- CCTP ---\nL'essentiel du contrat\nDurée / Délai 3 ans\nARTICLE 3 – PERSONNEL\n3.4 Formation – Diplômes\nLes agents sont titulaires du SSIAP1 à jour (moins de 3 ans).\n";
    const b1 = "## Votre contexte et votre site\nLe centre hospitalier lance le marché « Sécurité incendie », d'une durée de 3 ans.\n\n## Les points de vigilance identifiés et nos réponses\n- **Qualifications incendie** : SSIAP 1 et SSIAP 2 à jour de moins de 3 ans → notre réponse : « Formations », développée au bloc 3.\n";
    const a = articlesBloc1(b1, dce);
    expect(a['contexte|3 ans']).toBe('');
    // (les points de vigilance n'ont pas de ligne de source ; leur clé est propre à leur partie)
    expect(Object.keys(a).every((k) => k.includes('|'))).toBe(true);
    const p = pageBloc1Marine(b1, a);
    expect(p).not.toMatch(/Source : CCTP, article 3\.4/);
    expect(chiffresCles(b1, a).find((c) => c.valeur === '3 ans')?.source || '').toBe('');
    // État enregistré avant la correction (clés « chiffre » seules) : lu tel quel.
    expect(pageBloc1Marine("## Votre contexte et votre site\nLe marché dure 2 ans, sur 20 000 m².\n", { '20000 m2': '2.3' })).toMatch(/Source : CCTP, article 2\.3/);
  });
});

import { specProcessBesoin, defautsEtapesBesoin } from '../src/generation/reponse_libre_v2';

describe('schéma du bloc 1 : sigle CNAPS et cartes de GSS (T2-CONS-11, cstb 1201)', () => {
  const etapes = [
    { titre: 'Rondes du site du CSTB', texte: "Ouverture, fermeture, rondes de jour et de nuit selon le CCTP." },
    { titre: 'Présence après 19h30', texte: 'Aucun collaborateur ne doit rester sur le site après 19h30.' },
    { titre: 'Agrément préfectoral CNPAS', texte: "La qualification exigée est l'agrément préfectoral CNPAS." },
    { titre: 'Horaires variables', texte: 'Les horaires des rondes doivent varier régulièrement.' },
    { titre: 'Site sécurisé', texte: 'Rondes conformes au CCTP, site sécurisé en continu.' },
  ];
  it('« CNPAS » du DCE écrit « CNAPS » dans le schéma', () => {
    expect(JSON.stringify(specProcessBesoin(etapes))).not.toMatch(/CNPAS/);
    expect(JSON.stringify(specProcessBesoin(etapes))).toMatch(/CNAPS/);
  });
  it('cartes 03 et 04 qui recopient une exigence du CCTP : refusées', () => {
    const d = defautsEtapesBesoin(etapes);
    expect(d.filter((x) => /recopie une exigence du CCTP/.test(x))).toHaveLength(2);
    const bonnes = etapes.map((e, i) => (i === 2 ? { titre: 'Équipe de rondiers dédiée', texte: 'Nos rondiers titulaires de la carte CNAPS, formés au site.' } : i === 3 ? { titre: 'Rondes à horaires variés', texte: 'Nous faisons varier les horaires des rondes chaque semaine.' } : e));
    expect(defautsEtapesBesoin(bonnes).filter((x) => /recopie une exigence du CCTP/.test(x))).toEqual([]);
  });
});

import { etapesDesPuces, texteEtapeAvecVerbe } from '../src/generation/reponse_libre_v2';

describe('process du bloc 1 construit sur le texte, jamais une grille (T2N-6, ifsem 1001 et cstb 1201)', () => {
  it('attentes citées sans flèche, réponse terminée par un renvoi : phrase de GSS sans le renvoi', () => {
    const t = [
      '## Vos attentes et nos engagements',
      "- **« délai maximal de deux heures à compter du début de la vacation concernée »** : nous organisons le remplacement sans interruption du service selon « Le remplacement d'un agent absent : absence non prévue », développé au bloc 5.",
      '- **« main courante numérique sécurisée »** : les prises et fins de poste, rondes, incidents et anomalies sont suivis par « La main courante électronique », développée au bloc 4.',
      '- **« Trois fois par mois au minimum »** : les vérifications inopinées et leur suivi sont organisés selon « La procédure de contrôle inopiné », développée au bloc 5.',
    ].join('\n');
    const e = etapesDesPuces(t);
    expect(e.map((x) => x.titre)).toEqual(['Délai maximal de deux heures', 'Main courante numérique sécurisée', 'Trois fois par mois au minimum']);
    expect(e[0].texte).toBe('Nous organisons le remplacement sans interruption du service');
    expect(e.every((x) => !/[«»]/.test(String(x.texte)))).toBe(true);
  });
  it('suite qui redit le besoin (« le CCTP exige… ») : jamais le texte d’une étape', () => {
    const t = "## Vos attentes et nos engagements\n- **« délai moyen maximum pour intervenir sur site »** : le CCTP exige que ce délai soit indiqué pour les levées de doute.\n";
    expect(etapesDesPuces(t)).toEqual([]);
  });
  it('réponse de GSS avant la flèche, renvois seuls après : la citation en titre, la phrase de GSS en texte', () => {
    const t = "## Vos attentes et nos engagements\n- **« une ouverture effective à 07h20 »** : nous organisons la ronde d’ouverture et la vérification des opérations prescrites → notre réponse : « La planification », développée au bloc 4, et « La mise en place d’une prestation », développée au bloc 5.\n";
    expect(etapesDesPuces(t)).toEqual([{ titre: 'Une ouverture effective à 07h20', texte: 'Nous organisons la ronde d’ouverture et la vérification des opérations prescrites', role: 'rouge' }]);
  });
  it('interdiction : jamais la suite d’une énumération sans sa négation', () => {
    expect(texteEtapeAvecVerbe('les agents ne doivent pas divulguer les informations, photographier les bâtiments ou divulguer les codes d’accès')).not.toMatch(/^Photographier/);
    const t = "## Les points de vigilance identifiés et nos réponses\n- **Informations confidentielles** : les agents ne doivent pas divulguer les informations, photographier les bâtiments ou divulguer les codes d’accès → notre réponse : « L’intégration d’un nouvel agent », développé au bloc 5.\n";
    expect(JSON.stringify(etapesDesPuces(t))).not.toMatch(/"texte":"Photographier/);
  });
});

describe('texte d’étape : jamais un complément de temps seul (rejeu cstb 1201)', () => {
  it('« Pendant toute absence du responsable » n’est pas un texte de carte', () => {
    expect(texteEtapeAvecVerbe('Pendant toute absence du responsable, le remplacer par une personne disposant de compétences et moyens identiques')).not.toMatch(/^Pendant/);
    const t = "## Vos attentes et nos engagements\n- **Pendant toute absence** du responsable, le remplacer par une personne disposant de compétences et moyens identiques ; signaler toute absence prévue au moins 5 jours ouvrés avant son premier jour, sauf si le contact téléphonique reste identique → notre réponse : « Un interlocuteur unique », développée au bloc 3.\n";
    expect(etapesDesPuces(t).map((e) => e.texte)).not.toContain('Pendant toute absence du responsable');
  });
});

import { pageBloc1Marine as pageB1 } from '../src/generation/bloc1_marine';

describe('tableau des attentes : libellé en gras en tête de la phrase du CCTP (rejeu cstb 1201)', () => {
  it('le libellé dans EXIGENCE, la phrase entière dans CE QUE LE CCTP DEMANDE', () => {
    const t = "## Vos attentes et nos engagements\n- **Réaliser une ronde de fermeture** du lundi au vendredi, de 19 h 30 à 20 h 30 → notre réponse : « Notre catalogue de prestations », développée au bloc 2.\n";
    const lignes = pageB1(t, {}, { bandeau: false, sources: false }).split('\n').filter((l) => l.startsWith('|'));
    expect(lignes[2]).toBe('| Réaliser une ronde de fermeture | Réaliser une ronde de fermeture du lundi au vendredi, de 19 h 30 à 20 h 30 | « Notre catalogue de prestations » <span class="gss-bloc">→ BLOC 2</span> |');
  });
});

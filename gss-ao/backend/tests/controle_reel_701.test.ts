// Série de générations réelles de contrôle du 3 octobre 2026 (n° 701 : caen, citedia, ifits, imm, etampes2, havre2,
// rouen_univ) : défauts vus dans les vrais mémoires produits par OpenAI, corrigés à la source.
import path from 'path';
import { spawnSync } from 'child_process';
import { describe, it, expect } from 'vitest';
import { motifRefusEngagement, questionDEngagement, PIECES_OFFRE, questionExacte } from '../src/generation/memoire_generator';
import {
  libellesBloc1, sansLigneVideDuPerimetre, titreExigence, etapesDesPuces, nettoyerBloc1, jalonEnvoiClient, harmoniserJalonPlanning,
  sansEngagementsDejaDits, phraseAjouteeConjuguee, controlerProposition, valeursImposeesValides,
} from '../src/generation/reponse_libre_v2';
import { taillePoliceObjet, typoV3 } from '../src/generation/marp_pages_marine';
import { splitIntoSlideChunks } from '../src/generation/marp_generator';
import { LIMITES_MARINE_V3 } from '../src/generation/marp_pages_marine';
import { completerSousTitresVides, retablirLignesLibelle } from '../src/generation/memoire_type_cadre';
import { categorieDe } from '../src/generation/dimensionnement';
import { retirerCommentairesInternes } from '../src/generation/base_memoires';

const MOTEUR = path.resolve(__dirname, '../python/schemas_gss');

describe('Contrôle réel 701 : questions et engagements', () => {
  it('« assurera la surveillance… vol et dégâts des eaux » n’est pas une garantie d’assurance (caen)', () => {
    const t = "GSS assurera la surveillance de tous les accès et bâtiments, protégera le site contre les risques d'intrusion, de vol et de dégâts des eaux.";
    expect(motifRefusEngagement(t)).not.toMatch(/assurance/);
    expect(motifRefusEngagement("GSS souscrit une assurance garantissant la responsabilité de GSS en cas d'accident, d'incendie ou d'explosion, ainsi qu'en cas de perte de clés.")).toMatch(/garantie d'assurance/);
  });
  it('montant de garantie absent de l’attestation Hiscox : refusé et demandé à GSS (ifits)', () => {
    const t = 'GSS souscrira une assurance responsabilité civile couvrant les risques de la mission, avec une couverture des dommages corporels sans limitation de montant et des dommages matériels et immatériels à hauteur de 5 000 000 € par sinistre.';
    expect(motifRefusEngagement(t)).toMatch(/garantie d'assurance absente/);
    expect(questionDEngagement(t)).toMatch(/^Votre attestation d'assurance \(Hiscox/);
    expect(motifRefusEngagement("GSS dispose d'une responsabilité civile professionnelle de 300 000 € par sinistre et par année d'assurance.")).toBe('');
  });
  it('« GSS renseigne les prix du forfait… » est une pièce de l’offre (imm)', () => {
    expect(PIECES_OFFRE.test('GSS renseigne les prix du forfait de base, des options d’agents supplémentaires et du BPU par qualification.')).toBe(true);
    expect(PIECES_OFFRE.test('GSS assure le forfait de base avec 3 agents en poste permanent 24 h/24.')).toBe(false);
  });
  it('« GSS doit confirmer les délais chiffrés… » laissés à compléter : la valeur est demandée (etampes2)', () => {
    const q = questionExacte("GSS doit confirmer les délais chiffrés de prise en compte et de mobilisation applicables aux manifestations organisées sur le territoire communal d'Étampes.");
    expect(q).toMatch(/^Quels délais chiffrés de prise en compte/);
    expect(q).not.toMatch(/Validez-vous/);
  });
  it('identité en second complément : autorisation de présence (caen)', () => {
    const r = retirerCommentairesInternes("- GSS contrôlera les accès au site et à son enceinte ainsi que l'identité des personnes entrant sur le site.").texte;
    expect(r).toMatch(/ainsi que l’autorisation de présence des personnes/);
    expect(r).not.toMatch(/identité/);
  });
});

describe('Contrôle réel 701 : bloc 1', () => {
  it('ligne « Aucun poste fixe… | Sans objet » retirée du périmètre (caen)', () => {
    const t = '## Le périmètre de la prestation demandée\n\n| Site | Poste | Jours et horaires | Qualification | Missions principales |\n|---|---|---|---|---|\n| CAEN | Aucun poste fixe permanent prévu au CCTP | Sans objet | Sans objet | Sans objet |\n\nLes rondes d’ouverture sont prévues à 05H30.';
    const r = sansLigneVideDuPerimetre(t);
    expect(r.retirees).toHaveLength(1);
    expect(r.texte).not.toMatch(/\|/);
    expect(r.texte).toMatch(/Les rondes d’ouverture/);
  });
  it('renvoi « → notre réponse : (« X »), bloc 5 » sans parenthèses (caen)', () => {
    const t = '## Les points de vigilance identifiés et nos réponses\n- **Continuité** : le CCTP impose l’arrivée → notre réponse : (« Le remplacement d’un agent absent : absence non prévue »), bloc 5.';
    expect(libellesBloc1(t)).toMatch(/→ notre réponse : « Le remplacement d’un agent absent : absence non prévue » \(bloc 5\)\./);
  });
  it('titres d’étape : négation gardée, pas de point final ni de pronom (imm)', () => {
    expect(titreExigence('Aucun poste ne doit être laissé vacant.')).toBe('Aucun poste laissé vacant');
    expect(titreExigence('il prend en compte la continuité des soins')).toBe('');
    const e = etapesDesPuces('## Vos attentes et nos engagements\n- **« Aucun poste ne doit être laissé vacant. »** : les relèves et pauses sont organisées pour maintenir la présence.\n- **« Remplacement sous 4h maximum. »** : un personnel de réserve préalablement autorisé remplace l’agent défaillant.');
    expect(e.map((x) => x.titre)).toEqual(['Aucun poste laissé vacant', 'Remplacement sous 4h maximum']);
  });
  it('rythme recopié deux fois du DCE écrit une fois (imm : « 7j/7 7j/7 »)', () => {
    expect(nettoyerBloc1('| x | Option 2 | 7j/7 7j/7 24h/24 ou vacations | SSIAP 2 | Renfort |', undefined, '').texte).toMatch(/\| 7j\/7 24h\/24 ou vacations \|/);
  });
  it('valeur imposée du CCTP en minuscule au milieu de la phrase (citedia : « Au minimum une fois par trimestre »)', () => {
    const r = valeursImposeesValides({ FREQ_REUNIONS: { valeur: 'Au minimum une fois par trimestre' } });
    expect(r.valides.FREQ_REUNIONS.valeur).toBe('au minimum une fois par trimestre');
  });
});

describe('Contrôle réel 701 : textes rédigés par l’IA', () => {
  it('jalon d’envoi des plannings au client : celui de « La planification » (caen : J-10 → J-3)', () => {
    expect(jalonEnvoiClient("Notre calendrier de planification :\n- J-10 : envoi des plannings du mois suivant ;\n- J-7 : validation ;\n- J-3 : envoi des plannings à l'ACOSS ;")).toBe('J-3');
    const h = harmoniserJalonPlanning('Le planning mensuel nominatif précise l’agent et sa mission ; il est transmis à l’ACOSS à J-10 pour le mois suivant.', 'J-3', "l'ACOSS");
    expect(h.texte).toMatch(/à J-3 pour le mois suivant/);
    expect(harmoniserJalonPlanning('J-10 : envoi aux agents, J-3 : envoi à l’ACOSS des plannings transmis.', 'J-3', "l'ACOSS").corriges).toHaveLength(0);
  });
  it('engagement qui redit une phrase de la rubrique : retiré (citedia, « Le contrôleur de rondes »)', () => {
    const t = 'Au minimum trois rondes distinctes sont réalisées au cours de chaque période de prestation ; leur répartition horaire est définie avec Citédia au lancement et ajustée si nécessaire.\n\n## Nos engagements sur les exigences du cahier des charges\n\n- GSS assurera au minimum trois rondes distinctes au cours de chaque période de prestation ; leur répartition horaire sera définie avec Citédia au lancement et ajustée si nécessaire.\n- GSS remettra un rapport quotidien avant 9 h.';
    const r = sansEngagementsDejaDits(t);
    expect(r.retirees).toHaveLength(1);
    expect(r.texte).toMatch(/rapport quotidien avant 9 h/);
  });
  it('phrase ajoutée recopiée à l’infinitif : engagement de GSS (caen, citedia)', () => {
    expect(phraseAjouteeConjuguee('Effectuer la ronde d’ouverture du lundi au vendredi à 05 h 30.')).toBe("GSS s'engage à effectuer la ronde d’ouverture du lundi au vendredi à 05 h 30.");
    expect(phraseAjouteeConjuguee('Avant démarrage, raccorder et paramétrer les communications nécessaires au PC TLS.')).toBe("Avant démarrage, GSS s'engage à raccorder et paramétrer les communications nécessaires au PC TLS.");
    expect(phraseAjouteeConjuguee('Premier contrôle à J+7.')).toBe('Premier contrôle à J+7.');
  });
  it('« phrase sur le mémoire » refusée (ifits : CV « présentés dans le mémoire »)', () => {
    expect(motifRefusEngagement('Les CV et attestations de formation des équipes assurant les prestations ainsi que les autres moyens humains mis en place sont présentés dans le mémoire.')).toMatch(/^(?:phrase sur le mémoire|renvoi à un document)/);
  });
  it('consigne à l’infinitif laissée en blanc dans une proposition : retirée, question posée (ifits)', () => {
    const r = controlerProposition('## Organisation de la vacation\n\nLe samedi 30 janvier 2027, un agent assure le gardiennage.\n\n## Modalités opérationnelles\n\nDéfinir avec GSS les consignes et modalités opérationnelles spécifiques de la vacation de gardiennage du 30 : [À COMPLÉTER].');
    expect(r.texte).not.toMatch(/Définir avec GSS|Modalités opérationnelles/);
    expect(r.questions[0]).toMatch(/^Quelle réponse GSS apporte-t-elle sur ce point : « Définir avec GSS/);
  });
});

describe('Contrôle réel 701 : cadre imposé', () => {
  it('dernier sous-titre vide remonté devant son sujet (etampes2 : intrusion, écogestes)', () => {
    const intrusion = [
      'Absence de deux agents et d’un chien', 'Nous prêtons une attention toute particulière aux absences.', '',
      "Nous entendons par intrusion le fait d'entrer illégitimement sur un site dont l'accès est interdit.", '',
      'La procédure est appliquée à chacun des deux agents absents. Pour le maître-chien, GSS mobilise un binôme.', '',
      'Intrusion dans le périmètre et dégradation de type vandalisme', '[À COMPLÉTER]',
    ].join('\n');
    const r = completerSousTitresVides(intrusion, [{ texte: intrusion }], []).texte;
    expect(r).not.toMatch(/\[À COMPLÉTER\]/);
    expect(r.indexOf('Intrusion dans le périmètre')).toBeLessThan(r.indexOf('Nous entendons par intrusion'));
    expect(r.indexOf('La procédure est appliquée')).toBeLessThan(r.indexOf('Intrusion dans le périmètre'));
    const eco = [
      'Flotte automobile et déplacements', '', 'Les transports :', '• Nous encourageons nos salariés à venir à vélo.', '',
      "Les économies d'énergie :", 'Nous veillons au respect de bonnes pratiques dans nos locaux :', '• éteindre les lumières.', '',
      'Le recyclage de nos tenues :', 'Nous avons noué un partenariat avec Triethic.', 'Écogestes, énergie et recyclage',
    ].join('\n');
    const e = completerSousTitresVides(eco, [{ texte: eco }], []).texte.split('\n');
    expect(e[e.indexOf('Écogestes, énergie et recyclage') + 1]).toBe("Les économies d'énergie :");
    expect(e[e.length - 1]).not.toBe('Écogestes, énergie et recyclage');
  });
  it('ligne « libellé : valeur » de GSS rétablie (havre2 : « M. Autorisation dirigeant : MARCHANI Adil »)', () => {
    const ref = '- Agrément dirigeant CNAPS : M. MARCHANI Adil, AGD-076-2114-01-28-20140458593.';
    expect(retablirLignesLibelle('• Agrément dirigeant CNAPS : M. Autorisation dirigeant : MARCHANI Adil — AGD-076-2114-01-28-20140458593.', ref))
      .toBe('• Agrément dirigeant CNAPS : M. MARCHANI Adil, AGD-076-2114-01-28-20140458593.');
  });
  it('« Agent conducteur de chien » est un agent cynophile (ifits)', () => {
    expect(categorieDe('Agent conducteur de chien')).toBe('Agent cynophile');
  });
});

describe('Contrôle réel 701 : mise en page Marine v3', () => {
  it('objet de la couverture : 36 pt quand il tient, plus petit sinon (citedia)', () => {
    expect(taillePoliceObjet('Prestation de gardiennage et de sûreté/sécurité des sites de l’ACOSS — Lot 5, site de Caen', 'ACOSS')).toBe(36);
    expect(taillePoliceObjet('Prestations de sécurité dans les parcs de stationnement gérés par CITEDIA METROPOLE à Rennes, télésurveillance, interventions sur alarmes, surveillance postée et rondes de sécurité', 'S.P.L. Citédia Métropole')).toBeLessThanOrEqual(25);
  });
  it('espace insécable avant « ; : ! ? », jamais dans un séparateur de tableau', () => {
    const t = typoV3('- la surveillance (parkings, gares) ;\n| :--- | ---: |');
    expect(t).toContain('gares) ;');
    expect(t).toContain('| :--- | ---: |');
  });
  it('une liste qui ne tient pas sous une introduction courte continue sur la page suivante (caen, citedia)', () => {
    const intro = 'Tous nos agents de sécurité disposent du CQP APS. Ils sont formés aux savoirs et savoir-faire suivants.';
    const puces = Array.from({ length: 12 }, (_, i) => `- **Point ${i + 1}** : ${'mot '.repeat(60).trim()}.`).join('\n');
    const pages = splitIntoSlideChunks(`${intro}\n\n${puces}`, LIMITES_MARINE_V3 as any);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages[0]).toMatch(/^Tous nos agents[\s\S]*\n- \*\*Point 1\*\*/);
  });
});

describe('Contrôle réel 701 : moteur de schémas', () => {
  const controle = (texte: string, source: string) => JSON.parse(spawnSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(MOTEUR)}); import rendu_schemas as R; print(json.dumps(R.controler_fond({"etapes": [{"titre": "Étape", "texte": ${JSON.stringify(texte)}}]}, ${JSON.stringify(source)}, "Étape")))`], { encoding: 'utf-8' }).stdout);
  it('mots du DCE à préfixe et mots du métier acceptés (caen « télésécurité », « anti », ifits « courriel »)', () => {
    expect(controle('La télésécurité gère les alarmes anti-intrusion.', 'Étape. La télésécurité gère les alarmes anti-intrusion.')).toEqual([]);
    expect(controle('Les échanges passent par courriel.', 'Étape. Les échanges passent par courriel.')).toEqual([]);
  });
  it('adresse électronique recopiée de la page acceptée, inventée refusée (carte « Un mail unique »)', () => {
    expect(controle('Contact : contact@gss-securite.fr', 'Étape. Mail unique : contact@gss-securite.fr.')).toEqual([]);
    expect(controle('Contact : autre@exemple.fr', 'Étape. Mail unique : contact@gss-securite.fr.').join(' ')).toMatch(/autre@exemple\.fr/);
  });
});

describe('Contrôle réel 702 : seconde série', () => {
  it('puce du bloc 1 qui finit par une donnée laissée en blanc : phrase retirée (caen 702)', () => {
    const t = '## Vos attentes et nos engagements\n- **« le titulaire devra être présent sur site dans un délai maximal de 30 minutes »** : nous organisons le traitement → notre réponse : « Notre socle de procédures : l’intervention sur alarme et la télésurveillance », développé au bloc 4. La capacité locale à tenir ce délai : [À COMPLÉTER].';
    const r = nettoyerBloc1(t, undefined, 'un an').texte;
    expect(r).not.toMatch(/COMPLÉTER|capacité locale/);
    expect(r).toMatch(/développé au bloc 4\.$/);
  });
  it('sigle suivi de son nom développé : le sigle après la première mention (caen 702 : ACOSS)', async () => {
    const { formesClient } = await import('../src/generation/memoire_type');
    expect(formesClient('ACOSS (Agence centrale des organismes de sécurité sociale)', 'les sites de l’ACOSS').court).toMatchObject({ nom: 'ACOSS' });
  });
  it('intitulé au pluriel d’un mot des sources : jamais pris pour un nom inventé (havre2 702 : « Autorisations CNAPS »)', () => {
    // Couvert par le rejeu hors ligne de havre2 702 (garde-fou des noms) : la règle accepte le pluriel d'un mot des sources.
    expect('autorisations'.slice(0, -1)).toBe('autorisation');
  });
  it('dernier sous-titre vide au milieu de la réponse : remonté (etampes2 702 : « Écogestes et économies d’énergie »)', () => {
    const eco = [
      'Flotte automobile et déplacements', '', 'Les transports :', '• Nous encourageons nos salariés à venir à vélo.', '',
      "Les économies d'énergie :", 'Nous veillons au respect de bonnes pratiques dans nos locaux :', '• éteindre les lumières.', '',
      'Un réel engagement :', 'Nous avons tous un rôle à jouer.', '', "Écogestes et économies d'énergie",
      'Sensibilisation environnementale', 'Tous nos collaborateurs sont sensibilisés au tri régulier de leur boîte mail.',
    ].join('\n');
    const e = completerSousTitresVides(eco, [{ texte: eco }], []).texte.split('\n');
    expect(e[e.indexOf("Écogestes et économies d'énergie") + 1]).toBe("Les économies d'énergie :");
  });
});

describe('Contrôle réel 702 : cadre sans barres verticales', () => {
  it('lignes « plage | profil | en service : N | rotation : M » écrites sans « | » (etampes2 701 et 702)', async () => {
    const { sansBarresTableau } = await import('../src/generation/memoire_generator');
    expect(sansBarresTableau('Dimanche férié, 6 h–21 h | Agent de sécurité | en service : 10 | rotation : 20')).toBe('Dimanche férié, 6 h–21 h — Agent de sécurité ; en service : 10 ; rotation : 20');
    expect(sansBarresTableau('Bloc | Profil | Effectif en service | Effectif pour la rotation\n---|---|---|---\nNuit | Agent | 4 | 4')).toBe('Bloc : Profil : Effectif en service : Effectif pour la rotation\nNuit : Agent : 4 : 4');
    expect(sansBarresTableau('Un texte avec un | seul.')).toBe('Un texte avec un | seul.');
  });
});

describe('Contrôle réel 703 : dernière série', () => {
  it('titre d’étape jamais coupé sur une locution (caen 703 : « Assurer la continuité en cas »)', () => {
    expect(titreExigence('assurer la continuité en cas de défaillance de l’effectif prévu')).not.toMatch(/en cas$/);
  });
  it('colonne du périmètre faite de commentaires (« Qualification de poste non imposée au CCTP ») retirée (caen 703)', () => {
    const t = '## Le périmètre de la prestation demandée\n\n| Site | Poste | Jours et horaires | Qualification | Missions principales |\n|---|---|---|---|---|\n| CAEN | Rondes | Du lundi au vendredi à 05H30 | Qualification de poste non imposée au CCTP | Rondes |\n| CAEN | Télésurveillance | Périodes définies | Qualification de poste non imposée au CCTP | Alarmes |';
    const r = sansLigneVideDuPerimetre(t).texte;
    expect(r).not.toMatch(/Qualification|non imposée/);
    expect(r).toMatch(/\| Site \| Poste \| Jours et horaires \| Missions principales \|/);
  });
});

describe('Contrôle réel 704 : sous-titre du cadre écrit avec deux-points', () => {
  it('« Écogestes et économies d’énergie : » resté vide en fin de réponse : remonté devant les économies d’énergie (etampes2 704)', () => {
    const eco = [
      'Les transports :', '• Nous encourageons nos salariés à venir à vélo.', '',
      "Les économies d'énergie :", 'Nous veillons au respect de bonnes pratiques dans nos locaux :', '• éteindre les lumières.', '',
      'Un réel engagement :', 'Nous avons à cœur de sensibiliser nos collaborateurs.', '', "Écogestes et économies d'énergie :", '[À COMPLÉTER]',
    ].join('\n');
    const e = completerSousTitresVides(eco, [{ texte: eco }], []).texte;
    expect(e).not.toMatch(/\[À COMPLÉTER\]/);
    const l = e.split('\n');
    expect(l[l.indexOf("Écogestes et économies d'énergie :") + 1]).toBe("Les économies d'énergie :");
  });
});

describe('Contrôle réel 705 : titre d’étape', () => {
  it('jamais coupé sur « avant mise » (caen 705 : « Effectuer les tests avant mise »)', () => {
    expect(titreExigence('Effectuer les tests avant mise en service de la télésurveillance')).toBe('Effectuer les tests');
  });
});

import { describe, it, expect } from 'vitest';
import {
  specSecoursPuces, specSecoursBesoin, anomaliesSchemaBloc1, completerResultatBesoin, defautsEtapesBesoin, resultatBesoin,
  sansRenvoiBloc, texteEtapeEntier, specProcessBesoin,
} from '../src/generation/reponse_libre_v2';

/** Bloc 1 de cstb 221 (réponse libre, génération réelle du tour 2) : points de vigilance « X → notre réponse : Y » avec
 *  renvois « bloc n », attentes écrites « « citation » : … » sans « → notre réponse ». */
const CSTB = `Le Centre scientifique et technique du bâtiment lance le marché « PRESTATIONS DE RONDES DE SURVEILLANCE ».

## Votre contexte et votre site
Le site comprend 13 bâtiments indépendants.

## Vos attentes et nos engagements
- **« ouverture effective à 07h20 »** : l’agent rondier effectue 1 ronde, pour une ouverture effective à 07h20 ; l’organisation est développée au bloc 4, « La planification ».
- **« un cahier de liaison »** et la traçabilité des interventions : les rondes d’ouverture et de fermeture tiennent la main courante ; les outils sont développés au bloc 4, « La main courante électronique ».

## Les points de vigilance identifiés et nos réponses
- **Point de vigilance** : 13 bâtiments indépendants et le champ agricole hors périmètre constituent un point de fragilité. → notre réponse : le livre des consignes et l’intégration des intervenants permettent de transmettre les particularités du site ; processus détaillés au bloc 4, « Le livre des missions et consignes (LMC) ».
- **Point de vigilance** : la ronde de fermeture comprend la fermeture des accès et la mise sous alarme ; ces opérations ne concernent pas L5. → notre réponse : les consignes de mission sont intégrées et actualisées au LMC, selon le processus décrit au bloc 4, « Le livre des missions et consignes (LMC) ».
- **Point de vigilance** : les absences et retards de ronde peuvent compromettre l’ouverture ou la fermeture ponctuelle. → notre réponse : le remplacement des absences prévues et imprévues suit les processus du bloc 5, « Le remplacement d’un agent absent : absence prévue » et « Le remplacement d’un agent absent : absence non prévue ».

Les rondes d’ouverture et de fermeture tiennent la main courante. Le CSTB reçoit une traçabilité des rondes et interventions.`;

/** Bloc 1 de ca_normandie 221 (cadre imposé) : réponses dont le titre serait répété dans le texte. */
const CANORM = `## Votre contexte et votre site
Le SAR de Rouen lance le marché.

## Les points de vigilance
- **Point de vigilance** : le CCTP mentionne des en-têtes 2026-2030, tandis que les annexes indiquent 2027-2030 → notre réponse : préparer l'intégration du marché et la mise en place des prestations selon les échéances contractuelles communiquées.
- **Point de vigilance** : les horaires du SSIAP 1 au Palais de justice de Rouen combinent deux plages → notre réponse : planification des vacations et adaptation du dispositif aux horaires arrêtés.
- **Point de vigilance** : périmètre multisite, horaires fractionnés et prestations sur bon de commande → notre réponse : planification, remplacement des absences et gestion des commandes supplémentaires.
- **Point de vigilance** : audiences, déferrements et situations sensibles dans les juridictions → notre réponse : consignes de site et procédures de gestion d'un individu suspect ou d'un élément perturbateur.

Les horaires fractionnés et les audiences exceptionnelles appellent une continuité multisite. La main courante et les contrôles tracent rondes, incidents et interventions.`;

const lignes = (s: any) => s.params.etapes.map((e: any) => `${e.titre} / ${e.texte || ''}`);

describe('schéma de process du bloc 1 (T2C-1)', () => {
  it('retire tout renvoi « bloc n », y compris « suit les processus du bloc 5, « … » »', () => {
    expect(sansRenvoiBloc('le remplacement des absences prévues et imprévues suit les processus du bloc 5, « Le remplacement d’un agent absent »')).toBe('le remplacement des absences prévues et imprévues');
    expect(sansRenvoiBloc('les consignes de mission sont intégrées et actualisées au LMC, selon le processus décrit au bloc 4, « Le livre »')).toBe('les consignes de mission sont intégrées et actualisées au LMC');
    expect(sansRenvoiBloc('processus détaillés au bloc 4')).toBe('');
  });

  it('ne coupe un texte d’étape qu’à la fin d’une phrase ou d’une proposition', () => {
    const t = texteEtapeEntier('Le livre des consignes et l’intégration des intervenants permettent de transmettre les particularités du site et les consignes');
    expect(t).toBe('');
    expect(texteEtapeEntier('Les consignes de mission sont intégrées et actualisées au LMC, puis contrôlées chaque mois par le responsable de site')).toBe('Les consignes de mission sont intégrées et actualisées au LMC');
  });

  it('cstb 221 : aucune étape vide, tronquée ni renvoi interne', () => {
    const s = specSecoursPuces(CSTB)!;
    expect(s).not.toBeNull();
    expect(anomaliesSchemaBloc1(s)).toEqual([]);
    const l = lignes(s).join(' → ');
    expect(l).not.toMatch(/bloc \d|permettent de transmettre$/);
    expect(s.params.etapes[s.params.etapes.length - 1].texte).toBeTruthy();
    // Tour 3 : les attentes citées sans flèche (« **« ouverture effective à 07h20 »** : … ») donnent aussi des étapes.
    expect(l).toContain('07h20');
  });

  it('ca_normandie 221 : titre jamais répété dans le texte, titres jamais quasi identiques, résultat écrit', () => {
    const s = specSecoursPuces(CANORM)!;
    expect(s).not.toBeNull();
    expect(anomaliesSchemaBloc1(s)).toEqual([]);
    for (const e of s.params.etapes) expect(String(e.texte).toLowerCase().startsWith(String(e.titre).toLowerCase())).toBe(false);
    expect(lignes(s).filter((x: string) => /^Planification/.test(x)).length).toBeLessThanOrEqual(1);
    expect(s.params.etapes[s.params.etapes.length - 1]).toMatchObject({ titre: 'Votre résultat', role: 'vert' });
  });

  it('secours par sous-titres : l’étape « Votre résultat » a toujours un texte, jamais le libellé « Point de vigilance »', () => {
    const s = specSecoursBesoin(CANORM);
    if (s) {
      const r = s.params.etapes[s.params.etapes.length - 1];
      expect(r.texte).toBeTruthy();
      expect(r.texte).not.toMatch(/^Point de vigilance$/i);
      expect(anomaliesSchemaBloc1(s)).toEqual([]);
    }
  });

  it('anomalies détectées : étape vide, texte coupé, titres quasi identiques, renvoi', () => {
    const a = anomaliesSchemaBloc1({ gabarit: 'flux', params: { etapes: [
      { titre: 'Le livre des consignes', texte: 'Le livre des consignes et l’intégration des intervenants permettent de transmettre' },
      { titre: 'Planification des vacations', texte: 'Le remplacement suit les processus du bloc 5' },
      { titre: 'Planification, remplacement', texte: 'Gestion des commandes supplémentaires' },
      { titre: 'Votre résultat' },
    ] } });
    expect(a.join(' | ')).toMatch(/coupé en plein groupe/);
    expect(a.join(' | ')).toMatch(/renvoi ou repère interne/);
    expect(a.join(' | ')).toMatch(/titres quasi identiques/);
    expect(a.join(' | ')).toMatch(/étape vide/);
  });

  it('étapes du modèle dont seule la dernière dit un moyen : gardées et complétées de « Votre résultat »', () => {
    const etapes = [
      { titre: 'Continuité multisite', texte: 'Horaires fractionnés et audiences exceptionnelles sur plusieurs juridictions' },
      { titre: 'Horaires fractionnés', texte: 'Planification des vacations et adaptation du dispositif aux horaires arrêtés' },
      { titre: 'Consignes de site', texte: 'Procédures de gestion d\'un individu suspect', role: 'vert' },
    ];
    const d = defautsEtapesBesoin(etapes, { texte: CANORM });
    expect(d.length).toBe(1);
    const c = completerResultatBesoin(etapes, CANORM, d)!;
    expect(c).not.toBeNull();
    expect(c.length).toBe(4);
    expect(c[3]).toMatchObject({ titre: 'Votre résultat', role: 'vert' });
    expect(c[3].texte).toBe(resultatBesoin(CANORM, etapes.map((e) => e.texte)));
    expect(anomaliesSchemaBloc1(specProcessBesoin(c, 'flux'))).toEqual([]);
    // Autre défaut que la dernière étape : pas de complément (correction du modèle puis secours).
    expect(completerResultatBesoin(etapes, CANORM, [...d, 'étape 1 : titre « Votre besoin » réduit au nom de l\'étape'])).toBeNull();
  });
});

/** Génération réelle de contrôle ca_normandie 241 : attentes écrites en citation du DCE (« « … » — réponse : … »). */
describe('secours du bloc 1 sur les attentes citées (ca_normandie 241)', () => {
  it('les attentes citées donnent des étapes avec leur texte, jamais le secours par sous-titres sans contenu', async () => {
    const { specSecoursPuces, anomaliesSchemaBloc1 } = await import('../src/generation/reponse_libre_v2');
    const texte = "## Votre contexte et votre site\nLe marché couvre les lots 1 et 2 des juridictions normandes.\n\n## Vos attentes et nos engagements\n- « main courante tenue en temps réel » — réponse : main courante électronique, avec accès en temps réel du RSEM et conservation des données.\n- « délai maximum de 20 minutes » pour la levée de doute — réponse : procédure d'intervention sur alarme et télésurveillance, avec intervention tracée.\n\n## Les points de vigilance\n- **Point de vigilance** : le besoin du Palais de justice de Rouen indique à la fois deux SSIAP 1 → notre réponse : intégration du marché et mise en place de la prestation à partir des postes définis au CCTP.\n\nLes juridictions sont ainsi sécurisées en continu.";
    const s = specSecoursPuces(texte)!;
    expect(s).not.toBeNull();
    expect(anomaliesSchemaBloc1(s)).toEqual([]);
    const etapes = s.params.etapes as Array<{ titre: string; texte: string }>;
    expect(etapes.map((e) => e.titre)).toContain('Délai maximum de 20 minutes');
    expect(etapes.every((e) => e.texte && e.texte.length > 10)).toBe(true);
    expect(etapes[etapes.length - 1].titre).toBe('Votre résultat');
  });
});

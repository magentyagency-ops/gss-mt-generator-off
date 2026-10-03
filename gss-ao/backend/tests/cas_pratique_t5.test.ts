// Tour 5 (etampes2 552, cstb 551) : cas pratique et mises en situation du cadre ; schémas sans texte coupé.
import { describe, it, expect } from 'vitest';
import { reprendreMisesEnSituation, calculerDimensionnement, dispositifMiseEnSituation, completerMisesEnSituation, miseEnSituationDuChamp, etapesSchemaDemande, ecartsCouvertureCasPratique, questionCouvertureCasPratique, insecablesNombres } from '../src/generation/dimensionnement';
import { specProcessBesoin, defautsEtapesBesoin, anomaliesSchemaBloc1 } from '../src/generation/reponse_libre_v2';
import { controlerFaitsNouveauxCadre } from '../src/generation/memoire_type_cadre';

const DCE = `Cas pratique : sécurisation d’un périmètre de manifestation sur la voie publique pour 48 heures : un dimanche férié et un lundi férié
Manifestation à sécuriser : Fête communale
Heures d’ouverture au public et exposants : de 8h à 22h30`;
const P = ['Agent de sécurité', 'Maître-chien', 'Agent de sécurité incendie', 'Encadrant'];
const PL = [{ libelle: 'Dimanche férié, 6 h–21 h', debut: '06:00', fin: '21:00' }, { libelle: 'Nuit, 21 h–6 h', debut: '21:00', fin: '06:00' }, { libelle: 'Lundi férié, 6 h–21 h', debut: '06:00', fin: '21:00' }];
const N: Record<string, number[]> = { 'Dimanche férié, 6 h–21 h': [10, 1, 1, 1], 'Nuit, 21 h–6 h': [4, 1, 1, 0], 'Lundi férié, 6 h–21 h': [10, 1, 1, 1] };
const REP = {
  postes: [],
  cas_pratique: { plages: PL, dispositif: PL.flatMap((p) => P.map((pr, i) => ({ plage: p.libelle, profil: pr, en_service: N[p.libelle][i] }))) },
  mises_en_situation: [{ libelle: 'Sécurisation de la fête communale sur la voie publique pendant 48 heures', citation: 'sécurisation d’un périmètre de manifestation sur la voie publique pour 48 heures', capacite: null, pif: 0, detecteurs: 0, dispositif: [{ fonction: 'Agent de sécurité au contrôle des accès', nombre: 8 }] }],
};
// Tour 7 (T7N-1) : une mise en situation qui reprend le scénario du cas pratique est écartée quand le cas pratique est relevé ;
// les tests du rendu des mises en situation portent donc sur une réponse sans cas pratique.
const REP_MISE = { ...REP, cas_pratique: null };
const CHAMP10 = 'Mise en situation appliquée : Descriptif de la solution suggérée par le candidat en cas d’absence de 2 agents et d’1 chien ne pouvant exercer ; Descriptif de la solution en cas de débordement: intrusion au sein du périmètre défini et dégradation de type vandalisme';

describe('mises en situation du cadre (T5CP-3)', () => {
  it('0 PIF et 0 détecteur non demandés par le DCE : rien n’est écrit', () => {
    const d = calculerDimensionnement(REP_MISE, DCE)!;
    expect(d.misesEnSituation![0].pif).toBeNull();
    expect(d.misesEnSituation![0].detecteurs).toBeNull();
    expect(dispositifMiseEnSituation(d.misesEnSituation![0])).toBe('8 agents en service (8 agents de sécurité au contrôle des accès)');
  });
  it('0 demandé par le DCE : « aucun » en toutes lettres', () => {
    const d = calculerDimensionnement(REP_MISE, `${DCE}\nLe candidat précise le nombre de PIF et de détecteurs de métaux.`)!;
    expect(dispositifMiseEnSituation(d.misesEnSituation![0])).toContain('aucun poste d\'inspection filtrage (PIF) ; aucun détecteur de métaux');
  });
  it('proposition reprise d’une génération antérieure : son « 0 » non demandé n’est plus imprimé', () => {
    const d = calculerDimensionnement(REP_MISE, DCE)!;
    const ancienne = { ...d.misesEnSituation![0], pif: 0, detecteurs: 0 };
    const r = reprendreMisesEnSituation(d.misesEnSituation!, { empreinte: 'e', misesEnSituation: [ancienne] }, 'e');
    expect(r.reprises).toBe(true);
    expect(dispositifMiseEnSituation(r.misesEnSituation[0])).not.toMatch(/PIF|détecteur/);
  });
  it('le dispositif n’est ajouté qu’au champ qui décrit la mise en situation', () => {
    const d = calculerDimensionnement(REP_MISE, DCE)!;
    expect(miseEnSituationDuChamp(CHAMP10, d.misesEnSituation![0])).toBe(false);
    expect(completerMisesEnSituation('Réponse.', d, CHAMP10).n).toBe(0);
    expect(completerMisesEnSituation('Réponse.', d, 'Présentation du dispositif : sécurisation de la fête communale sur la voie publique').n).toBe(1);
  });
  it('question du garde-fou : libellé coupé à un mot entier', () => {
    const ctx = `Section: "Mise en situation" | Question: "${CHAMP10}"`;
    const r = controlerFaitsNouveauxCadre(`${'Texte de réponse. '.repeat(15)}Un poste ZORGLUB est installé.`, ctx, { toutes: 'texte de reponse', gss: '' });
    expect(r.questions[0]).toContain('2 agents et d’1… »');
    expect(r.questions[0]).not.toMatch(/\bchi…/);
  });
});

describe('schéma du cas pratique (T5CP-4, T5CP-5, T5N-10)', () => {
  it('textes entiers, espaces insécables, résultat jamais « en continu »', () => {
    const d = calculerDimensionnement(REP, DCE)!;
    const e = etapesSchemaDemande('', d)!;
    expect(e.map((x) => x.titre)).toEqual(['Dimanche et lundi, 6 h–21 h', 'Nuit, 21 h–6 h', 'Votre résultat']);
    expect(e[0].texte).toBe('10 agents de sécurité, 1 maître-chien, 1 agent de sécurité incendie et 1 encadrant');
    expect(JSON.stringify(e)).not.toMatch(/continu|permanente/);
    const s = specProcessBesoin(e, 'flux')!;
    expect(s.params.etapes[0].titre).toBe('Dimanche et lundi, 6 h–21 h');
    expect(s.params.etapes.every((x: any) => x.texte.length <= 86)).toBe(true);
    expect(etapesSchemaDemande('', d, 'Les huit accès sont couverts.')!.slice(-1)[0].texte).toBe('Les huit accès sont couverts.');
    expect(insecablesNombres('2 agents et 22 h 30')).toBe('2 agents et 22 h 30'.replace('h 30', 'h 30'));
  });
  it('couverture horaire contrôlée contre le DCE : écarts posés à GSS', () => {
    const d = calculerDimensionnement(REP, DCE)!;
    const e = ecartsCouvertureCasPratique(d, DCE);
    expect(e[0]).toContain('couvrent 39 h sur les 48 heures du cas pratique');
    expect(e[1]).toContain("jusqu'à 22 h 30 alors que les plages de jour finissent à 21 h");
    expect(questionCouvertureCasPratique(d, DCE)).toMatch(/^Proposition à valider : couverture horaire du cas pratique — .*\?$/);
    expect(questionCouvertureCasPratique(d, 'Cas pratique : gardiennage d’un site.')).toBe('');
  });
});

describe('étapes du schéma du bloc 1 : texte jamais coupé (T5CP-4)', () => {
  const etapes = [
    { titre: 'Rondes de surveillance', texte: 'Le CSTB demande des rondes à pied sur le site CSTB Grenoble.' },
    { titre: 'Séquences contractuelles', texte: 'Nous organisons des horaires variables, tout en respectant scrupuleusement les séquences contractuelles du marché.' },
    { titre: 'Main courante', texte: 'Les agents tiennent la main courante électronique en continu pendant toutes les rondes de surveillance de nuit.' },
  ];
  it('proposition entière gardée, sinon étape refusée', () => {
    const s = specProcessBesoin(etapes, 'flux')!;
    expect(s.params.etapes[1].texte).toBe('Nous organisons des horaires variables');
    expect(s.params.etapes[2].texte).toBeUndefined();
    expect(anomaliesSchemaBloc1(s).some((a) => /étape vide/.test(a))).toBe(true);
    expect(defautsEtapesBesoin(etapes).some((x) => /étape 3 : texte de \d+ caractères, trop long/.test(x))).toBe(true);
  });
});

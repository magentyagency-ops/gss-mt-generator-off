import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { blocRegistre, texteSourcesMemoires, valeurInterne } from '../src/generation/base_memoires';
import {
  A_COMPLETER, VARIABLES_CALCULEES, adapterRubrique, appliquerModifications, articleEtNom,
  chargerMemoireType, dateDebutMarche, decouperSousParties, delaiDuDce, donneesBesoin,
  evaluerCondition, exigencesParRubrique, extraireValeursImposees, fidelite, SEUIL_FIDELITE, fondementRepriseDce, frequenceReunionsDce, lireRegistre,
  planMemoireType, preparerMemoireType, publierMemoire, publierRubrique, publierSchema, publiposter, rechercherRubriques,
  reordonnerSousParties, validerMemoireType,
  type AppelModele, type ContexteMarche, type MemoireType, type Variables,
} from '../src/generation/memoire_type';

/**
 * Tests HORS LIGNE du mémoire type et du publipostage (aucun appel OpenAI : le modèle est simulé).
 * Les tests sur le corpus (_corpus_verif/_dce_textes : becquerel, caen, ign) sont ignorés si le corpus est absent.
 */

const RACINE = path.resolve(__dirname, '../..');
const CORPUS = path.join(RACINE, '_corpus_verif/_dce_textes');
const AVEC_CORPUS = ['becquerel', 'caen', 'ign'].every((c) => fs.existsSync(path.join(CORPUS, `${c}.txt`)));
const PERSONNES = path.resolve(__dirname, '../Template/Documentation GSS/Personnes');
const ANALYSES: Record<string, any> = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/memoire_type_analyses.json'), 'utf-8')).analyses;
const mt: MemoireType = chargerMemoireType();

/** Ids et chapitres de l'ancien plan (AI_SECTIONS_B), lus dans le code source (aucun import du générateur). */
function sectionsV1(): Array<{ id: string; chapter: string }> {
  const src = fs.readFileSync(path.resolve(__dirname, '../src/generation/memoire_generator.ts'), 'utf-8');
  const bloc = src.slice(src.indexOf('const AI_SECTIONS_B'), src.indexOf('const CHAPTER_ORDER_B'));
  return [...bloc.matchAll(/\{ id: '(b_[a-z_]+)', chapter: '(I|II|III|IV)'/g)].map((m) => ({ id: m[1], chapter: m[2] }));
}

/** Termes interdits dans un mémoire GSS (règles de faits_gss.md et de _corpus_verif/controle.py). */
function anomalies(texte: string, dce = ''): string[] {
  const regles: Array<[string, RegExp]> = [
    ['covid', /[Cc]ovid|pass sanitaire|gestes barrières|gel hydroalcoolique/],
    ['pole_emploi', /Pôle [Ee]mploi/],
    ['vigicom', /[Vv]igicom/],
    ['controle_identite', /(?:vérifie|vérifient|contrôle|contrôlent|vérifier|contrôler) (?:son|leur|l.)\s*identité|contrôle(?:nt)? les pièces d.identité/],
    ['effectifs_obsoletes', /\b(?:152|93|423|52|291|320) (?:agents|salariés|collaborateurs)/],
    ['noms_obsoletes', /OTMANI|MEROUANI|MENDES|HANZAZ|FE Lilian/],
    ['iso_certifie', /certifi[ée]e? ISO 9001|ISO 9001 certifi/],
    ['marqueur_interne', /CONSULTATION REQUISE|⟦AC|\[CHAMP_\d+\]|\{\{|\}\}|‹|›/],
    ['non_renseigne', /[Nn]on communiqué|[Nn]on précisé|undefined|null|NaN/],
    ['reprise_selective', /affectons sur un autre site|repositionn/],
    ['sous_traitance_positive', /faisons (?:alors )?appel à Global Security Protection/],
  ];
  const out = regles.filter(([, rx]) => rx.test(texte)).map(([n]) => n);
  if (/L\.?\s?1224/.test(texte) && !/L\.?\s?1224/.test(dce)) out.push('l1224');
  return out;
}

const variables = (v: Record<string, string | string[] | boolean | null>, extra: Partial<Record<string, { article?: string; aConfirmer?: string }>> = {}): Variables =>
  Object.fromEntries(Object.entries(v).map(([k, x]) => [k, { valeur: x, ...(extra[k] || {}) }]));

// ─── 1. Le JSON du mémoire type ──────────────────────────────────────────────────────────────────

describe('Mémoire type : JSON de référence', () => {
  it('se charge et est valide', () => {
    expect(validerMemoireType(mt)).toEqual([]);
  });

  it('a 5 blocs dans l’ordre décidé (compréhension d’abord), l’ordre étant une donnée du JSON', () => {
    expect(mt.blocs.map((b) => b.id)).toEqual(['comprehension', 'presentation', 'humains', 'materiels', 'organisation']);
    expect(mt.blocs.map((b) => b.titre)).toEqual([
      'Notre compréhension de votre besoin', 'Présentation de GSS', 'Nos moyens humains',
      'Nos moyens matériels et opérationnels', 'Organisation et contrôle des prestations',
    ]);
  });

  it('chaque rubrique a id, bloc, titre, mode, condition, texte, sous-parties, schéma, mots-clés et sources', () => {
    for (const r of mt.rubriques) {
      expect(r.id && r.bloc && r.titre, r.id).toBeTruthy();
      expect(['fixe', 'adapte', 'besoin']).toContain(r.mode);
      expect(typeof r.condition).toBe('string');
      expect(Array.isArray(r.sous_parties), r.id).toBe(true);
      expect(r.mots_cles.length, r.id).toBeGreaterThan(2);
      expect(r.sources.length, r.id).toBeGreaterThan(0);
      if (r.mode !== 'besoin') expect(r.texte, r.id).toBeTruthy();
      if (r.id !== 'b2_references_intro') expect(r.schema, r.id).toBeTruthy();
    }
  });

  it('le bloc « compréhension » est une seule rubrique « besoin » avec son schéma de process', () => {
    const b1 = mt.rubriques.filter((r) => r.bloc === 'comprehension');
    expect(b1.map((r) => r.id)).toEqual(['b1_comprehension']);
    expect(b1[0].mode).toBe('besoin');
    expect(b1[0].schema?.source).toBe('process_besoin');
    expect(b1[0].schema?.etapes?.length).toBe(5);
    expect(b1[0].specification.sous_parties.map((s: any) => s.id)).toEqual(['contexte', 'perimetre', 'attentes', 'vigilance']);
  });

  it('toute variable déclarée est calculée par le module', () => {
    for (const nom of Object.keys(mt.variables)) expect(VARIABLES_CALCULEES.has(nom), nom).toBe(true);
  });

  it('les schémas de bibliothèque existent dans index.json', () => {
    const index = new Set(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../python/schemas_gss/bibliotheque/index.json'), 'utf-8')).map((x: any) => x.id));
    for (const r of mt.rubriques) {
      if (r.schema?.source === 'bibliotheque') expect(index.has(r.schema.ref), `${r.id} ${r.schema.ref}`).toBe(true);
      if (r.schema?.alternative?.ref) expect(index.has(r.schema.alternative.ref)).toBe(true);
    }
  });

  it('les textes respectent les règles de faits_gss.md', () => {
    for (const r of mt.rubriques) {
      const t = `${r.texte || ''}\n${JSON.stringify(r.schema?.params || {})}`;
      expect(anomalies(t.replace(/\{\{[^}]*\}\}/g, ''), '').filter((a) => a !== 'marqueur_interne'), r.id).toEqual([]);
      expect(/L\.?\s?1224/.test(t), `${r.id} : L1224 seulement par variable`).toBe(false);
      expect(/Trackforce|TRACKFORCE/.test(r.texte || ''), `${r.id} : outil de main courante par variable`).toBe(false);
      if (r.id !== 'b2_identite') expect(/sous-trait/i.test(r.texte || ''), r.id).toBe(false);
    }
    const tout = mt.rubriques.map((r) => r.texte || '').join('\n');
    expect(tout).toContain('ISO 9001 en cours');
    expect(tout).toContain('{{VEHICULES_ASTREINTE}} véhicules pour la région rouennaise');
    expect(tout).toContain("n'envisage pas de recourir à la sous-traitance");
    expect(tout).toContain('justifier de sa présence');
  });

  it('les valeurs d’identité écrites dans le texte sont celles du registre', () => {
    const registre = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../python/base_memoires/registre_informations.json'), 'utf-8')).informations;
    const val = (cle: string) => registre.find((e: any) => e.cle === cle)?.valeur_retenue || '';
    const identite = mt.rubriques.find((r) => r.id === 'b2_identite')!.texte!;
    expect(identite.replace(/\s/g, '')).toContain(val('siret'));
    expect(identite).toContain(val('autorisation_cnaps'));
    expect(identite).toContain(val('agrement_dirigeant'));
    expect(identite).toContain(val('adresse_siege'));
    expect(identite).toContain(val('assurance_rc_contrat'));
    expect(val('date_autorisation_cnaps')).toBe('12/02/2015');
    expect(identite).toContain('12 février 2015');
    expect(val('certification_iso')).toMatch(/en cours/);
    expect(val('vehicules_astreinte')).toMatch(/^5 /);
    expect(mt.rubriques.find((r) => r.id === 'b3_interlocuteur_unique')!.texte).toContain(val('email_contact'));
  });

  it('la correspondance v1 couvre les 20 anciennes rubriques (AI_SECTIONS_B)', () => {
    const v1 = sectionsV1();
    expect(v1.length).toBe(20);
    for (const s of v1) expect((mt.correspondance_v1[s.id] || []).length, s.id).toBeGreaterThan(0);
    expect(mt.rubriques.find((r) => r.id === 'b2_organigramme')?.ancienne_rubrique).toBe('b_encadrement');
    expect(mt.rubriques.find((r) => r.id === 'b3_reprise_personnel')?.ancienne_rubrique).toBe('b_reprise_personnel');
    for (const r of mt.rubriques.filter((x) => x.mode !== 'besoin')) {
      expect(v1.some((s) => s.id === r.ancienne_rubrique) || r.ancienne_rubrique === 'b_references', r.id).toBe(true);
    }
  });
});

// ─── 2. Publipostage ─────────────────────────────────────────────────────────────────────────────

describe('Publipostage', () => {
  const defs = mt.variables;

  it('remplace les variables et ne laisse jamais de {{…}} ; une variable inconnue devient un repère à compléter', () => {
    const r = publiposter('Effectif : {{EFFECTIF_TOTAL}} salariés ; taux : {{TAUX_REPRISE}} ; {{INCONNUE}}.', variables({ EFFECTIF_TOTAL: '380' }), { definitions: defs });
    expect(r.texte).toBe(`Effectif : 380 salariés ; taux : ${A_COMPLETER} ; ${A_COMPLETER}.`);
    expect(r.manquantes.map((m) => m.variable)).toEqual(['TAUX_REPRISE', 'INCONNUE']);
    expect(r.texte).not.toMatch(/\{\{|\}\}/);
  });

  it('évalue les passages conditionnels (négation, ou, et, imbrication)', () => {
    const v = variables({ A: 'x' });
    const ind = { N: true, H: false };
    const t = 'a{{#si N}}b{{#si !H}}c{{/si}}{{/si}}{{#si H|A}}d{{/si}}{{#si N&H}}e{{/si}}{{#si INCONNU}}f{{/si}}';
    expect(publiposter(t, v, { indicateurs: ind }).texte).toBe('abcd');
    expect(evaluerCondition('toujours', {})).toBe(true);
    expect(evaluerCondition('!H|N&H', ind)).toBe(true);
  });

  it('règles si_absente : phrase retirée, vide, repli du client', () => {
    expect(publiposter('Première phrase. Pour le marché « {{OBJET_MARCHE}} ». Fin.', {}, { definitions: defs }).texte).toBe('Première phrase. Fin.');
    expect(publiposter('Réf. {{REF_MARCHE}} fin', {}, { definitions: defs }).texte).toBe('Réf. fin');
    const r = publiposter('Le site de {{CLIENT}}. Pour {{CLIENT}}, rien.', {}, { definitions: defs });
    expect(r.texte).toBe('Le site de votre établissement. Pour votre établissement, rien.');
    expect(r.manquantes[0].variable).toBe('CLIENT');
  });

  it('accorde les prépositions et l’article du client (du, au, de l’, majuscule en début de phrase)', () => {
    const t = 'Le site de {{CLIENT}}. {{CLIENT}} appelle. Envoi à {{CLIENT}}. Avec {{CLIENT}}.\n1. {{CLIENT}} valide.';
    const becq = variables({ CLIENT: 'Centre Henri Becquerel' }, { CLIENT: { article: 'le' } });
    expect(publiposter(t, becq, { definitions: defs }).texte).toBe('Le site du Centre Henri Becquerel. Le Centre Henri Becquerel appelle. Envoi au Centre Henri Becquerel. Avec le Centre Henri Becquerel.\n1. Le Centre Henri Becquerel valide.');
    const acoss = variables({ CLIENT: 'ACOSS' }, { CLIENT: { article: "l'" } });
    expect(publiposter(t, acoss, { definitions: defs }).texte).toBe("Le site de l'ACOSS. L'ACOSS appelle. Envoi à l'ACOSS. Avec l'ACOSS.\n1. L'ACOSS valide.");
    const orange = variables({ CLIENT: 'Orange' }, { CLIENT: { article: '' } });
    expect(publiposter('Le site de {{CLIENT}}.', orange, { definitions: defs }).texte).toBe("Le site d'Orange.");
  });

  it('lit l’article de l’acheteur dans le DCE, sinon d’après le premier mot', () => {
    expect(articleEtNom('ACOSS', 'les sites de l’ACOSS et du siège')).toEqual({ article: "l'", nom: 'ACOSS' });
    expect(articleEtNom('Centre Henri Becquerel', 'Le Centre Henri Becquerel a décidé')).toEqual({ article: 'le', nom: 'Centre Henri Becquerel' });
    expect(articleEtNom('Région Normandie')).toEqual({ article: 'la', nom: 'Région Normandie' });
    expect(articleEtNom('La Poste')).toEqual({ article: '', nom: 'La Poste' }); // article du nom propre gardé (T3-COH-3)
    expect(articleEtNom('Carrefour')).toEqual({ article: '', nom: 'Carrefour' });
    expect(articleEtNom('Hôtel de Ville de Caen')).toEqual({ article: "l'", nom: 'Hôtel de Ville de Caen' });
    expect(articleEtNom('Régie du tabac', 'les sites de la Régie du tabac')).toEqual({ article: 'la', nom: 'Régie du tabac' });
  });

  it('jamais « Non communiqué » : une mention de remplissage de l’analyse n’est pas une valeur', () => {
    const ctx: ContexteMarche = { analyse: { clientName: 'Non communiqué dans les documents transmis', projectTitle: 'N/A', duration: 'Non précisé' }, dce: '' };
    const prep = preparerMemoireType(ctx, { memoireType: mt });
    const textes = publierMemoire(prep).map((r) => `${r.texte || ''} ${r.trame || ''}`).join('\n');
    expect(textes).not.toMatch(/[Nn]on communiqué|[Nn]on précisé|N\/A/);
    expect(textes).toContain('votre établissement');
  });

  it('retire une ligne de tableau conditionnelle sans casser le tableau', () => {
    const t = '| A | B |\n|---|---|\n{{#si X}}| x | {{EFFECTIF_ADS_CQP}} |\n{{/si}}| y | 2 |';
    expect(publiposter(t, {}, { indicateurs: { X: false }, definitions: defs }).texte).toBe('| A | B |\n|---|---|\n| y | 2 |');
  });

  it('rattache chaque repère « [À COMPLÉTER] » à sa question, sous son paragraphe ou son tableau', () => {
    const lignes = { valeur: '| SSIAP 1 | [À COMPLÉTER] |\n| ADS | [À COMPLÉTER] |', question: 'Effectif par catégorie.' };
    const t = '| Cat. | Nombre |\n|---|---|\n{{LIGNES_EQUIPE_DEDIEE}}\n\nÉquipe de {{EFFECTIF_AGENTS}} titulaires et {{NB_AGENTS_RENFORT}} renforts.\n\nTaux : {{TAUX_REPRISE}}.';
    const r = publiposter(t, { LIGNES_EQUIPE_DEDIEE: lignes }, { definitions: defs, marquerConsultations: true });
    expect(r.texte).toBe('| Cat. | Nombre |\n|---|---|\n| SSIAP 1 | [À COMPLÉTER] |\n| ADS | [À COMPLÉTER] |\n[CONSULTATION REQUISE : Effectif par catégorie.]\n\n'
      + 'Équipe de [À COMPLÉTER] titulaires et [À COMPLÉTER] renforts.\n[CONSULTATION REQUISE : Combien d\'agents titulaires compte l\'équipe dédiée au marché ?]\n[CONSULTATION REQUISE : Combien d\'agents formés au site compte l\'équipe suppléante (renfort) ?]\n\n'
      + 'Taux : [À COMPLÉTER].\n[CONSULTATION REQUISE : Quel taux de reprise du personnel en place proposez-vous pour ce marché ?]');
    expect(r.manquantes.every((m) => m.repere)).toBe(true);
    expect(publiposter(t, { LIGNES_EQUIPE_DEDIEE: lignes }, { definitions: defs }).texte).not.toContain('CONSULTATION');
  });

  it('publie un schéma « spec » : variables remplacées, éléments conditionnels retirés', () => {
    const r = mt.rubriques.find((x) => x.id === 'b3_adequation')!;
    const v = variables({ EFFECTIF_TOTAL: '380', EFFECTIF_SSIAP1: '185', EFFECTIF_CONTROLEURS: '35', VIVIER_EVENEMENTIEL: '500' });
    const s = publierSchema(r.schema!, v, {}, defs)!;
    expect(s.params.chiffres.map((c: any) => c.valeur)).toEqual(['380', '185', '35', '500']);
    expect(JSON.stringify(s)).not.toMatch(/\{\{|"si"/);
    const v2 = variables({ ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.valeur as string])), EFFECTIF_AGENTS: '6' });
    expect(publierSchema(r.schema!, v2, {}, defs)!.params.chiffres[0]).toMatchObject({ valeur: '6' });
    // Élément de liste sans « si » mais dont une variable est inconnue : retiré ; hors liste : schéma inutilisable.
    const spec = { source: 'spec' as const, gabarit: 'grille', params: { cartes: [{ titre: 'A {{X}}' }, { titre: 'B' }, { titre: 'C' }, { titre: 'D' }] } };
    expect(publierSchema(spec, {}, {})!.params.cartes.map((c: any) => c.titre)).toEqual(['B', 'C', 'D']);
    expect(publierSchema({ ...spec, params: { titre: '{{X}}', cartes: [] } }, {}, {})).toBeNull();
  });
});

// ─── 3. Indicateurs, plan et variables (DCE fictifs) ─────────────────────────────────────────────

const DCE_NORMANDIE = `===== PIÈCE : CCTP.pdf =====
CAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES
Centre fictif des Docks, 12 quai de France, 76000 Rouen.
Le poste de sécurité est tenu 24 h/24 par un agent SSIAP 1. Les agents effectuent des rondes avec pointeaux.
Le site est un ERP de 3e catégorie qui accueille du public.
En cas de déclenchement d'alarme, l'agent intervenant de télésurveillance doit être sur site dans un délai maximal de 20 minutes.
Le titulaire reprendra le personnel en place conformément à l'article L. 1224-1 du Code du travail.
Une réunion de suivi est organisée tous les mois avec le titulaire.
La date prévisionnelle de démarrage des prestations est fixée au 1er mars 2027.`;

const DCE_HORS_NORMANDIE = `===== PIÈCE : CCTP.pdf =====
Musée fictif, 10 rue des Arts, 75012 Paris.
Gardiennage du site par un agent de sécurité, rondes de surveillance de nuit, PTI fourni par le titulaire.
La reprise du personnel en place est prévue par l'annexe VII de la convention collective nationale.
Les clés et badges sont confiés au titulaire.`;

describe('Indicateurs, plan et variables', () => {
  it('DCE normand : conditions, délai imposé par le DCE, fondement cité, réunions, date de démarrage', () => {
    const prep = preparerMemoireType({ analyse: { clientName: 'Centre fictif des Docks', clientSector: 'culture' }, dce: DCE_NORMANDIE }, { memoireType: mt });
    const ids = prep.plan.rubriques.map((r) => r.id);
    expect(prep.indicateurs.HORS_NORMANDIE).toBe(false);
    for (const id of ['b3_formation_ssiap_a', 'b3_reprise_personnel', 'b4_proc_alarme', 'b4_rondes', 'b4_accueil_filtrage']) expect(ids, id).toContain(id);
    for (const id of ['b3_formation_cynophile', 'b3_formation_apr', 'b5_defaillance_ssi']) expect(ids, id).not.toContain(id);
    expect(prep.variables.DELAI_INTERVENTION_ALARME.valeur).toBe('20 minutes');
    expect(prep.variables.FONDEMENT_REPRISE_DCE.valeur).toBe("l'article L. 1224-1 du Code du travail");
    expect(prep.variables.FREQ_REUNIONS.valeur).toBe('chaque mois');
    expect(prep.variables.DATE_DEBUT_MARCHE.valeur).toBe('1er mars 2027');
    const textes = Object.fromEntries(publierMemoire(prep).map((r) => [r.id, r.texte || '']));
    expect(textes.b4_proc_alarme).toContain('en 20 minutes au maximum');
    expect(textes.b3_reprise_personnel).toContain("conformément à l'article L. 1224-1 du Code du travail");
    expect(textes.b5_nouveau_marche).toContain('le jour J correspond au 1er mars 2027');
    expect(textes.b5_reunions_indicateurs).toContain('les réunions de suivi ont lieu chaque mois');
  });

  it('DCE hors Normandie : aucun délai normand, pas d’article L. 1224-1 non cité, références et blocs intacts', () => {
    const prep = preparerMemoireType({ analyse: { clientName: 'Musée fictif', clientSector: 'culture' }, dce: DCE_HORS_NORMANDIE }, { memoireType: mt });
    expect(prep.indicateurs.HORS_NORMANDIE).toBe(true);
    const rubriques = publierMemoire(prep);
    const tout = rubriques.map((r) => r.texte || '').join('\n');
    expect(tout).not.toMatch(/60 minutes|45 minutes|moins de 2 heures|48 heures|1 h à 24 h|45 minutes à 2 heures/);
    expect(tout).not.toMatch(/L\.?\s?1224/);
    expect(prep.variables.FONDEMENT_REPRISE_DCE.valeur).toContain('annexe VII');
    expect(prep.variables.DELAI_ASTREINTE.valeur).toBeNull();
    // Tour 3 (T3-CONS-12) : les délais hors Normandie ne dépendent pas du marché : question posée une seule fois
    // (questions_gss_une_fois), jamais à chaque génération ; le délai est retiré du texte, sans repère.
    expect(prep.variables.DELAI_ASTREINTE.question).toBeUndefined();
    const pti = rubriques.find((x) => x.id === 'b4_pti')!;
    expect(pti.texte).toContain('le rondier d\'astreinte se rend sur place.');
    expect((pti.manquantes || []).filter((m: any) => m.question)).toEqual([]);
    expect(JSON.stringify(mt.questions_gss_une_fois)).toMatch(/Hors Normandie : quels délais GSS annonce-t-elle/);
    expect(prep.plan.blocs.map((b) => b.cle)).toEqual(['I', 'II', 'III', 'IV', 'V']);
    for (const b of prep.plan.blocs) expect(b.rubriques.length, b.id).toBeGreaterThan(0);
    expect(anomalies(tout, DCE_HORS_NORMANDIE)).toEqual([]);
  });

  it('données du besoin (rubrique « compréhension ») calculées sans modèle', () => {
    const ctx = { analyse: { clientName: 'Centre fictif des Docks', projectTitle: 'Gardiennage du centre', duration: '3 ans', keyRisks: ['Public nombreux', 'Non communiqué'] }, dce: DCE_NORMANDIE };
    const prep = preparerMemoireType(ctx, { memoireType: mt });
    const d = donneesBesoin(prep, ctx);
    expect(d.client).toBe('le Centre fictif des Docks');
    expect(d.amorce).toBe('Le Centre fictif des Docks lance le marché « Gardiennage du centre », d\'une durée de 3 ans.');
    expect(d.enjeux).toEqual(['Public nombreux']);
    expect(d.prestations).toEqual(expect.arrayContaining(['rondes', 'télésurveillance et interventions sur alarme', 'reprise du personnel en place']));
    expect(d.qualifications).toContain('SSIAP 1');
    expect(d.obligations.some((o) => /20 minutes/.test(o))).toBe(true);
    expect(donneesBesoin(preparerMemoireType({ analyse: { clientName: 'Carrefour' }, dce: '' }, { memoireType: mt }), {}).client).toBe('Carrefour');
  });

  it('ordre imposé par le cadre (consigne 5) : seuls l’ordre et les numéros changent, pas les textes', () => {
    const ctx = { analyse: { clientName: 'Régie fictive' }, dce: DCE_NORMANDIE };
    const normal = preparerMemoireType(ctx, { memoireType: mt });
    const impose = preparerMemoireType(ctx, { memoireType: mt, ordreBlocs: ['comprehension', 'presentation', 'materiels', 'humains', 'organisation'] });
    expect(impose.plan.blocs.map((b) => `${b.cle}:${b.id}`)).toEqual(['I:comprehension', 'II:presentation', 'III:materiels', 'IV:humains', 'V:organisation']);
    const textes = (p: typeof normal) => Object.fromEntries(publierMemoire(p).map((r) => [r.id, r.texte]));
    expect(textes(impose)).toEqual(textes(normal));
  });

  it('interlocuteur unique : dirigeant par défaut ; un autre choix de GSS n’hérite pas du numéro du dirigeant', () => {
    const defaut = preparerMemoireType({ analyse: { clientName: 'Site' }, dce: DCE_NORMANDIE }, { memoireType: mt }).variables;
    expect(defaut.INTERLOCUTEUR_UNIQUE.valeur).toBe('MARCHANI Adil');
    expect(defaut.FONCTION_INTERLOCUTEUR.valeur).toBe("directeur d'agence et responsable de marché");
    expect(defaut.TEL_INTERLOCUTEUR.valeur).toBe('06 58 06 32 25');
    expect(defaut.TEL_INTERLOCUTEUR.aConfirmer).toBeUndefined(); // numéro confirmé par GSS le 2026-10-01
    const choix = preparerMemoireType({ analyse: { clientName: 'Site' }, dce: DCE_NORMANDIE, choix: { variables: { INTERLOCUTEUR_UNIQUE: 'VATTIER Marie' } } }, { memoireType: mt }).variables;
    expect(choix.INTERLOCUTEUR_UNIQUE.valeur).toBe('VATTIER Marie');
    expect(choix.TEL_INTERLOCUTEUR.valeur).toBeNull();
  });

  it('contrôles inopinés : 1 à 3 par mois en pratique courante, au moins 3 quand le cahier des charges l’exige (réponse de GSS)', () => {
    const courant = preparerMemoireType({ analyse: { clientName: 'Site' }, dce: DCE_NORMANDIE }, { memoireType: mt }).variables;
    expect(courant.FREQ_CONTROLE_2.valeur).toBe('une à trois fois par mois');
    const dce = `${DCE_NORMANDIE}\nLe titulaire réalise au moins 3 contrôles inopinés par mois sur chaque site.`;
    const exige = preparerMemoireType({ analyse: { clientName: 'Site' }, dce }, { memoireType: mt }).variables;
    expect(exige.FREQ_CONTROLE_2.valeur).toBe('au moins trois fois par mois');
    expect(exige.CONTROLES_INOPINES_MENSUELS.valeur).toBe('au moins trois contrôles inopinés');
  });

  it('lampes conformes ATEX citées seulement si le DCE parle d’ATEX (réponse de GSS)', () => {
    const texte = (dce: string) => publierMemoire(preparerMemoireType({ analyse: { clientName: 'Site' }, dce }, { memoireType: mt })).find((r) => r.id === 'b4_equipements')!.texte!;
    expect(texte(DCE_NORMANDIE)).not.toContain('ATEX');
    expect(texte(`${DCE_NORMANDIE}\nLe site comporte des zones ATEX.`)).toContain('lampes conformes ATEX');
  });

  it('prix horaire (information interne de GSS) : jamais transmis à la rédaction', () => {
    expect(valeurInterne('prix_horaire')).toMatch(/22 à 30 € HT/);
    for (const t of [blocRegistre(), blocRegistre(true), texteSourcesMemoires()]) expect(t).not.toMatch(/22 à 30|€ HT de l.heure/);
    expect(lireRegistre().some((e) => e.cle === 'prix_horaire')).toBe(false);
  });

  it('la référence du secteur du client passe en tête des références', () => {
    const prep = preparerMemoireType({ analyse: { clientName: 'Clinique fictive', clientSector: 'santé' }, dce: 'Clinique fictive, 76000 Rouen. Accueil des patients.' }, { memoireType: mt });
    const refs = prep.plan.rubriques.filter((r) => r.id.startsWith('b2_ref_')).map((r) => r.id);
    expect(refs[0]).toBe('b2_ref_sante');
    expect(prep.plan.secteurReference?.libelle).toBe('les sites de santé');
    const intro = publierMemoire(prep).find((r) => r.id === 'b2_references_intro')!.texte!;
    expect(intro).toContain('Nous commençons par le secteur le plus proche du vôtre : les sites de santé.');
  });

  it('extractions déterministes du DCE', () => {
    expect(delaiDuDce('Le personnel de remplacement doit être dépêché dans les UNE (1) heure suivant la constatation.', 'remplacement')).toBe('1 heure');
    expect(delaiDuDce("En cas d'absence prévisible, informer au moins 24h à l'avance. Le remplaçant arrive dans les deux (2) heures.", 'remplacement')).toBe('2 heures');
    expect(delaiDuDce('Remplacement sous 30 minutes. Remplacement sous 1 heure.', 'remplacement')).toBe('');
    expect(frequenceReunionsDce('Une réunion mensuelle est prévue. La réunion est au minimum trimestrielle.')).toBe('');
    expect(frequenceReunionsDce('Ces réunions seront organisées au minimum tous les mois.')).toBe('au minimum chaque mois');
    expect(dateDebutMarche('Début d’exécution des prestations le 15 avril 2027.')).toBe('15 avril 2027');
    expect(fondementRepriseDce('reprise selon les dispositions habituelles')).toBe('');
  });
});

// ─── 4. Corpus : 3 DCE réels avec une analyse simulée ────────────────────────────────────────────

describe.skipIf(!AVEC_CORPUS)('Corpus (becquerel, caen, ign) avec analyse simulée', () => {
  const referents = fs.existsSync(PERSONNES) ? fs.readFileSync(PERSONNES, 'utf-8') : '';
  const prepa = (code: string) => {
    const dce = fs.readFileSync(path.join(CORPUS, `${code}.txt`), 'utf-8');
    return { dce, prep: preparerMemoireType({ analyse: ANALYSES[code], dce, referents }, { memoireType: mt }) };
  };
  const cas = AVEC_CORPUS ? Object.fromEntries(['becquerel', 'caen', 'ign'].map((c) => [c, prepa(c)])) : {} as Record<string, ReturnType<typeof prepa>>;

  it('5 blocs dans l’ordre, chacun avec au moins une rubrique ; aucun {{…}}, aucune anomalie', () => {
    for (const [code, { dce, prep }] of Object.entries(cas)) {
      expect(prep.plan.blocs.map((b) => b.id), code).toEqual(mt.blocs.map((b) => b.id));
      for (const b of prep.plan.blocs) expect(b.rubriques.length, `${code} ${b.id}`).toBeGreaterThan(0);
      const rubriques = publierMemoire(prep);
      for (const r of rubriques) {
        const t = `${r.texte || ''}\n${r.trame || ''}\n${JSON.stringify(r.schema?.params || {})}`;
        expect(anomalies(t, dce), `${code} ${r.id}`).toEqual([]);
      }
    }
  });

  it('conditions d’inclusion selon le DCE', () => {
    const ids = (c: string) => cas[c].prep.plan.rubriques.map((r) => r.id);
    expect(ids('becquerel')).toEqual(expect.arrayContaining(['b3_formation_ssiap_a', 'b3_formation_ssiap_b', 'b3_reprise_personnel', 'b2_ref_sante', 'b4_pti', 'b4_rondes']));
    expect(ids('becquerel')).not.toContain('b4_proc_alarme');
    expect(ids('caen')).toEqual(expect.arrayContaining(['b4_proc_alarme', 'b4_moyens_acces', 'b5_commande_supplementaire']));
    expect(ids('caen')).not.toEqual(expect.arrayContaining(['b3_formation_ssiap_a']));
    expect(ids('caen')).not.toContain('b3_reprise_personnel');
    expect(cas.ign.prep.indicateurs.HORS_NORMANDIE).toBe(true);
    expect(ids('ign')).toEqual(expect.arrayContaining(['b3_reprise_personnel', 'b3_formation_cynophile', 'b3_formation_ssiap_a']));
    expect(cas.becquerel.prep.plan.rubriques.filter((r) => r.id.startsWith('b2_ref_'))[0].id).toBe('b2_ref_sante');
  });

  it('valeurs du DCE : délais, réunions, date, fondement de la reprise, client', () => {
    const v = (c: string, n: string) => cas[c].prep.variables[n].valeur;
    expect(v('caen', 'DELAI_INTERVENTION_ALARME')).toBe('30 minutes');
    expect(v('caen', 'DELAI_ASTREINTE')).toBe('1 heure');
    expect(v('ign', 'DELAI_ASTREINTE')).toBe('2 heures');
    expect(v('ign', 'DELAI_PTI')).toBeNull();
    expect(v('ign', 'DATE_DEBUT_MARCHE')).toBe('1er janvier 2027');
    expect(v('ign', 'FREQ_REUNIONS')).toBe('tous les deux mois');
    expect(v('becquerel', 'FREQ_REUNIONS')).toBe('au minimum chaque mois');
    expect(String(v('becquerel', 'FONDEMENT_REPRISE_DCE'))).toContain('L. 1224-1');
    expect(v('ign', 'FONDEMENT_REPRISE_DCE')).toBeNull();
    expect(cas.caen.prep.variables.CLIENT.article).toBe("l'");
    expect(cas.becquerel.prep.variables.CLIENT.article).toBe('le');
    const ign = publierMemoire(cas.ign.prep).map((r) => r.texte || '').join('\n');
    expect(ign).not.toMatch(/60 minutes|45 minutes|moins de 2 heures|48 heures|1 h à 24 h/);
    expect(ign).toContain('qui est sur site en 2 heures maximum');
  });

  it('les rubriques « fixe » sont identiques d’un DCE à l’autre, aux variables et passages conditionnels près', () => {
    const squelette = (t: string) => {
      let s = t;
      for (let i = 0; i < 20; i++) s = s.replace(/‹si:([^›]+)›(?:(?!‹si:)[\s\S])*?‹\/si›/g, '⟨si:$1⟩');
      return s;
    };
    for (const r of mt.rubriques.filter((x) => x.mode === 'fixe')) {
      const sq = Object.values(cas).map(({ prep }) => squelette(publiposter(r.texte!, prep.variables, { definitions: mt.variables, indicateurs: prep.indicateurs, trace: true }).texte));
      expect(new Set(sq).size, r.id).toBe(1);
    }
  });

  it('chaque schéma « spec » publié est accepté par le moteur Python (contrôle de fond avec le texte de la rubrique)', () => {
    const python = spawnSync('python3', ['-c', 'import PIL'], { encoding: 'utf-8' });
    if (python.status !== 0) return;  // moteur indisponible sur ce poste : contrôle ignoré
    const moteur = path.resolve(__dirname, '../python/schemas_gss/rendu_schemas.py');
    for (const [code, { prep }] of Object.entries(cas)) {
      const demandes = publierMemoire(prep).filter((r) => r.schema?.source === 'spec' && r.texte)
        .map((r) => ({ id: r.id, gabarit: r.schema!.gabarit, params: r.schema!.params, source: r.texte, titre_section: r.titre }));
      const p = spawnSync('python3', [moteur], { input: JSON.stringify({ mode: 'rendre', schemas: demandes }), encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
      const res = JSON.parse(p.stdout).resultats as Array<{ id: string; ok: boolean; erreurs?: string[] }>;
      expect(res.length, code).toBe(demandes.length);
      for (const x of res) expect(x.ok, `${code} ${x.id} : ${(x.erreurs || []).join(' | ')}`).toBe(true);
    }
  }, 60_000);
});

// ─── 5. Adaptation ciblée et fidélité ────────────────────────────────────────────────────────────

const REFERENCE = `Notre calendrier de planification :
- J-10 : envoi des plannings du mois suivant ;
- J-7 : validation des plannings par les agents, avec accusé de réception ;
- J-3 : envoi des plannings au client.

Comète nous permet de nous adapter très facilement en cas de modification de dernière minute. Il nous donne une vision en temps réel des prises et fins de service. Tous nos responsables de site sont formés à son utilisation.`;
const DCE_ADAPT = 'Le planning mensuel est transmis au SAIMG au moins sept (7) jours avant le début du mois concerné. Le site Carnot-Cassini est ouvert 24 h/24.';

describe('Adaptation ciblée (extrait exact → remplacement) et fidélité', () => {
  it('fidélité : 1 pour le texte de référence, élevée si un chiffre change, basse si le texte est réécrit', () => {
    expect(fidelite(REFERENCE, REFERENCE)).toBe(1);
    expect(fidelite(REFERENCE, REFERENCE.replace('J-3 : envoi', 'J-7 : envoi'))).toBeGreaterThan(0.95);
    const moitie = REFERENCE.split('\n\n')[0];
    expect(fidelite(REFERENCE, moitie)).toBeLessThan(0.6);
    expect(fidelite(REFERENCE, 'Nous gérons les plannings avec soin et réactivité pour votre établissement.')).toBeLessThan(0.1);
  });

  it('applique seulement les extraits exacts, contrôle les chiffres, les noms et les interdits, plafonne', () => {
    const r = appliquerModifications(REFERENCE, {
      remplacements: [
        { extrait: 'J-3 : envoi des plannings au client', par: 'J-7 : envoi des plannings au SAIMG' },
        { extrait: 'extrait absent du texte', par: 'x' },
        { extrait: 'des plannings', par: 'du planning' },
        { extrait: 'formés à son utilisation', par: 'formés en 12 jours' },
        { extrait: 'Tous nos responsables de site', par: 'Tous nos responsables de site, dont M. Durand,' },
      ],
      retraits: [{ extrait: 'Il nous donne une vision en temps réel des prises et fins de service.' }],
      ajouts: [
        { apres: 'de dernière minute', texte: 'Le planning mensuel est transmis au moins sept jours avant le début du mois.' },
        { apres: '', texte: 'Nos agents contrôlent l’identité des visiteurs.' },
        { apres: '', texte: 'mot '.repeat(70) },
      ],
    }, { dce: DCE_ADAPT, reference: REFERENCE });
    expect(r.texte).toContain('J-7 : envoi des plannings au SAIMG');
    expect(r.texte).not.toContain('vision en temps réel');
    expect(r.texte).toContain('de dernière minute. Le planning mensuel est transmis au moins sept jours avant le début du mois.');
    const raisons = Object.fromEntries(r.refusees.map((m) => [m.par || m.extrait, m.raison]));
    expect(raisons.x).toMatch(/introuvable/);
    expect(raisons['du planning']).toMatch(/ambigu/);
    expect(raisons['formés en 12 jours']).toMatch(/chiffre absent du DCE/);
    expect(raisons['Tous nos responsables de site, dont M. Durand,']).toMatch(/nom absent/);
    expect(raisons['Nos agents contrôlent l’identité des visiteurs.']).toMatch(/identité/);
    expect(r.refusees.some((m) => /mots/.test(m.raison || ''))).toBe(true);
    const plafond = appliquerModifications('a b c. d e f. g h i. j k l.', { retraits: [{ extrait: 'a b c.' }, { extrait: 'd e f.' }, { extrait: 'g h i.' }] }, { maxModifications: 2 });
    expect(plafond.appliquees.length).toBe(2);
    expect(plafond.refusees[0].raison).toMatch(/plafond/);
  });

  it('article L. 1224-1 et Covid refusés si le DCE ne les cite pas', () => {
    const r = appliquerModifications(REFERENCE, { ajouts: [{ texte: 'La reprise suit l’article L. 1224-1 du Code du travail.' }, { texte: 'Les gestes barrières sont rappelés.' }] }, { dce: DCE_ADAPT });
    expect(r.appliquees.length).toBe(0);
    expect(r.refusees.map((m) => m.raison)).toEqual(['article L. 1224-1 absent du DCE', 'Covid']);
  });

  const rubriqueAdapte = { ...mt.rubriques.find((x) => x.id === 'b4_planification')!, texte: REFERENCE };

  it('adapterRubrique : modifications ciblées appliquées, la fonction d’appel au modèle est un paramètre', async () => {
    let appels = 0;
    let recu = '';
    const modele: AppelModele = async (messages) => {
      appels++;
      recu = messages.map((m) => m.content).join('\n');
      return JSON.stringify({ remplacements: [{ extrait: 'J-3 : envoi des plannings au client', par: 'J-7 : envoi des plannings au SAIMG', motif: 'CCTP 6.5' }], retraits: [], ajouts: [] });
    };
    const r = await adapterRubrique(rubriqueAdapte, REFERENCE, { dce: DCE_ADAPT, exigences: [{ exigence: 'Planning transmis au moins 7 jours avant le mois' }] }, modele);
    expect(appels).toBe(1);
    expect(recu).toContain('Planning transmis au moins 7 jours avant le mois');
    expect(recu).toContain(REFERENCE);
    expect(r.repli).toBe(false);
    expect(r.texte).toContain('J-7 : envoi des plannings au SAIMG');
    expect(r.fidelite).toBeGreaterThanOrEqual(SEUIL_FIDELITE);
  });

  it('adapterRubrique : une réécriture qui fait chuter la fidélité est refusée (repli progressif ou retour à la référence)', async () => {
    const phrases = ['- J-10 : envoi des plannings du mois suivant ;', '- J-7 : validation des plannings par les agents, avec accusé de réception ;',
      'Comète nous permet de nous adapter très facilement en cas de modification de dernière minute.', 'Il nous donne une vision en temps réel des prises et fins de service.'];
    const modele: AppelModele = async () => JSON.stringify({ retraits: phrases.map((extrait) => ({ extrait })) });
    const progressif = await adapterRubrique(rubriqueAdapte, REFERENCE, { dce: DCE_ADAPT }, modele);
    expect(SEUIL_FIDELITE).toBe(0.9);
    expect(progressif.fidelite).toBeGreaterThanOrEqual(SEUIL_FIDELITE);
    expect(progressif.refusees.some((m) => /fidélité/.test(m.raison || ''))).toBe(true);
    const reference = await adapterRubrique(rubriqueAdapte, REFERENCE, { dce: DCE_ADAPT }, modele, { repli: 'reference' });
    expect(reference.repli).toBe(true);
    expect(reference.texte).toBe(REFERENCE);
  });

  it('adapterRubrique : modèle indisponible ou réponse illisible → texte de référence ; rubrique « fixe » → aucun appel', async () => {
    const enPanne: AppelModele = async () => { throw new Error('429 insufficient_quota'); };
    const r1 = await adapterRubrique(rubriqueAdapte, REFERENCE, {}, enPanne);
    expect(r1).toMatchObject({ repli: true, texte: REFERENCE });
    expect(r1.raison).toMatch(/insufficient_quota/);
    const r2 = await adapterRubrique(rubriqueAdapte, REFERENCE, {}, async () => 'pas du JSON');
    expect(r2).toMatchObject({ repli: true, texte: REFERENCE });
    let appels = 0;
    const fixe = mt.rubriques.find((x) => x.mode === 'fixe')!;
    const r3 = await adapterRubrique(fixe, 'Texte fixe.', {}, async () => { appels++; return '{}'; });
    expect(appels).toBe(0);
    expect(r3.texte).toBe('Texte fixe.');
  });

  it('valeurs imposées par le CCTP : retenues seulement si la citation est dans le DCE et porte le chiffre', async () => {
    const dce = 'Le titulaire doit être présent sur site dans un délai maximal de 30 minutes à compter du déclenchement d’une alarme. Les réunions sont trimestrielles.';
    const modele: AppelModele = async () => JSON.stringify({ valeurs: [
      { variable: 'DELAI_INTERVENTION_ALARME', valeur: '30 minutes', citation: 'présent sur site dans un délai maximal de 30 minutes' },
      { variable: 'FREQ_REUNIONS', valeur: 'chaque mois', citation: 'Les réunions sont mensuelles.' },
      { variable: 'DELAI_PTI', valeur: '15 minutes', citation: 'délai maximal de 30 minutes' },
      { variable: 'CLIENT', valeur: 'X', citation: 'Les réunions sont trimestrielles.' },
    ] });
    const r = await extraireValeursImposees(mt, dce, {}, modele);
    expect(Object.keys(r.imposees)).toEqual(['DELAI_INTERVENTION_ALARME']);
    expect(r.refusees.map((x) => x.variable)).toEqual(['FREQ_REUNIONS', 'DELAI_PTI', 'CLIENT']);
    const prep = preparerMemoireType({ dce: 'Site, 76000 Rouen. Télésurveillance.', imposees: r.imposees }, { memoireType: mt });
    expect(prep.variables.DELAI_INTERVENTION_ALARME.valeur).toBe('30 minutes');
  });
});

// ─── 6. Plan pour l’assistant, exigences, sous-parties ───────────────────────────────────────────

describe('Plan, assistant, exigences et sous-parties', () => {
  const prep = preparerMemoireType({ analyse: { clientName: 'Centre fictif des Docks' }, dce: DCE_NORMANDIE }, { memoireType: mt });

  it('plan v2 en 5 blocs I à V, compréhension d’abord', () => {
    expect(prep.plan.rubriques[0]).toMatchObject({ id: 'b1_comprehension', cle: 'I', titre: 'Notre compréhension de votre besoin' });
    expect(prep.plan.blocs.map((b) => b.cle)).toEqual(['I', 'II', 'III', 'IV', 'V']);
    expect(prep.plan.version).toBe(2);
  });

  it('rattache les exigences de la matrice aux rubriques ; le reste devient des questions nouvelles', () => {
    const r = exigencesParRubrique(mt, prep.plan, [
      { exigence: 'Rondes avec pointeaux toutes les 2 heures', rubrique: 'b4_rondes' },
      { exigence: 'Plannings transmis 10 jours avant le mois', rubrique: 'b_planning' },
      { exigence: 'Le titulaire décrit sa procédure de recrutement et la vérification de la carte professionnelle' },
      { exigence: 'Gestion des objets trouvés et consigne des parapluies', rubrique: 'nouvelle', sujet: 'objets trouvés' },
      { exigence: 'Le mémoire technique est limité à 20 pages maximum' },
    ]);
    expect(r.parRubrique.b4_rondes.length).toBe(1);
    expect(r.parRubrique.b4_planification?.length).toBe(1);
    expect(r.parRubrique.b3_recrutement?.length).toBe(1);
    expect(r.nouvelles.map((e) => e.sujet)).toEqual(['objets trouvés']);
    expect(rechercherRubriques(mt, 'Quelle est votre procédure de remplacement en cas d’absence imprévue ?')[0].id).toBe('b5_remplacement_imprevu');
  });

  it('sous-parties : découpe, ordre des profils demandés', () => {
    const catalogue = mt.rubriques.find((r) => r.id === 'b2_catalogue')!;
    const publie = publierRubrique(mt, catalogue, variables({ CLIENT: 'Site' }), { SSIAP: true, SURVEILLANCE: true, CYNOPHILE: false, TELESURVEILLANCE: false });
    const titres = decouperSousParties(publie.texte!).map((m) => m.titre);
    expect(titres.slice(0, 2)).toEqual(['Nos agents de sécurité incendie (SSIAP)', 'Nos agents de sûreté']);
    const t = 'Intro.\n\n**A**\nun deux trois.\n\n**B**\nquatre cinq six sept.\n\n**C**\nhuit neuf.';
    expect(reordonnerSousParties(t, [{ titre: 'C', priorite: 2, indicateur: 'X' }], { X: true })).toBe('Intro.\n\n**C**\nhuit neuf.\n\n**A**\nun deux trois.\n\n**B**\nquatre cinq six sept.');
  });

  it('le plan ne dépend que des indicateurs : planMemoireType est déterministe', () => {
    const p1 = planMemoireType(mt, prep.indicateurs, { secteurClient: 'culture' });
    const p2 = planMemoireType(mt, prep.indicateurs, { secteurClient: 'culture' });
    expect(p1).toEqual(p2);
    expect(p1.exclues.every((e) => mt.rubriques.find((r) => r.id === e.id)!.condition !== 'toujours')).toBe(true);
  });
});

describe('tour 1 (B1) : ajout après un sous-titre en gras', () => {
  it('jamais collé au sous-titre', () => {
    const t = '**Le contrôle global**\nLe responsable qualité vérifie la prestation chaque mois.\n\nSuite du texte.';
    const r = appliquerModifications(t, { ajouts: [{ apres: '**Le contrôle global**', texte: 'Le site est visité avant la première intervention.', motif: 'x' }] });
    expect(r.texte).not.toMatch(/\*\*Le contrôle global\*\* Le site/);
    expect(r.texte).toContain('chaque mois.\n\nLe site est visité');
  });
});

import { harmoniserNomClient, casseDuDce } from '../src/generation/memoire_type';
/** Tour 2 (T2N-7, T2C-6) : nom de l'acheteur écrit d'une seule façon, graphie du DCE. */
describe('nom de l’acheteur : une seule graphie', () => {
  it('reprend le nom entier écrit en casse mêlée dans le DCE', () => {
    expect(casseDuDce('ROUEN NORMANDIE EVENEMENTS', 'ROUEN NORMANDIE EVENEMENTS. La société Rouen Normandie Evènements. Les événements.')).toBe('Rouen Normandie Evènements');
  });
  it('un mot plein écrit seulement en capitales n’est pas un sigle', () => {
    expect(casseDuDce('LE CENTRE SCIENTIFIQUE ET TECHNIQUE DU BATIMENT', 'LE CENTRE SCIENTIFIQUE ET TECHNIQUE DU BATIMENT. Le centre scientifique et technique du bâtiment.')).toBe('Le Centre scientifique et technique du bâtiment');
  });
  it('harmonise les variantes de casse et d’accents', () => {
    const t = 'Rouen Normandie événements lance le marché. Pour Rouen Normandie Événements, GSS… avec rouen normandie evenements.';
    expect(harmoniserNomClient(t, 'Rouen Normandie Evènements')).toBe('Rouen Normandie Evènements lance le marché. Pour Rouen Normandie Evènements, GSS… avec Rouen Normandie Evènements.');
  });
});

import { formesClient, formeCourteApresPremiere } from '../src/generation/memoire_type';
/** Tour 2 (T2C-9) : forme courte de l'acheteur après la première mention, aussi dans le cadre imposé. */
describe('forme courte de l’acheteur', () => {
  const dceSar = 'Le SAR de Rouen. Le SAR de Rouen notifie. Au SAR de Rouen. Le SAR de Caen. du SAR, le SAR, au SAR.';
  const long = "Ministère de la Justice – Service administratif régional de Rouen / BOP Normand (cours d'appel de Rouen et de Caen)";
  it('nom composé « Tutelle – Entité / Programme » : sigle de l’entité employé par le DCE', () => {
    expect(formesClient(long, dceSar).court).toEqual({ article: 'le', nom: 'SAR de Rouen', genre: '' });
  });
  it('« …, en qualité de coordonnateur… » : forme courte avec son article', () => {
    const f = formesClient('Ville de Vitry-sur-Seine, en qualité de coordonnateur des groupements de commandes Ville/Sidoresto et Ville/CCAS', 'La Ville de Vitry-sur-Seine lance la consultation.');
    expect(f.court?.nom).toBe('Ville de Vitry-sur-Seine');
    expect(f.court?.article).toBe('la');
  });
  it('première mention longue, puis courte, dans l’ordre des réponses', () => {
    const r = formeCourteApresPremiere([`Réponse pour le ${long}.`, `présentation au ${long} et au ${long}.`], long, { article: 'le', nom: 'SAR de Rouen' }, 'le');
    expect(r).toEqual([`Réponse pour le ${long}.`, 'présentation au SAR de Rouen et au SAR de Rouen.']);
  });
});

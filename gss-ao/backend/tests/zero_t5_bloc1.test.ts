/**
 * Tour 5, correcteur : bloc 1 Marine v3 (T5-CONS-1 renvoi en double, T5-CONS-2 et T5N-12 libellés EXIGENCE, T5-CONS-3 clauses
 * de pénalité ou d'assurance, T5-CONS-4 emplacement seul à l'infinitif, T5-CONS-5 renvoi vers la mauvaise rubrique).
 */
import { describe, it, expect } from 'vitest';
import { renvoisManquantsBloc1, titreExigence, MAX_LIBELLE_EXIGENCE, completerBesoinMinimum, libelleEmplacementSeul } from '../src/generation/reponse_libre_v2';
import { preparerMemoireType } from '../src/generation/memoire_type';
import { pageBloc1Marine } from '../src/generation/bloc1_marine';

describe('renvoi du bloc 1 (T5-CONS-1, T5-CONS-5)', () => {
  it('jamais un second renvoi quand la puce en porte déjà un sans flèche', () => {
    const prep: any = preparerMemoireType({ analyse: { clientName: "l'ACOSS" }, dce: 'Caen (14000). Rondes, télésurveillance.' } as any);
    const t = '## Vos attentes et nos engagements\n\n- **« Effectuer la ronde d’ouverture du lundi au vendredi à 05h30 »** : notre réponse est de planifier les passages aux horaires imposés, selon « La planification », développée au bloc 4.';
    expect(renvoisManquantsBloc1(t, prep.plan).texte).toBe(t);
  });
  it('remplacement d\'un agent défaillant → remplacement imprévu ; réversibilité : pas de renvoi', () => {
    const prep: any = preparerMemoireType({ analyse: { clientName: "l'IMM" }, dce: 'Paris (75014). Rondes, PCS, SSIAP, remplacement des agents.' } as any);
    const t = "## Vos attentes et nos engagements\n\n- « En cas de défaillance d’un agent de sécurité, le Titulaire est en mesure d’assurer à tout moment son remplacement dans un délai maximum de quatre heures par un personnel de réserve préalablement autorisé par l’IMM. »\n- « Le Titulaire remettra, au plus tard trente jours avant la fin du marché, un dossier de réversibilité comprenant l'ensemble des éléments nécessaires à la poursuite de l'exploitation. »";
    const r = renvoisManquantsBloc1(t, prep.plan).texte.split('\n');
    expect(r[2]).toMatch(/→ notre réponse : « Le remplacement d'un agent absent : absence non prévue », développée au bloc 5\.$/);
    expect(r[2]).not.toMatch(/Formations et certifications/);
    expect(r[3]).not.toMatch(/→/);
  });
  it('cellule NOTRE RÉPONSE : deux citations identiques successives réduites à une', () => {
    const p = pageBloc1Marine('## Vos attentes et nos engagements\n\n- **Rondes** : « Effectuer la ronde » : notre réponse est de planifier les passages, selon « La planification » : « La planification », développée au bloc 4.');
    expect(p).not.toMatch(/« La planification »\s*:?\s*« La planification »/);
  });
});

describe('libellés EXIGENCE (T5-CONS-2, T5N-12)', () => {
  const t = (x: string) => titreExigence(x, MAX_LIBELLE_EXIGENCE);
  it('jamais « le » retiré de « leur », jamais une case vide ni une tête « Selon »', () => {
    expect(t("Avant leur prise de fonctions effective dans l’établissement, les agents doivent effectuer 2 périodes de travail en présence du public, en doublure avec un agent déjà en poste sur site")).toBe('Effectuer 2 périodes de travail');
    expect(t('Avant leur arrivée sur le site, les agents doivent suivre une formation')).toBe('Suivre une formation');
    expect(t('Pour les SSIAP, maintenir à jour le recyclage SSIAP et le secourisme valide, notamment PSC1 ou SST')).toBe('Maintenir à jour le recyclage SSIAP');
    expect(t('Selon le CCAP, justifier dans les 15 jours suivant la notification du contrat de la souscription des assurances')).not.toMatch(/^Selon/);
  });
  it('jamais coupé sur une préposition ni réduit à un verbe et un nom sans complément', () => {
    expect(t("assurer l'égalité des usagers devant le service public")).not.toMatch(/devant$/);
    expect(t('assurer l’intégralité des prestations sécurité incendie et de sûreté des publics du site')).toBe('Intégralité des prestations sécurité incendie');
  });
});

describe('attentes du bloc 1 sans clause de pénalité ni clause administrative (T5-CONS-3)', () => {
  it('pénalité en fraction et justificatifs d\'assurance écartés', () => {
    const texte = '## Votre contexte et votre site\n\nX lance le marché.\n\n## Vos attentes et nos engagements\n\n- **SSIAP 1** : Les agents doivent être titulaires du SSIAP 1.\n\n## Les points de vigilance identifiés et nos réponses\n\n';
    const r = completerBesoinMinimum(texte, [
      { exigence: "En cas de dépassement d'un délai contractuel d'exécution imputable au titulaire, pénalité de 1/1000 par jour de retard, sans plafond et sans exonération." },
      { exigence: "Selon le CCAP, justifier dans les 15 jours suivant la notification du contrat et avant tout commencement d’exécution de la souscription des assurances, par une attestation." },
      { exigence: 'Le titulaire doit proposer des vacations d\'au moins 4 heures selon les manifestations organisées.' },
    ], undefined, '');
    expect(r.texte).not.toMatch(/1\/1000|souscription des assurances/);
    expect(r.texte).toMatch(/vacations d'au moins 4 heures/);
  });
});

describe('emplacement seul (T5-CONS-4)', () => {
  it('jamais l\'infinitif ni « avec GSS »', () => {
    expect(libelleEmplacementSeul('Définir avec GSS le circuit interne de validation et d’envoi des alertes écrites, ainsi que les modalités.', '')).toBe('Circuit interne de validation et d’envoi des alertes écrites');
    expect(libelleEmplacementSeul('Préciser avec GSS le nom du chef de site', '')).toBe('Nom du chef de site');
    expect(libelleEmplacementSeul('Établir avec GSS la liste des moyens', '')).toBe('Liste des moyens');
  });
});

import { rubriqueDuTheme } from '../src/generation/memoire_type';
describe('délai de présence sur alarme rattaché à la procédure d\'alarme (T5-CONS-7)', () => {
  it('« présent sur chaque site dans un délai maximal de 30 minutes … d\'une alarme »', () => {
    const ids = ['b4_proc_alarme', 'b5_remplacement_prevu', 'b5_remplacement_imprevu'];
    expect(rubriqueDuTheme("GSS sera présent sur chaque site dans un délai maximal de 30 minutes à compter du déclenchement d'une alarme ou de l'appel d'un agent de l'organisme.", ids)).toBe('b4_proc_alarme');
    expect(rubriqueDuTheme("Le titulaire doit être présent sur site dans un délai maximal de 30 minutes après le déclenchement de l'alarme.", ids)).toBe('b4_proc_alarme');
    expect(rubriqueDuTheme("Le remplaçant doit être présent sur site dans un délai d'une heure.", ids)).not.toBe('b4_proc_alarme');
  });
});

describe('libellé EXIGENCE jamais terminé par un adverbe qui attend son complément (T5N-12, rejeu parc_expo)', () => {
  it('« conformément » sans « à la réglementation » : jamais', () => {
    expect(titreExigence("Exécuter les prestations de sécurité incendie conformément à la réglementation citée au CCTP, notamment l'arrêté du 25 juin 1980", MAX_LIBELLE_EXIGENCE)).toBe('Exécuter les prestations de sécurité incendie');
  });
});

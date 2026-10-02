import { grouperNouvelles } from '/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/backend/src/generation/reponse_libre_v2';
const ex = (sujet: string, exigence: string) => ({ sujet, exigence, theme: 'V', criticite: 'importante' } as any);
const r = grouperNouvelles([
  ex('Assurances et garanties financières', "Le titulaire doit être couvert par une assurance garantissant au minimum 10 000 000 € par sinistre pour les dommages corporels."),
  ex('Attestations d’assurance', "Le titulaire transmet chaque année une attestation d'assurance en cours de validité."),
  ex('Attestation d’assurance', "Dans les 15 jours suivant la notification, le titulaire fournit une attestation d'assurance."),
  ex('Modification des assurances', "Le titulaire informe immédiatement par écrit de toute modification, suspension ou résiliation de son contrat d'assurance."),
]);
console.log(r.groupes.length, 'groupes :', r.groupes.map((g) => g.sujet).join(' | '));
const PIECES = /acte d.engagement|bordereau de prix|m[ée]moire technique (?:de|d.une?|limit)|pages? maximum|pi[èe]ces? (?:de l.offre|à (?:remettre|fournir|joindre))|dossier de (?:candidature|l.offre)|paraph[ée]s?|p[ée]nalit|plafonnement|r[ée]vision des prix|facturation|paiement|garantie financi|assurance responsabilit/i;
for (const e of ["Le titulaire transmet chaque année une attestation d'assurance en cours de validité.", "Le titulaire informe immédiatement par écrit de toute modification, suspension ou résiliation de son contrat d'assurance."]) console.log('écartée par PIECES_OU_PENALITES ?', PIECES.test(e), '-', e);

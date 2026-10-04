/**
 * Tour 6, correcteur (T6N-2) : mode dégradé — acheteur et objet lus sans modèle, question selon la vraie cause, réponse de GSS
 * au nom de l'acheteur publipostée comme {{CLIENT}}, couverture sans « Mémoire technique » en objet.
 */
import { describe, it, expect } from 'vitest';
import { acheteurDuDce, objetDuDce, remplacerRepliClient, preparerMemoireType, chargerMemoireType, formeCourteApresPremiere } from '../src/generation/memoire_type';
import { couvertureV3 } from '../src/generation/marp_pages_marine';
import { QUESTION_NOM_ACHETEUR, QUESTION_OBJET_MARCHE } from '../src/generation/completion';

describe('nom de l\'acheteur et objet lus sans modèle', () => {
  it.each([
    ['\n===== PIÈCE : Acted_engagement.pdf =====\n                               ACTE D\'ENGAGEMENT\n\nACCORD-CADRE DE FOURNITURES COURANTES ET DE SERVICES\n\n      CONTRAT N°\n\n                        ROUEN NORMANDIE EVENEMENTS\n                            48 Avenue des Canadiens\n                           76120 LE GRAND QUEVILLY\n', 'ROUEN NORMANDIE EVENEMENTS'],
    ['\n===== PIÈCE : RC_2026-04_Gardiennage.pdf =====\n      INSTITUT DE FORMATION INTERHOSPITALIER\n                  THÉODORE SIMON\n                                                ***\n                                Groupement d’Intérêt Public\n                                19, avenue de Maison Blanche\n', 'INSTITUT DE FORMATION INTERHOSPITALIER THÉODORE SIMON'],
    ['\n===== PIÈCE : Acte_engagement_2026-01-SECU.pdf =====\n           ASSOCIATION NOUVEL INSTITUT MÉDICO-CHIRURGICAL MONTSOURIS\n                                (Nouvel IMM) – Association régie par la loi du 1er juillet 1901\n                                  SIREN 992 985 036 – 42 boulevard Jourdan, 75014 Paris\n', 'ASSOCIATION NOUVEL INSTITUT MÉDICO-CHIRURGICAL MONTSOURIS (Nouvel IMM)'],
    ['\n===== PIÈCE : 09 - CCTP.pdf =====\n             ECOLE NATIONALE DES PONTS ET CHAUSSEES\n\n\n  INSTITUT NATIONAL DE L’INFORMATION GEOGRAPHIQUE ET FORESTIERE\n\n   Cahier des Clauses Techniques Particulières\n', 'ECOLE NATIONALE DES PONTS ET CHAUSSEES et INSTITUT NATIONAL DE L’INFORMATION GEOGRAPHIQUE ET FORESTIERE'],
    ['L\'IFITS se réserve le droit de faire varier le volume. Les locaux de l’Institut de Formation Interhospitalier Théodore Simon (IFITS).', 'IFITS'],
    ['Le RSEM se réserve le droit d\'accès. Le responsable du suivi et de l’exécution du marché (RSEM) est désigné.', ''],
  ])('%#', (dce, nom) => expect(acheteurDuDce(dce)).toBe(nom));
  it('objet du marché, même coupé en fin de ligne', () => {
    expect(objetDuDce('Objet du marché\nLe présent marché a pour objet la prestation de services en gardiennage avec agent\nconducteur de chien et le contrôle de surveillance à distance des locaux.\nSuite.')).toBe('Prestation de services en gardiennage avec agent conducteur de chien et le contrôle de surveillance à distance des locaux');
    expect(objetDuDce('La consultation a pour objet de définir les prestations de gardiennage du site.')).toBe('Définir les prestations de gardiennage du site');
  });
});

describe('question selon la vraie cause', () => {
  it('lecture sans modèle : « La lecture automatique du DCE a échoué »', () => {
    const p: any = preparerMemoireType({ analyse: { lectureSansModele: true }, dce: '\n\n--- CCTP ---\nSurveillance du site, 76000 Rouen.\n', referents: '' } as any, { memoireType: chargerMemoireType() } as any);
    expect(p.variables.CLIENT.question).toBe("La lecture automatique du DCE a échoué : quel est le nom exact de l'acheteur ?");
    expect(QUESTION_NOM_ACHETEUR.test(p.variables.CLIENT.question)).toBe(true);
    expect(QUESTION_OBJET_MARCHE.test(chargerMemoireType().variables.OBJET_MARCHE.question!)).toBe(true);
  });
});

describe('réponse de GSS au nom de l\'acheteur publipostée comme {{CLIENT}}', () => {
  const t = 'Votre établissement lance le marché de sécurité privée. Les plannings sont envoyés à votre établissement ; le site de votre établissement reçoit les agents, et votre établissement peut, s\'il le souhaite, demander un rapport.\n• éteindre les lumières ;';
  it.each([
    ['IFITS', "L'IFITS lance le marché de sécurité privée. Les plannings sont envoyés à l'IFITS ; le site de l'IFITS reçoit les agents, et l'IFITS peut, s'il le souhaite, demander un rapport.\n• éteindre les lumières ;"],
    ['Ville de Rouen', "La Ville de Rouen lance le marché de sécurité privée. Les plannings sont envoyés à la Ville de Rouen ; le site de la Ville de Rouen reçoit les agents, et la Ville de Rouen peut, si elle le souhaite, demander un rapport.\n• éteindre les lumières ;"],
    ['Centre Henri Becquerel', "Le Centre Henri Becquerel lance le marché de sécurité privée. Les plannings sont envoyés au Centre Henri Becquerel ; le site du Centre Henri Becquerel reçoit les agents, et le Centre Henri Becquerel peut, s'il le souhaite, demander un rapport.\n• éteindre les lumières ;"],
    ['Archives nationales', "Les Archives nationales lancent le marché de sécurité privée. Les plannings sont envoyés aux Archives nationales ; le site des Archives nationales reçoit les agents, et les Archives nationales peuvent, si elles le souhaitent, demander un rapport.\n• éteindre les lumières ;"],
  ])('%s', (nom, attendu) => expect(remplacerRepliClient(t, nom)).toBe(attendu));
});

describe('couverture et forme courte', () => {
  it('objet inconnu : jamais « Mémoire technique » écrit comme objet du marché', () => {
    const c = couvertureV3({ client: '', title: 'Mémoire technique' }, { accent: '#F15A22' } as any);
    expect(c).not.toMatch(/Objet du marché/);
    expect(c).not.toMatch(/class="obj"/);
  });
  it('nom long suivi de sa forme courte entre parenthèses : jamais « l\'IFITS (IFITS) »', () => {
    expect(formeCourteApresPremiere(["L'Institut de Formation Interhospitalier Théodore Simon lance le marché.", 'les locaux de l’Institut de Formation Interhospitalier Théodore Simon (IFITS) sont surveillés.'], 'Institut de Formation Interhospitalier Théodore Simon', { article: "l'", nom: 'IFITS' }, "l'")[1]).toBe('les locaux de l’IFITS sont surveillés.');
  });
});

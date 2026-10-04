// Campagne « zéro défaut », tour 2 : nettoyage des textes rédigés (T2-CONS-1, T2-CONS-8).
import { describe, it, expect } from 'vitest';
import { retirerCommentairesInternes } from '../src/generation/base_memoires';

describe('« sans poste fixe » retiré avec toute son énumération (T2-CONS-1, génération réelle cstb 1201)', () => {
  it.each([
    ['Le CCTP prévoit des interventions de rondiers, sans poste fixe, accueil ni standard.', 'Le CCTP prévoit des interventions de rondiers.'],
    ['Le marché porte sur des rondes, sans poste fixe ni accueil.', 'Le marché porte sur des rondes.'],
    ['Le marché porte sur des rondes, sans poste fixe, ni accueil, ni standard.', 'Le marché porte sur des rondes.'],
    ["Des rondes sans poste fixe permanent d'accueil.", 'Des rondes.'],
    ['- Postes fixes : non ; le marché porte sur des interventions de rondiers, sans poste permanent ni mission d’accueil ou de standard.', '- Postes fixes : non ; le marché porte sur des interventions de rondiers.'],
    // Complément qui suivrait seul la mention retirée : la phrase reste entière.
    ['Nous assurons la continuité, sans poste permanent supplémentaire.', 'Nous assurons la continuité, sans poste permanent supplémentaire.'],
    ['Un agent assure un poste permanent d’accueil.', 'Un agent assure un poste permanent d’accueil.'],
  ])('%s', (entree, attendu) => {
    expect(retirerCommentairesInternes(entree).texte).toBe(attendu);
  });
});

describe('délai renvoyé à une décision ultérieure : commentaire retiré (T2-CONS-8, cadre etampes1 1202)', () => {
  it('« est à arrêter avec la Ville » retiré, l’emplacement « Délai proposé » gardé', () => {
    const t = "GSS déclenche la mobilisation des agents d’astreinte. Le délai maximal de réaction et d’arrivée sur site est à arrêter avec la Ville selon les équipements concernés.\nDélai proposé pour une action d’urgence liée à un débordement : [À COMPLÉTER].";
    const r = retirerCommentairesInternes(t);
    expect(r.texte).toBe("GSS déclenche la mobilisation des agents d’astreinte.\nDélai proposé pour une action d’urgence liée à un débordement : [À COMPLÉTER].");
    expect(r.retires).toHaveLength(1);
  });
  it('un fait ou un engagement daté reste', () => {
    const t = 'Le délai de remplacement est fixé à 2 heures. Les consignes sont définies avec le client lors de la réunion de démarrage.';
    expect(retirerCommentairesInternes(t).texte).toBe(t);
  });
});

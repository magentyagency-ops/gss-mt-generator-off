// Tour 2 (T2N-5, vitry 202) : mises en situation événementielles (forum, concert jusqu'à 10 000 personnes) dimensionnées
// par une proposition de GSS à valider (D5) : nombre d'agents par fonction, PIF, détecteurs de métaux.
import { describe, it, expect } from 'vitest';
import { calculerDimensionnement, lireMisesEnSituation, completerMisesEnSituation, questionsMisesEnSituation, extraitDimensionnement, texteDimensionnement, messageDimensionnement, CONSIGNE_DIMENSIONNEMENT } from '../src/generation/dimensionnement';

const RC = `Critère n°1 : Valeur technique (50 points)
Sous-critère n° 1 Mises en situation
Mise en situation 1 : Vous devez assurer la sécurité d’un forum des associations dans un parc (voir plan joint) dont voici les caractéristiques principales : - entrée libre et gratuite - journée - en plein air, mais dans une enceinte fermée ( - capacité maximale d’accueil du public : jusqu’à 10 000 personnes au vu du nombre d’issues de secours existantes.
Mise en situation 2 : Vous devez assurer la sécurité d’un concert (voir plan joint) dont voici les caractéristiques principales : - entrée libre et gratuite - nocturne - en plein air, mais dans une enceinte fermée (complexe sportif) - capacité maximale d’accueil du public : jusqu’à 10 000 personnes au vu du nombre d’issues de secours existantes. - Comprenant plusieurs concerts et un feu d’artifice`;
const reponseModele = {
  postes: [], cas_pratique: null,
  mises_en_situation: [
    { libelle: 'Mise en situation 1 : forum des associations (journée, plein air, enceinte fermée)', citation: 'assurer la sécurité d’un forum des associations dans un parc', capacite: 10000,
      dispositif: [{ fonction: 'Chef de site', nombre: 1, justification: 'pilotage' }, { fonction: 'Agent de sécurité au filtrage des accès', nombre: 12, justification: 'entrées' }, { fonction: 'Agent de sécurité en surveillance et rondes', nombre: 8, justification: 'enceinte' }],
      pif: 4, detecteurs: 8 },
    { libelle: 'Mise en situation 2 : concert nocturne avec feu d’artifice', citation: 'assurer la sécurité d’un concert (voir plan joint) dont voici', capacite: 10000,
      dispositif: [{ fonction: 'Chef de site', nombre: 2, justification: '' }, { fonction: 'Agent de sécurité au filtrage des accès', nombre: 16, justification: '' }], pif: 6, detecteurs: 12 },
    { libelle: 'Mise en situation inventée', citation: 'une phrase qui ne figure nulle part dans le dossier de consultation', capacite: 5000, dispositif: [{ fonction: 'Agent', nombre: 3 }], pif: null, detecteurs: null },
  ],
};

describe('mises en situation événementielles (T2N-5)', () => {
  it('relevées du DCE, nombres contrôlés, citation inconnue écartée', () => {
    const d = calculerDimensionnement(reponseModele, RC)!;
    expect(d).not.toBeNull();
    expect(d.misesEnSituation!.map((m) => [m.total, m.pif, m.detecteurs, m.capacite])).toEqual([[21, 4, 8, 10000], [18, 6, 12, 10000]]);
    expect(d.profils).toEqual([]);
    expect(lireMisesEnSituation([{ ...reponseModele.mises_en_situation[0], capacite: 12000 }], RC)[0].capacite).toBeNull();
    expect(lireMisesEnSituation([{ ...reponseModele.mises_en_situation[0], dispositif: [{ fonction: 'Agent', nombre: 2.5 }] }], RC)).toEqual([]);
  });
  it('réponse sans nombre complétée par le dispositif proposé ; question exacte à GSS', () => {
    const d = calculerDimensionnement(reponseModele, RC)!;
    const texte = "Le nombre d'agents de sécurité, de chefs de site et d'agents de comptage est établi à partir du plan joint, selon les flux attendus.";
    const c = completerMisesEnSituation(texte, d);
    expect(c.n).toBe(2);
    expect(c.texte).toContain('• Mise en situation 1 : forum des associations (journée, plein air, enceinte fermée) : 21 agents en service (1 chef de site, 12 agents de sécurité au filtrage des accès, 8 agents de sécurité en surveillance et rondes) ; 4 postes d\'inspection filtrage (PIF) ; 8 détecteurs de métaux.');
    expect(completerMisesEnSituation(c.texte, d).n).toBe(0);
    const q = questionsMisesEnSituation(d);
    expect(q[0]).toBe("Proposition à valider : Mise en situation 1 : forum des associations (journée, plein air, enceinte fermée) (jusqu'à 10 000 personnes) : validez-vous 21 agents en service (1 chef de site, 12 agents de sécurité au filtrage des accès, 8 agents de sécurité en surveillance et rondes) ; 4 postes d'inspection filtrage (PIF) ; 8 détecteurs de métaux ?");
    expect(texteDimensionnement(d)).toContain('Reprends ces nombres EXACTEMENT');
    expect(messageDimensionnement(d)).toContain('mise en situation 2 : concert nocturne');
  });
  it('le règlement de consultation n’est lu que pour ses mises en situation ; la consigne les demande', () => {
    const dce = `\n\n--- RC VF_SECU_EVEN.pdf ---\nArticle 1 Objet.\n${'Texte administratif. '.repeat(200)}\n${RC}\n\n--- CCP VF SECU EVEN.pdf ---\nPrestations de sécurité des événements.`;
    const e = extraitDimensionnement(dce);
    expect(e).toContain('capacité maximale d’accueil du public : jusqu’à 10 000 personnes');
    expect(e).not.toMatch(/Article 1 Objet/);
    expect(CONSIGNE_DIMENSIONNEMENT).toMatch(/"mises_en_situation"/);
  });
});

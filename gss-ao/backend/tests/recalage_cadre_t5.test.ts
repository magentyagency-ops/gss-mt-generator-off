// Tour 5 (T5CP-10 etampes2 552, T5-COH-3 citedia2 474) : recalage du cadre sur le mémoire type de GSS.
import { describe, it, expect } from 'vitest';
import { recalerSurReference } from '../src/generation/memoire_type_cadre';

describe('recalage du cadre : listes et renvois de GSS', () => {
  it('liste numérotée de GSS reprise avec ses numéros et sa phrase d’introduction', () => {
    const ref = "L'intégration d'un nouvel agent sur un site est une étape importante : il doit être opérationnel le plus rapidement possible. Nous suivons pour cela un rétroplanning :\n1. Sélection du profil : après avoir déterminé les besoins du site, nous sélectionnons le meilleur profil d'agent.\n2. Formation théorique : à partir du LMC, l'agent étudie les consignes et les procédures exigées sur le site.\n3. Première vacation : une fois formé, l'agent est planifié et intègre le site.";
    const rep = "L'intégration d'un nouvel agent sur un site est une étape importante : il doit être opérationnel le plus rapidement possible.\n• Sélection du profil : après avoir déterminé les besoins de la manifestation, nous sélectionnons le meilleur profil d'agent.\n• Formation théorique : à partir du LMC, l'agent étudie les consignes et les procédures exigées sur le site.";
    const r = recalerSurReference(ref, rep, { limite: true });
    expect(r.texte).toContain('Nous suivons pour cela un rétroplanning :\n1. Sélection du profil');
    expect(r.texte).toContain('\n2. Formation théorique');
    expect(r.texte).toContain('\n3. Première vacation');
    expect(r.texte).not.toMatch(/^(?:Sélection|Formation)/m);
  });
  it('élément d’une liste à « ; » réécrit : rétabli tel que GSS l’a écrit', () => {
    const ref = "Contrôle intérieur : rondes de contrôle dans les zones d'accueil et les bureaux ; posture rassurante, par une présence forte ; en cas d'incivilité, l'agent se rapproche de la zone de conflit pour protéger le personnel ou toute personne en danger et désamorce au maximum la situation ; appel aux forces de l'ordre en cas de danger ou de menace non maîtrisable ; prise en charge des malaises et des chutes : gestes de premiers secours et alerte du SAMU.";
    const rep = "Contrôle intérieur : rondes de contrôle dans les zones d'accueil et les bureaux ; posture rassurante, par une présence forte ; Sur un site qui accueille du public, en cas d’incivilité, l’agent se rapproche de la zone de conflit pour protéger le personnel ou toute personne en danger et désamorce au maximum la situation ; appel aux forces de l'ordre en cas de danger ou de menace non maîtrisable. prise en charge des malaises et des chutes : gestes de premiers secours et alerte du SAMU.";
    expect(recalerSurReference(ref, rep).texte).toBe(ref);
  });
  it('« Dans les deux cas » sans les deux cas juste avant : phrase retirée ; après « S’il accepte… S’il refuse… » : gardée', () => {
    const ref = 'Les prises et fins de service sont consignées dans la main courante. La main courante se doit d’être intelligible et synthétisée.';
    const rep = `${ref} Dans les deux cas, l'agent rédige un rapport d'incident sur la main courante et un rapport écrit est envoyé par mail au client.`;
    expect(recalerSurReference(ref, rep).texte).toBe(ref);
    const ref2 = "L'agent demande à l'individu de quitter le site.\n• S'il accepte, l'agent le raccompagne jusqu'à la sortie.\n• S'il refuse, l'agent fait appel aux forces de l'ordre.\nDans les deux cas, l'agent rédige un rapport d'incident sur la main courante.";
    expect(recalerSurReference(ref2, ref2).texte).toBe(ref2);
  });
});

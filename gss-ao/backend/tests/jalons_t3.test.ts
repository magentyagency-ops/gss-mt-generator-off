// T3N-6 : les jalons du calendrier de GSS (J-10, J-7, J-3) ne sont jamais remplacés par le délai du CCTP (ifsem 335).
import { describe, it, expect } from 'vitest';
import { motifRefusAlignement, jalonsDe } from '../src/generation/base_memoires';
import { questionJalons } from '../src/generation/memoire_generator';

const section = `Notre calendrier de planification :
- J-10 : envoi des plannings du mois suivant ;
- J-7 : validation des plannings par les agents, avec accusé de réception ;
- J-3 : envoi des plannings au CNRS ;
- en cas de commande supplémentaire ou de modification : envoi du nouveau planning à l'agent et au CNRS.`;

describe('jalons du calendrier de GSS (T3N-6)', () => {
  it('jalonsDe normalise les jalons', () => {
    expect(jalonsDe('J - 10, J–7 et J+2 ; JJ-3 non')).toEqual(['J-10', 'J-7', 'J+2']);
  });
  it('remplacement d’un jalon par le délai du CCTP refusé', () => {
    expect(motifRefusAlignement('- J-10 : envoi des plannings du mois suivant ;', '- au moins 10 jours ouvrés avant le début du mois suivant : envoi des plannings du mois suivant ;')).toBe('jalon du calendrier de GSS');
    expect(motifRefusAlignement('- J-3 : envoi des plannings au CNRS ;', '- au moins 10 jours ouvrés avant le début du mois suivant : envoi des plannings au CNRS ;')).toBe('jalon du calendrier de GSS');
  });
  it('un alignement sans jalon reste possible', () => {
    expect(motifRefusAlignement('Les contrôles inopinés ont lieu une à trois fois par mois.', 'Les contrôles inopinés ont lieu au moins trois fois par mois.')).toBe('');
  });
  it('une seule question précise, qui reprend la question de couverture sur la même obligation', () => {
    const q = new Set<string>([
      'Quelle organisation prévoyez-vous pour établir et transmettre un planning prévisionnel mensuel nominatif au moins 10 jours ouvrés avant le début du mois suivant et informer préalablement le CNRS des changements du titulaire avec un préavis minimal de 48 h ?',
      'Quelle adresse électronique dédiée prévoyez-vous ?',
    ]);
    const r = questionJalons(q, 'Planning prévisionnel mensuel nominatif transmis au moins 10 jours ouvrés avant le début du mois suivant.', section);
    expect(q.size).toBe(2);
    expect(r).toMatch(/^Le DCE exige : « Planning prévisionnel mensuel nominatif transmis au moins 10 jours ouvrés avant le début du mois suivant »\. Le calendrier de GSS écrit dans le mémoire est : « J-10 : envoi des plannings du mois suivant ; J-7 : validation des plannings par les agents, avec accusé de réception ; J-3 : envoi des plannings au CNRS »\./);
    expect(r).toMatch(/préavis minimal de 48 h/);
    expect([...q].filter((x) => /10 jours ouvrés/.test(x))).toHaveLength(1);
  });
});

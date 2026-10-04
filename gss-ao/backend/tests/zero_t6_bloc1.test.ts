/**
 * Tour 6, correcteur : bloc 1 Marine v3 (libellés EXIGENCE, formalités de l'offre, schéma de secours).
 */
import { describe, it, expect } from 'vitest';
import { titreExigence, MAX_LIBELLE_EXIGENCE, libelleExigenceBloc1, formalitesDuBloc1, etapesDesPuces, specSecoursBesoin } from '../src/generation/reponse_libre_v2';
import { pageBloc1Marine } from '../src/generation/bloc1_marine';

describe('libellé EXIGENCE : locution gardée entière (T6N-1)', () => {
  it.each([
    ['[…] a minima 5 jours ouvrés […]', 'A minima 5 jours ouvrés'],
    ['[…] au plus tard 4 jours ouvrés avant leur prise d’effet', 'Au plus tard 4 jours ouvrés'],
    ['au plus tard 48 heures avant le début de la prestation', 'Au plus tard 48 heures avant la prestation'],
    ['au moins 10 jours avant le début du mois considéré', 'Au moins 10 jours avant le mois considéré'],
    ['dans un délai maximum de 30 minutes', 'Dans un délai maximum de 30 minutes'],
    ['à minima 2 rondes par nuit', 'A minima 2 rondes par nuit'],
    ['en moins de 30 (trente) minutes', 'En moins de 30 minutes'],
  ])('%s', (c, attendu) => expect(titreExigence(c, MAX_LIBELLE_EXIGENCE)).toBe(attendu));
  it('jamais amputé de son premier mot', () => {
    for (const c of ['au plus tard 48 heures avant le début', 'au moins 10 jours avant', 'a minima 5 jours ouvrés']) expect(titreExigence(c, MAX_LIBELLE_EXIGENCE)).not.toMatch(/^(?:Plus tard|Moins|Minima)/);
  });
});

describe('libellé EXIGENCE en groupe nominal court, jamais la phrase « besoin » (T6-CONS-12)', () => {
  it.each([
    ['l’intervention doit pouvoir être déclenchée après une alarme ou une situation étrange visualisée par caméra', 'en moins de 30 (trente) minutes', 'Intervention en moins de 30 minutes'],
    ['les vacations fragmentées sont organisées selon le calendrier de l’annexe 2', 'Le planning mensuel des interventions des agents conducteur de chien pour le mois suivant, au minimum 3 (trois) jours avant la fin du mois en cours', 'Planning mensuel des interventions'],
    ['l’organisation doit préserver la continuité des vacations', 'un système d’astreinte permettant de pallier au plus vite l’absence de l’agent', 'Système d’astreinte'],
    ['ce bilan doit couvrir mobilité décarbonée, éco-conduite et achats écoresponsables', 'le titulaire fournira chaque année un bilan concernant l’éco-mobilité et l’éco-responsabilité de ses agents', 'Bilan concernant l’éco-mobilité'],
    ['prévoir une astreinte pour le remplacement d’un absent', 'dans un délai maximal de deux heures', 'prévoir une astreinte pour le remplacement d’un absent'],
  ])('%s', (b, c, attendu) => expect(libelleExigenceBloc1(b, c)).toBe(attendu));
  it('formalité de l\'offre retirée des points de vigilance et renvoyée pour la question', () => {
    const t = "## Les points de vigilance identifiés et nos réponses\n- **Visite obligatoire** : sans visite du site, l’offre est déclarée non recevable → notre réponse : « L'intégration d'un nouveau marché » (bloc 4).\n- **Périmètre des alarmes** : la gestion à distance concerne l’alarme intrusion → notre réponse : « Notre socle de procédures » (bloc 4).";
    const f = formalitesDuBloc1(t);
    expect(f.texte).not.toMatch(/Visite obligatoire/);
    expect(f.texte).toMatch(/Périmètre des alarmes/);
    expect(f.formalites).toEqual(['sans visite du site, l’offre est déclarée non recevable']);
  });
  it('tableau du bloc 1 : libellés courts', () => {
    const t = "## Vos attentes et nos engagements\n- **« en moins de 30 (trente) minutes »** : l’intervention doit pouvoir être déclenchée après une alarme ou une situation étrange visualisée par caméra → notre réponse : « Notre socle de procédures : l’intervention sur alarme et la télésurveillance », développé au bloc 4.\n- **« le titulaire fournira chaque année un bilan concernant l’éco-mobilité et l’éco-responsabilité de ses agents »** : ce bilan doit couvrir mobilité décarbonée, éco-conduite et achats écoresponsables → notre réponse : « Notre engagement écologique », développé au bloc 5.";
    const p = pageBloc1Marine(t, {}, { sources: false, bandeau: false });
    expect(p).toContain('| Intervention en moins de 30 minutes |');
    expect(p).toContain('| Bilan concernant l’éco-mobilité |');
    expect(p).not.toMatch(/\| (?:L’intervention doit|Ce bilan doit)/);
  });
});

describe('schéma de secours du bloc 1 (T6-CONS-14)', () => {
  const t = "## Le périmètre de la prestation demandée\n| Site | Poste | Jours et horaires |\n|---|---|---|\n| Site de l’IFITS | Un poste physique intermittent | Semaine (lundi au vendredi) : 5h00 à 8h00 et 17h00 à 20h00 |\n\n## Vos attentes et nos engagements\n- **« L’ensemble du système de surveillance à distance des locaux de l’IFITS doit être fonctionnel dans le mois qui suit le démarrage des prestations »** : nous préparons la mise en service et l’articulation des moyens de surveillance → notre réponse : « La mise en place d'une prestation », développée au bloc 4.\n\n## Les points de vigilance identifiés et nos réponses\n- **Visite obligatoire** : sans visite du site, l’offre est déclarée non recevable → notre réponse : « L'intégration d'un nouveau marché » (bloc 4).\n\nL’IFITS bénéficie d’une continuité du service sur les vacations prévues.";
  it('jamais un titre coupé (« L\'ensemble du système ») ni une formalité de l\'offre comme étape', () => {
    const titres = (specSecoursBesoin(t)?.params?.etapes || []).map((e: any) => e.titre);
    expect(titres).not.toContain('L’ensemble du système');
    expect(titres.join(' ')).not.toMatch(/intégration d'un nouveau marché|Visite/i);
    expect(etapesDesPuces(t).map((e) => e.titre)).toEqual(['Système de surveillance à distance']);
  });
});

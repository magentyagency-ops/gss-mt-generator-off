import { describe, it, expect } from 'vitest';
import {
  SuiviAdaptations, changements, consultationsAdaptations, messageAdaptations, deciderAdaptation, exigenceDuFiltre,
  adaptationsDuPubliposte, TITRE_ADAPTATIONS, type PhraseAdaptee,
} from '../src/generation/adaptations_cctp';
import { delaisHorsNormandie, interditsDce } from '../src/generation/base_memoires';
import { chargerMemoireType } from '../src/generation/memoire_type';

/**
 * Décision D8 (2 octobre 2026, « A avec signalement ») : une phrase de GSS adaptée au CCTP reste adaptée (le CCTP prime),
 * mais elle est signalée à GSS (rubrique, phrase d'origine, phrase adaptée, exigence du CCTP citée), qui la valide, la
 * modifie ou rétablit sa phrase d'origine ; son choix est repris à la génération suivante.
 */

// Cas réel ifits 181 : la tablette Trackforce de GSS devient la main courante imposée par le CCTP (article 7).
const GSS_COMM = `Pour assurer la remontée des informations, nos agents disposent :
- d'une **tablette équipée de la main courante électronique Trackforce**, qui permet de remplir la main courante facilement et au client de la consulter en temps réel ;
- d'un téléphone portable professionnel, qui permet de joindre à tout moment le chef de site et l'astreinte.`;
const ADAPTEE_COMM = GSS_COMM.replace("d'une **tablette équipée de la main courante électronique Trackforce**, qui permet de remplir la main courante facilement et au client de la consulter en temps réel ;", "d'une **main courante fournie par GSS et mise à disposition dans l’accueil**, qui permet de consigner les événements de vacation ;");
const EXIGENCE_IFITS = "Dans ce local, l’agent de surveillance présent dispose d’une main courante, fournie par le titulaire, sur laquelle il consigne tous les évènements inhérents à sa vacation (rondes, incidents, mise en fonction de l’alarme, passage du personnel à des horaires inhabituels, évènement inhabituel, etc…).";
const DCE_IFITS = `ARTICLE 7. LOCAL & ÉQUIPEMENTS MIS À DISPOSITION POUR LE GARDIENNAGE
L’IFITS met à disposition du personnel de surveillance, au sein de son accueil (chauffé et éclairé) une zone pour pouvoir déposer ses matériels et équipements, s’assoir et écrire.
${EXIGENCE_IFITS}
Lieu d'exécution : IFITS, 1 rue Théodore Simon, 93330 Neuilly-sur-Marne.`;

// Cas réel cstb 221 : le rétroplanning J-30 / J+30 de GSS remplacé par la phase de prise en charge du CCTP.
const GSS_CSTB = `Pour chaque nouveau marché, nous procédons toujours de la même manière, selon un rétroplanning qui court de 30 jours avant à 30 jours après le début du marché : il nous faut en général un mois pour nous préparer et préparer nos agents, puis un mois de recul et d'observation pour valider définitivement l'équipe.
- **J-30 — réunion sur site** : collecte des éventuelles informations manquantes, désignation du chef de site et communication de ses missions.`;
const ADAPTEE_CSTB = GSS_CSTB.replace("selon un rétroplanning qui court de 30 jours avant à 30 jours après le début du marché : il nous faut en général un mois pour nous préparer et préparer nos agents, puis un mois de recul et d'observation pour valider définitivement l'équipe.", "selon un rétroplanning qui court de la notification à deux semaines après la notification : nous organisons la préparation et l'observation nécessaires pour valider définitivement l'équipe dans le délai du marché.");

const titreDe = (id: string) => ({ b4_communication: 'Nos moyens de communication', b5_nouveau_marche: 'La mise en place d\'un nouveau marché' } as Record<string, string>)[id] || id;

function generation(decisions: PhraseAdaptee[] = []) {
  const suivi = new SuiviAdaptations({ reference: [GSS_COMM, GSS_CSTB], decisions });
  const sections: Record<string, string> = { b4_communication: GSS_COMM, b5_nouveau_marche: GSS_CSTB };
  // Passe « Cohérence avec le CCTP » (réponse du contrôle simulée) : remplacements exacts.
  const avant = sections.b4_communication;
  sections.b4_communication = ADAPTEE_COMM;
  suivi.noterCoherence('b4_communication', avant, sections.b4_communication, EXIGENCE_IFITS, []);
  const avant2 = sections.b5_nouveau_marche;
  sections.b5_nouveau_marche = ADAPTEE_CSTB;
  suivi.noterCoherence('b5_nouveau_marche', avant2, sections.b5_nouveau_marche, '', ['Article 2.5.2 - Phase de prise en charge : le titulaire démarre la prise en charge dès la notification du marché et la termine au plus tard deux semaines après la notification.', 'Rapport mensuel avant le 5 du mois']);
  const liste = suivi.finaliser(sections, titreDe);
  return { sections, liste };
}

describe('D8 : phrases de GSS adaptées au CCTP, signalées', () => {
  it('changements : phrase remplacée et phrase retirée (avec ses voisines), ajout ignoré', () => {
    const c = changements(GSS_COMM, ADAPTEE_COMM);
    expect(c).toHaveLength(1);
    expect(c[0].origine).toMatch(/Trackforce/);
    expect(c[0].adaptee).toMatch(/mise à disposition dans l’accueil/);
    const r = changements('Phrase A de GSS. Phrase B promet 45 minutes. Phrase C de GSS.', 'Phrase A de GSS. Phrase C de GSS. Phrase D ajoutée par l\'IA.');
    expect(r).toEqual([{ origine: 'Phrase B promet 45 minutes.', adaptee: '', avant: 'Phrase A de GSS.', apres: 'Phrase C de GSS.' }]);
  });

  it('ifits et cstb : chaque phrase adaptée est listée avec rubrique, origine, phrase adaptée et exigence du CCTP citée', () => {
    const { sections, liste } = generation();
    expect(liste).toHaveLength(2);
    const [a, b] = liste;
    expect(a).toMatchObject({ n: 1, rubrique: 'b4_communication', titre: 'Nos moyens de communication', statut: 'a_valider', exigence: EXIGENCE_IFITS, etape: 'Cohérence avec le CCTP' });
    expect(a.origine).toMatch(/tablette équipée de la main courante électronique Trackforce/);
    expect(a.adaptee).toMatch(/main courante fournie par GSS et mise à disposition dans l’accueil/);
    // Exigence non citée par le contrôle : l'exigence la plus proche de la liste (cstb : phase de prise en charge).
    expect(b).toMatchObject({ n: 2, rubrique: 'b5_nouveau_marche' });
    expect(b.exigence).toMatch(/Phase de prise en charge/);
    expect(b.origine).toMatch(/30 jours avant à 30 jours après/);
    expect(b.adaptee).toMatch(/de la notification à deux semaines après la notification/);
    // Le CCTP prime : le texte remis garde la phrase adaptée, sans aucune trace du signalement.
    expect(sections.b4_communication).toBe(ADAPTEE_COMM);
    expect(Object.values(sections).join('\n')).not.toMatch(/Phrase adaptée|Phrases adaptées|Exigence du CCTP|phrase d'origine/i);

    const cons = consultationsAdaptations(liste);
    expect(cons).toHaveLength(2);
    expect(cons[0]).toBe(`${TITRE_ADAPTATIONS} (2) — n° 1, « Nos moyens de communication » : phrase d'origine de GSS : « d'une tablette équipée de la main courante électronique Trackforce, qui permet de remplir la main courante facilement et au client de la consulter en temps réel ; » ; phrase adaptée : « d'une main courante fournie par GSS et mise à disposition dans l’accueil, qui permet de consigner les événements de vacation ; » ; exigence du CCTP : « ${EXIGENCE_IFITS} ». À valider, modifier ou rétablir via l'assistant avant la remise.`);
    const msg = messageAdaptations(liste);
    expect(msg.split('\n')[0]).toBe(`${TITRE_ADAPTATIONS} (2) : le cahier des charges prime sur votre texte, ces phrases de votre mémoire type ont été modifiées pour s'y conformer. À relire avant la remise :`);
    expect(msg).toContain('1. « Nos moyens de communication »');
    expect(msg).toContain('   - Phrase d\'origine de GSS : « d\'une tablette équipée de la main courante électronique Trackforce');
    expect(msg).toContain('   - Phrase adaptée : « d\'une main courante fournie par GSS et mise à disposition dans l’accueil');
    expect(msg).toContain(`   - Exigence du CCTP : « ${EXIGENCE_IFITS} »`);
    expect(msg).toContain('- rétablir votre phrase d\'origine : « Rétablis ma phrase d\'origine n° … ».');
  });

  it('aucune phrase adaptée : rien n\'est affiché (ni consultation, ni message)', () => {
    const suivi = new SuiviAdaptations({ reference: [GSS_COMM] });
    const sections = { b4_communication: GSS_COMM };
    suivi.noterCoherence('b4_communication', GSS_COMM, GSS_COMM, EXIGENCE_IFITS, []);
    const liste = suivi.finaliser(sections, titreDe);
    expect(liste).toEqual([]);
    expect(consultationsAdaptations(liste)).toEqual([]);
    expect(messageAdaptations(liste)).toBe('');
    expect(consultationsAdaptations(undefined)).toEqual([]);
  });

  it('phrase rédigée par l\'IA (engagement, proposition) : jamais signalée', () => {
    const suivi = new SuiviAdaptations({ reference: [GSS_COMM] });
    const avant = `${GSS_COMM}\n\n## Nos engagements sur les exigences du cahier des charges\n\n- GSS effectue 1 à 3 contrôles inopinés par mois sur le site.`;
    const apres = avant.replace('1 à 3 contrôles', 'au moins 3 contrôles');
    suivi.noterCoherence('b4_communication', avant, apres, 'Au moins 3 visites inopinées par mois', []);
    expect(suivi.finaliser({ b4_communication: apres }, titreDe)).toEqual([]);
  });

  it('validation, modification et rétablissement par l\'assistant', () => {
    const { sections, liste } = generation();
    const [a, b] = liste;
    // Valider : le texte ne change pas.
    let r = deciderAdaptation(sections.b4_communication, a, 'valider');
    expect(r).toMatchObject({ ok: true, change: false });
    expect(r.texte).toBe(ADAPTEE_COMM);
    expect(a.statut).toBe('validee');
    // Rétablir la phrase d'origine (rubrique cstb).
    r = deciderAdaptation(sections.b5_nouveau_marche, b, 'retablir');
    expect(r).toMatchObject({ ok: true, change: true });
    expect(r.texte).toBe(GSS_CSTB);
    expect(b.statut).toBe('retablie');
    sections.b5_nouveau_marche = r.texte;
    // GSS change d'avis : il écrit sa propre phrase à la place de celle qu'il avait rétablie.
    const propre = 'Pour chaque nouveau marché, nous suivons la phase de prise en charge fixée par le CSTB, de la notification à deux semaines après.';
    r = deciderAdaptation(sections.b5_nouveau_marche, b, 'modifier', propre);
    expect(r.ok).toBe(true);
    expect(r.texte).toContain(propre);
    expect(r.texte).not.toMatch(/30 jours avant/);
    expect(b).toMatchObject({ statut: 'modifiee', texteGss: propre });
    // Plus rien à valider : plus aucun signalement.
    expect(consultationsAdaptations(liste)).toEqual([]);
    expect(messageAdaptations(liste)).toBe('');
    // Modifier sans texte : refusé, rien n'est changé.
    expect(deciderAdaptation(r.texte, b, 'modifier', '').ok).toBe(false);
  });

  it('génération suivante : le choix de GSS est repris tel quel et la phrase n\'est plus signalée', () => {
    const premiere = generation();
    const [a, b] = premiere.liste;
    deciderAdaptation(premiere.sections.b4_communication, a, 'retablir');
    deciderAdaptation(premiere.sections.b5_nouveau_marche, b, 'modifier', 'Nous suivons la phase de prise en charge du CSTB.');
    const decisions = JSON.parse(JSON.stringify(premiere.liste)) as PhraseAdaptee[];
    const seconde = generation(decisions);
    expect(seconde.sections.b4_communication).toBe(GSS_COMM);
    expect(seconde.sections.b5_nouveau_marche).toContain('Nous suivons la phase de prise en charge du CSTB.');
    expect(seconde.sections.b5_nouveau_marche).not.toMatch(/de la notification à deux semaines après la notification/);
    expect(seconde.liste.map((x) => x.statut)).toEqual(['retablie', 'modifiee']);
    expect(consultationsAdaptations(seconde.liste)).toEqual([]);
    // Validation reprise : la phrase adaptée reste, sans signalement.
    const v = generation([{ ...decisions[0], statut: 'validee' }]);
    expect(v.sections.b4_communication).toBe(ADAPTEE_COMM);
    expect(v.liste.find((x) => x.rubrique === 'b4_communication')?.statut).toBe('validee');
    expect(consultationsAdaptations(v.liste)).toHaveLength(1);
  });

  it('phrase retirée (délai normand hors Normandie) : signalée avec le lieu d\'exécution cité, rétablie à sa place', () => {
    const gss = 'Nos agents d\'astreinte sont répartis sur le territoire. Si l\'agent ne répond pas, le rondier d\'astreinte se rend sur place en 45 minutes au maximum. Chaque intervention est tracée dans la main courante.';
    const filtre = delaisHorsNormandie(gss, DCE_IFITS, true);
    expect(filtre.retires).toHaveLength(1);
    const suivi = new SuiviAdaptations({ reference: [gss] });
    suivi.noterFiltres('b4_pti', gss, filtre.texte, DCE_IFITS, true, { clientName: 'IFITS' });
    const sections = { b4_pti: filtre.texte };
    const [a, ...reste] = suivi.finaliser(sections, () => 'La protection du travailleur isolé');
    expect(reste).toEqual([]);
    expect(a.adaptee).toBe('');
    expect(a.origine).toMatch(/45 minutes/);
    expect(a.exigence).toMatch(/^Marché hors Normandie \(site de Neuilly-sur-Marne\)/);
    expect(a.exigence).toContain('93330 Neuilly-sur-Marne');
    expect(messageAdaptations([a])).toContain('   - Phrase adaptée : (phrase retirée du mémoire)');
    const r = deciderAdaptation(sections.b4_pti, a, 'retablir');
    expect(r.texte).toBe(gss);
  });

  it('filtres : terme du CCTP (« chef de poste ») et règles propres à GSS (Covid) ne sont pas signalés ; rondes à pied, si', () => {
    const dce = `${'Le chef de poste encadre les agents. '.repeat(3)}Les rondes seront effectuées exclusivement à pied.`;
    expect(exigenceDuFiltre({ origine: 'Le chef de site contrôle la tenue des agents.', adaptee: 'Le chef de poste contrôle la tenue des agents.' }, dce, false)).toBe('');
    const gss = 'Nos rondiers effectuent les rondes à pied ou à vélo selon l\'étendue du site. La main courante est renseignée à chaque ronde.';
    const apres = interditsDce(gss, dce);
    expect(apres).not.toMatch(/vélo/);
    const suivi = new SuiviAdaptations({ reference: [gss] });
    suivi.noterFiltres('b4_rondes', gss, apres, dce, false);
    const [a] = suivi.finaliser({ b4_rondes: apres }, () => 'Les rondes');
    expect(a.exigence).toBe('Les rondes seront effectuées exclusivement à pied.');
    const covid = 'Pendant la période Covid, nos agents ont contrôlé les pass sanitaires. Nos agents sont formés.';
    const s2 = new SuiviAdaptations({ reference: [covid] });
    s2.noterFiltres('b2', covid, interditsDce(covid, dce), dce, false);
    expect(s2.finaliser({ b2: interditsDce(covid, dce) }, () => 'x')).toEqual([]);
  });

  it('publipostage hors Normandie (ifits, Neuilly-sur-Marne) : les délais normands retirés sont signalés, rubrique par rubrique', () => {
    const mt = chargerMemoireType();
    const ctx = { analyse: { clientName: 'IFITS', sites: [{ name: 'IFITS', address: '1 rue Théodore Simon, 93330 Neuilly-sur-Marne' }] }, dce: DCE_IFITS, horsNormandie: true };
    const ids = ['b4_pti', 'b4_proc_alarme', 'b5_remplacement_imprevu', 'b3_adequation'];
    const l = adaptationsDuPubliposte(mt, ctx, ids, { marquerConsultations: true });
    const suivi = new SuiviAdaptations({ reference: l.map((x) => x.reference) });
    suivi.noterPubliposte(l);
    const sections = Object.fromEntries(l.map((x) => [x.rubrique, x.apres]));
    const liste = suivi.finaliser(sections, (id) => id);
    expect(liste.length).toBeGreaterThanOrEqual(3);
    const pti = liste.find((x) => x.rubrique === 'b4_pti')!;
    expect(pti.origine).toMatch(/se rend sur place, en \d+ minutes au maximum/);
    expect(pti.adaptee).toMatch(/se rend sur place\.?$/);
    expect(pti.etape).toBe('Délais normands retirés (marché hors Normandie)');
    expect(pti.exigence).toContain('Neuilly-sur-Marne');
    // Marché normand : rien.
    expect(adaptationsDuPubliposte(mt, { ...ctx, horsNormandie: false }, ids)).toEqual([]);
  });

  it('publipostage, interdits du CCTP (cstb : rondes à pied, photos interdites) : passages de GSS retirés et signalés avec la phrase du DCE', () => {
    const mt = chargerMemoireType();
    const dce = `CSTB Grenoble, situé au 24 rue Joseph Fourier 38400 Saint Martin d'Hères.
Les rondes de surveillance sont effectuées à pied. Le véhicule de l’intervenant rondier reste le moins possible sur le site.
Le prestataire s'engage à :
    -    Ne pas prendre de photo des bâtiments, équipements scientifiques ou installations ;`;
    const ctx = { analyse: { clientName: 'CSTB' }, dce, horsNormandie: true };
    const l = adaptationsDuPubliposte(mt, ctx, ['b4_vehicules', 'b4_main_courante'], { marquerConsultations: true });
    const suivi = new SuiviAdaptations({ reference: l.map((x) => x.reference) });
    suivi.noterPubliposte(l);
    const sections: Record<string, string> = {};
    for (const x of l) sections[x.rubrique] = x.apres;
    const liste = suivi.finaliser(sections, (id) => id);
    const rondes = liste.find((x) => x.etape === 'Rondes imposées à pied par le CCTP')!;
    expect(rondes.origine).toMatch(/à vélo ou en trottinette/);
    expect(rondes.adaptee).toBe('');
    expect(rondes.exigence).toBe('Les rondes de surveillance sont effectuées à pied.');
    const photos = liste.find((x) => x.etape === 'Photos interdites par le CCTP')!;
    expect(photos.origine).toMatch(/illustrer de photos ou de vidéos/);
    expect(photos.adaptee).not.toMatch(/photos/);
    expect(photos.exigence).toMatch(/Ne pas prendre de photo des bâtiments/);
  });

  it('phrase adaptée par deux étapes (publipostage puis cohérence) : signalée une seule fois, avec les deux exigences', () => {
    const o = 'Si l\'agent ne répond pas, le rondier d\'astreinte se rend sur place, en 45 minutes au maximum, avec son véhicule.';
    const a1 = 'Si l\'agent ne répond pas, le rondier d\'astreinte se rend sur place, avec son véhicule.';
    const a2 = 'Si l\'agent ne répond pas, le rondier d\'astreinte se rend sur place à pied, avec son véhicule laissé hors du site.';
    const suivi = new SuiviAdaptations({ reference: [o] });
    suivi.noterPubliposte([{ rubrique: 'b4_pti', avant: o, apres: a1, exigence: 'Marché hors Normandie', etape: 'Délais normands retirés (marché hors Normandie)' }]);
    suivi.noterCoherence('b4_pti', a1, a2, 'Les rondes de surveillance sont effectuées à pied.', []);
    const liste = suivi.finaliser({ b4_pti: a2 }, () => 'PTI');
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ origine: o, adaptee: a2, exigence: 'Marché hors Normandie ; Les rondes de surveillance sont effectuées à pied.' });
  });
});

import { describe, it, expect } from 'vitest';
import { calculerDimensionnement, questionDimensionnement, questionRondes, texteDimensionnement, citationDeRondes, remplirCasPratique, casPratiqueRepris } from '../src/generation/dimensionnement';
import { preparerMemoireType, questionsDuPubliposte, publierMemoire } from '../src/generation/memoire_type';

/** Tour 9 : rondes ponctuelles jamais comptées en heures de poste (T9N-1) ; 1 responsable pour 10 agents (T9N-5). */
const RONDIER = { profil: 'Intervenant rondier', qualification: 'Agrément préfectoral CNPAS', lieu: 'Site du CSTB Grenoble', agents_simultanes: 1, heures_hebdo: null, heures_an: null };
const CSTB = {
  postes: [
    { ...RONDIER, plages: [], citation: 'Du lundi au vendredi    1 ronde, pour une ouverture effective à 07h20' },
    { ...RONDIER, plages: [{ jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'], debut: '19:30', fin: '20:30' }], citation: 'Ronde de fermeture du site (RF)    1 ronde, de 19h30 à 20h30' },
    { ...RONDIER, plages: [{ jours: ['samedi', 'dimanche'], debut: '07:00', fin: '21:00' }], citation: 'Ronde de jour (RJ)  /    2 rondes, entre 07h00 et 21h00' },
    { ...RONDIER, plages: [{ jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'], debut: '21:30', fin: '06:30' }], citation: 'Ronde de nuit (RN)    3 rondes, entre 21h30 et 06h30' },
  ],
  cas_pratique: null, mises_en_situation: [],
};
const DCE_CSTB = `2.2.4 Rondes. ${CSTB.postes.map((p) => p.citation).join('\n')}\nLe titulaire assure les rondes du site.`;

describe('rondes ponctuelles (T9N-1)', () => {
  it('cstb 551 : aucune heure de poste tirée des fenêtres des rondes, jamais « 96 h », question exacte à GSS', () => {
    const d = calculerDimensionnement(CSTB, DCE_CSTB)!;
    expect(d.profils).toEqual([]);
    expect(d.titulaires).toBe(0);
    expect(d.rondesSansDuree?.length).toBe(4);
    expect(JSON.stringify(d)).not.toMatch(/\b96\b/);
    expect(questionRondes(d)).toMatch(/^Le cahier des charges prévoit des rondes ponctuelles sans durée de présence \(« Du lundi au vendredi 1 ronde/);
    expect(questionRondes(d)).toMatch(/Combien de temps dure une ronde sur le site, et combien d'intervenants rondiers dédiez-vous au marché \?$/);
    expect(texteDimensionnement(d)).toBe('');
  });
  it('publipostage : tableau de l’équipe en [À COMPLÉTER] et la question des rondes dans les consultations', () => {
    const d = calculerDimensionnement(CSTB, DCE_CSTB);
    const prep: any = preparerMemoireType({ dce: `${DCE_CSTB} Télésurveillance des alarmes.`, analyse: { clientName: 'le CSTB' }, dimensionnement: d } as any);
    const rub = publierMemoire(prep);
    expect(rub.map((r: any) => r.texte || '').join('\n')).not.toMatch(/96 h|4 agents titulaires/);
    expect(questionsDuPubliposte(rub)).toContain(questionRondes(d));
  });
  it('poste tenu en continu avec des rondes (« poste de nuit … 3 rondes ») : reste un poste', () => {
    expect(citationDeRondes('Poste de nuit de 19h à 7h, avec 3 rondes')).toBe(false);
    expect(citationDeRondes('3 rondes, entre 21h30 et 06h30')).toBe(true);
    expect(citationDeRondes('Deux passages, entre 22h et 5h')).toBe(true);
  });
  it('postes permanents et rondes : les rondes sont signalées dans la proposition, jamais additionnées', () => {
    const rep = { postes: [{ profil: 'Agent de sécurité ADS', qualification: 'CQP APS', lieu: 'Accueil', agents_simultanes: 1, plages: [{ jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'], debut: '08:00', fin: '18:00' }], heures_hebdo: null, heures_an: null, citation: 'Poste accueil du lundi au vendredi de 8h00 à 18h00 tenu par un agent' }, CSTB.postes[3]], cas_pratique: null };
    const d = calculerDimensionnement(rep, `Poste accueil du lundi au vendredi de 8h00 à 18h00 tenu par un agent. ${CSTB.postes[3].citation}`)!;
    expect(d.profils.map((x) => x.heuresSemaine)).toEqual([50]);
    expect(questionDimensionnement(d)).toMatch(/Attention : le cahier des charges prévoit des rondes ponctuelles/);
  });
});

describe('encadrement du cas pratique (T9N-5)', () => {
  const plages = [{ libelle: 'Dimanche férié, 6 h–21 h', debut: '06:00', fin: '21:00' }, { libelle: 'Nuit, 21 h–6 h', debut: '21:00', fin: '06:00' }];
  const ligne = (plage: string, profil: string, n: number) => ({ plage, profil, en_service: n, justification: 'x' });
  it('etampes2 553 : 12 agents en service → 1 encadrant (1 responsable pour 10 agents) ; sous 10, l’encadrant passe', () => {
    const rep = { postes: [], cas_pratique: { plages, dispositif: [
      ligne(plages[0].libelle, 'Agent de sécurité', 10), ligne(plages[0].libelle, 'Maître-chien', 1), ligne(plages[0].libelle, 'Agent de sécurité incendie', 1), ligne(plages[0].libelle, 'Encadrant', 0),
      ligne(plages[1].libelle, 'Agent de sécurité', 4), ligne(plages[1].libelle, 'Maître-chien', 1), ligne(plages[1].libelle, 'Encadrant', 0),
    ] } };
    const d = calculerDimensionnement(rep, 'Cas pratique : fête communale.')!;
    const enc = d.casPratique.filter((l) => l.profil === 'Encadrant');
    expect(enc.map((l) => [l.plage, l.enService, l.rotation])).toEqual([[plages[0].libelle, 1, 2], [plages[1].libelle, 0, 0]]);
    expect(enc[0].justification).toMatch(/1 responsable pour 10 agents/);
    expect(d.profils.find((p) => p.profil === 'Encadrant')?.titulaires).toBe(2);
  });
  it('cadre : ligne du cas pratique déjà chiffrée autrement par la rédaction alignée sur la proposition, proposition posée à GSS', () => {
    const rep = { postes: [], cas_pratique: { plages, dispositif: [ligne(plages[0].libelle, 'Agent de sécurité', 10), ligne(plages[0].libelle, 'Maître-chien', 1), ligne(plages[0].libelle, 'Agent de sécurité incendie', 1), ligne(plages[0].libelle, 'Encadrant', 0)] } };
    const d = calculerDimensionnement(rep, 'Cas pratique : fête communale.')!;
    const texte = `${plages[0].libelle} | Agent de sécurité | 10 | 20\n${plages[0].libelle} | Encadrant | 0 | 0`;
    const r = remplirCasPratique(texte, d);
    expect(r.texte).toBe(`${plages[0].libelle} | Agent de sécurité | 10 | 20\n${plages[0].libelle} | Encadrant | 1 | 2`);
    expect(casPratiqueRepris(r.texte, d)).toBe(true);
    expect(casPratiqueRepris('Aucun tableau.', d)).toBe(false);
  });
  it('aucun encadrant demandé : rien n’est ajouté', () => {
    const rep = { postes: [], cas_pratique: { plages, dispositif: [ligne(plages[0].libelle, 'Agent de sécurité', 10), ligne(plages[0].libelle, 'Maître-chien', 2)] } };
    expect(calculerDimensionnement(rep, 'Cas pratique.')!.casPratique.map((l) => l.profil)).toEqual(['Agent de sécurité', 'Maître-chien']);
  });
});

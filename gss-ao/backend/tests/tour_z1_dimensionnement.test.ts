// Campagne « zéro défaut », tour 1 : dimensionnement (T1F-2, T1F-3, T1F-11, T1-GEN-7) et protection des effectifs.
import { describe, it, expect } from 'vitest';
import { calculerDimensionnement, joursDePeriode, lignesEquipe, questionDimensionnement, messageDimensionnement, posteOptionnel } from '../src/generation/dimensionnement';
import { appliquerEffectifsParProfil } from '../src/generation/completion';
import { appliquerModifications } from '../src/generation/memoire_type';

const TOUS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const FB = `Le chef d'équipe doit être présent pendant toute la durée d'ouverture des jardins quelle que soit la saison : Du 1er mai au 30 septembre : prévoir un chef d'équipe de 8h30 à 20h00 ; Les mois d'octobre, mars et avril : prévoir un chef d'équipe de 08h30 à 19h00 ; Du 1er novembre à la fin février : prévoir un chef d'équipe de 08h30 à 18h00 ;
Un agent dédié au contrôle des accès du public est nécessaire tous les jours. Du 1er avril au 30 septembre : prévoir un agent habilité de 9h20 à 18h10 ; Du 1er octobre au 31 mars : prévoir un agent habilité de 9h20 à 17h10.
Quatre agents dédiés à l'accueil des publics du circuit de visite : Du 1er avril au 30 septembre : Prévoir deux agents en poste à l'instant T de 9h20 à 17h40 ; Prévoir deux agents en poste à l'instant T de 9h20 à 18h10.`;

describe('périodes de l’année (T1F-2)', () => {
  it('jours couverts par une période écrite dans le DCE', () => {
    expect(joursDePeriode('Du 1er mai au 30 septembre : prévoir un chef')).toBe(153);
    expect(joursDePeriode("Les mois d'octobre, mars et avril : prévoir")).toBe(92);
    expect(joursDePeriode('Du 1er novembre à la fin février : prévoir')).toBe(120);
    expect(joursDePeriode("tous les jours, sauf les mardis, les 1er mai, 25 décembre et 1er janvier. Du 1er octobre au 31 mars : prévoir")).toBe(182);
    expect(joursDePeriode("la saison démarre le dernier week-end de mars et s'achève le dernier week-end de septembre")).toBe(184);
    expect(joursDePeriode('Le poste est tenu de 7h à 19h.')).toBeNull();
  });
  it('Fontainebleau : trois saisons du chef d’équipe jamais additionnées (≈ 3 866 h par an, 3 titulaires)', () => {
    const chef = (citation: string, fin: string) => ({ profil: "Chef d'équipe", qualification: 'CQP-APS', lieu: 'Château', agents_simultanes: 1, plages: [{ jours: TOUS, debut: '08:30', fin }], citation });
    const d = calculerDimensionnement({ postes: [
      chef("Du 1er mai au 30 septembre : prévoir un chef d'équipe de 8h30 à 20h00 ;", '20:00'),
      chef("Les mois d'octobre, mars et avril : prévoir un chef d'équipe de 08h30 à 19h00 ;", '19:00'),
      chef("Du 1er novembre à la fin février : prévoir un chef d'équipe de 08h30 à 18h00 ;", '18:00'),
    ] }, FB)!;
    expect(d.profils).toHaveLength(1);
    expect(Math.abs(d.profils[0].heuresAn - 3866)).toBeLessThan(15);
    expect(d.profils[0].titulaires).toBe(3);
  });
  // T8-CONS-14 : poste saisonnier dimensionné sur une semaine de la saison (2 agents × 8 h × 7 nuits = 112 h, 35 h par agent) :
  // 3,2 ETP en saison, 4 titulaires ; jamais 2 titulaires à 56 h par semaine et 7 nuits sur 7 chacun (moyenne annuelle).
  it('Le Havre lot 1 : service de la seule saison estivale (112 h par semaine en saison, 3,2 ETP en saison, 4 titulaires)', () => {
    const dce = "A titre indicatif, la saison démarre le dernier week-end de mars et s'achève le dernier week-end de septembre. Par gardiennage, il faut entendre le déploiement d'agents de sécurité (ADS), en fonction de l'avancement dans la saison et des phénomènes observés (à minima 2 agents). Les horaires prévus sont : Tous les jours, de 22h00 à 06h00.";
    const d = calculerDimensionnement({ postes: [{ profil: 'Agent de sécurité (ADS)', qualification: null, lieu: 'Plage', agents_simultanes: 2, plages: [{ jours: TOUS, debut: '22:00', fin: '06:00' }], citation: "Par gardiennage, il faut entendre le déploiement d'agents de sécurité (ADS), en fonction de l'avancement dans la saison et des phénomènes observés (à minima 2 agents)." }] }, dce)!;
    expect(d.profils[0].heuresSemaine).toBe(112);
    expect(d.profils[0].etp).toBe(3.2);
    expect(d.profils[0].titulaires).toBe(4);
    expect(d.profils[0].semainesSaison).toBeGreaterThan(25);
    expect(d.profils[0].qualification).toBe('CQP APS');
  });
  it('poste saisonnier sans période lisible : question posée à GSS', () => {
    const dce = 'Pendant la saison, un agent de sécurité est présent tous les jours de 22h00 à 06h00 sur la plage du site.';
    const d = calculerDimensionnement({ postes: [{ profil: 'Agent de sécurité', qualification: 'CQP APS', lieu: '', agents_simultanes: 1, plages: [{ jours: TOUS, debut: '22:00', fin: '06:00' }], citation: dce }] }, dce)!;
    expect((d.alertes || []).join(' ')).toMatch(/période de l'année de ce poste saisonnier n'a pas pu être lue/);
  });
});

describe('postes distincts, simultanés et propositions alignées sur le tableau (T1F-3)', () => {
  const ags = (profil: string, lieu: string, n: number, debut: string, fin: string, citation: string) => ({ profil, qualification: 'CQP-APS', lieu, agents_simultanes: n, plages: [{ jours: TOUS, debut, fin }], citation });
  it('deux postes d’agent de sécurité différents ne sont jamais fusionnés ; plages simultanées additionnées', () => {
    const d = calculerDimensionnement({ postes: [
      ags('Agent – contrôle d’accès et Vigipirate', 'Accès', 1, '09:20', '18:10', 'Un agent dédié au contrôle des accès du public est nécessaire tous les jours. Du 1er avril au 30 septembre : prévoir un agent habilité de 9h20 à 18h10 ;'),
      ags('Agent dédié à l’accueil des publics du circuit de visite', 'Circuit', 2, '09:20', '17:40', "Quatre agents dédiés à l'accueil des publics du circuit de visite : Du 1er avril au 30 septembre : Prévoir deux agents en poste à l'instant T de 9h20 à 17h40 ;"),
      ags('Agent dédié à l’accueil des publics du circuit de visite', 'Circuit', 2, '09:20', '18:10', "Quatre agents dédiés à l'accueil des publics du circuit de visite : Du 1er avril au 30 septembre : Prévoir deux agents en poste à l'instant T de 9h20 à 17h40 ; Prévoir deux agents en poste à l'instant T de 9h20 à 18h10."),
    ] }, FB)!;
    expect(d.profils).toHaveLength(2);
    expect(d.profils[1].simultanes).toBe(4);
    const tableau = lignesEquipe(d);
    const q = questionDimensionnement(d);
    const msg = messageDimensionnement(d);
    for (const l of tableau.split('\n')) {
      const c = l.split('|').map((x) => x.trim());
      expect(q).toContain(`${c[1]} : ${c[3]} titulaire`);
      expect(msg).toContain(`${c[1]} :`);
    }
  });
  it('tableau et nombre de titulaires jamais réécrits par l’adaptation', () => {
    const t = "**L'équipe dédiée**\n\n| Catégorie de personnel | Qualification | Nombre | Observations |\n|---|---|---|---|\n| Agent de sécurité | CQP APS | 7 | 50 h par semaine |\n\nNous mettons en place une équipe de 7 agents titulaires.";
    const r = appliquerModifications(t, { remplacements: [{ extrait: '| Agent de sécurité | CQP APS | 7 |', par: '| Agent de sécurité | CQP APS | 1 |' }], ajouts: [{ apres: '50 h par semaine', texte: 'Quatre agents sont présents en même temps.' }] });
    expect(r.texte).toBe(t);
    expect(r.refusees).toHaveLength(2);
  });
  it('exemple du premier message au pluriel reporté sans modèle (T1F-11)', () => {
    const sections = { b3_adequation: "| Catégorie de personnel | Qualification | Nombre | Observations |\n|---|---|---|---|\n| Chef d’équipe | CQP-APS | 3 | 74 h |\n| Agent de sécurité | CQP APS | 16 | 400 h |\n\nNous mettons en place une équipe de 19 agents titulaires." };
    for (const profil of ["chefs d'équipe", 'chefs d’équipe', "chef d'équipe"]) {
      const r = appliquerEffectifsParProfil(sections, [{ nombre: 4, profil }], '19');
      expect(r?.total).toBe(20);
    }
  });
});

describe('poste permanent dont la citation mentionne une option (T1-GEN-7)', () => {
  it('le complément optionnel ne retire jamais le poste ; un poste lui-même optionnel est écarté et signalé', () => {
    const base = 'Un agent SSIAP 1 est présent du lundi au vendredi de 7h00 à 19h00';
    for (const suite of ['; ce dispositif pourra être complété par des agents supplémentaires sur bon de commande.', ' (le candidat pourra proposer en option un maître-chien).', ', avec un renfort ponctuel lors des événements.']) {
      expect(posteOptionnel(base + suite, 'SSIAP 1')).toBe(false);
    }
    expect(posteOptionnel("L'option 1 : 1 SSIAP 1 7j/7 24h/24 ou en vacations de 12h.", 'SSIAP 1')).toBe(true);
    expect(posteOptionnel('Un agent peut être mobilisé à la demande du lundi au vendredi de 7h à 19h.', 'Agent de sécurité')).toBe(true);
    const dce = "L'option 1 : 1 SSIAP 1 7j/7 24h/24 ou en vacations de 12h. Un agent SSIAP 2 est présent du lundi au vendredi de 7h00 à 19h00 sur le site.";
    const d = calculerDimensionnement({ postes: [
      { profil: 'SSIAP 1', qualification: 'SSIAP 1', plages: [{ jours: TOUS, debut: '00:00', fin: '24:00' }], citation: "L'option 1 : 1 SSIAP 1 7j/7 24h/24 ou en vacations de 12h." },
      { profil: 'SSIAP 2', qualification: 'SSIAP 2', plages: [{ jours: TOUS.slice(0, 5), debut: '07:00', fin: '19:00' }], citation: 'Un agent SSIAP 2 est présent du lundi au vendredi de 7h00 à 19h00 sur le site.' },
    ] }, dce)!;
    expect(d.profils.map((x) => x.profil)).toEqual(['SSIAP 2']);
    expect((d.alertes || []).join(' ')).toMatch(/un poste a été écarté de l'équipe dédiée comme optionnel ou ponctuel/); // accord au nombre de postes (T3G-9)
  });
});

describe('qualification jamais réduite à l’intitulé du poste (génération réelle fontainebleau 901)', () => {
  const chef = (qualification: string | null) => ({ profil: "Chef d'équipe", qualification, lieu: 'Château', agents_simultanes: 1, plages: [{ jours: TOUS, debut: '08:30', fin: '20:00' }], citation: "Du 1er mai au 30 septembre : prévoir un chef d'équipe de 8h30 à 20h00 ;" });
  it('qualification non relevée : le CQP APS exigé par le DCE, jamais « Chef d’équipe »', () => {
    const dce = `${FB}\nTous les agents sont titulaires du CQP APS et de la carte professionnelle délivrée par le CNAPS.`;
    for (const q of [null, "Chef d'équipe"]) {
      const d = calculerDimensionnement({ postes: [chef(q)] }, dce)!;
      expect(d.profils[0].qualification).toBe('CQP APS');
      expect(lignesEquipe(d)).toMatch(/^\| Chef d'équipe \| CQP APS \|/);
    }
  });
  it('DCE muet sur la qualification : à compléter par GSS (rien d’inventé) ; niveau SSIAP de l’intitulé repris', () => {
    expect(calculerDimensionnement({ postes: [chef(null)] }, FB)!.profils[0].qualification).toBe('[À COMPLÉTER]');
    const ssiap = { ...chef(null), profil: "Chef d'équipe SSIAP 2" };
    expect(calculerDimensionnement({ postes: [ssiap] }, FB)!.profils[0].qualification).toBe('SSIAP 2');
  });
});

describe('plages tenues chacune par une partie des agents du poste (génération réelle fontainebleau 902)', () => {
  const CIRCUIT = "Quatre agents dédiés à l'accueil des publics du circuit de visite, tous les jours sauf le mardi : Du 1er avril au 30 septembre : Prévoir deux agents en poste à l'instant T de 9h20 à 17h40 ; Prévoir deux agents en poste à l'instant T de 9h20 à 18h10. Du 1er octobre au 31 mars : Prévoir deux agents en poste à l'instant T de 9h20 à 16h40 ; Prévoir deux agents en poste à l'instant T de 9h20 à 17h40.";
  const SIX = ['lundi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const plage = (debut: string, fin: string, periode: string) => ({ jours: SIX, debut, fin, periode });
  const ETE = 'Du 1er avril au 30 septembre';
  const HIVER = 'Du 1er octobre au 31 mars';
  const plages = [plage('09:20', '17:40', ETE), plage('09:20', '18:10', ETE), plage('09:20', '16:40', HIVER), plage('09:20', '17:40', HIVER)];
  const poste = (agents_simultanes: number, p = plages) => ({ profil: 'Agent posté dans le circuit de visite', qualification: 'CQP APS', lieu: 'Circuit de visite', agents_simultanes, plages: p, citation: CIRCUIT });
  it('nombre d’agents écrit devant l’horaire de chaque plage', async () => {
    const { agentsDeLaPlage } = await import('../src/generation/dimensionnement');
    expect(agentsDeLaPlage(plage('09:20', '17:40', ETE), CIRCUIT)).toBe(2);
    expect(agentsDeLaPlage(plage('09:20', '18:10', ETE), CIRCUIT)).toBe(2);
    expect(agentsDeLaPlage(plage('08:30', '18:10', ETE), CIRCUIT)).toBeNull();
    expect(agentsDeLaPlage(plage('09:20', '18:10', ''), 'Prévoir un agent habilité de 9h20 à 18h10.')).toBe(1);
  });
  it('4 agents simultanés relevés sur chaque plage : heures comptées une fois (≈ 197 h par semaine, comme « 2 agents » par plage)', () => {
    const quatre = calculerDimensionnement({ postes: [poste(4)] }, CIRCUIT)!.profils[0];
    const deux = calculerDimensionnement({ postes: [poste(2)] }, CIRCUIT)!.profils[0];
    expect(Math.abs(quatre.heuresSemaine - 197)).toBeLessThan(5);
    expect(quatre.heuresSemaine).toBe(deux.heuresSemaine);
    expect(quatre.titulaires).toBe(7);
    expect(quatre.simultanes).toBe(4);
  });
  it('plages relevées incomplètes (nombres de la citation sans le total relevé) : calcul inchangé', () => {
    const une = calculerDimensionnement({ postes: [poste(4, [plage('09:20', '18:10', ETE)])] }, CIRCUIT)!.profils[0];
    expect(une.simultanes).toBe(4);
    expect(une.heuresSemaine).toBeGreaterThan(100);
  });
});

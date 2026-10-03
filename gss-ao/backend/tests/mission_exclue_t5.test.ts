// Tour 5 : rubrique d'accueil écartée quand le site n'est pas surveillé pendant l'ouverture (T5CP-1, cstb 551) ; adaptation
// qui nie la mission de GSS jamais imprimée ; OpenAI en panne en réponse libre : alerte explicite (T5-COH-2).
import { describe, it, expect } from 'vitest';
import { chargerMemoireType, evaluerIndicateurs, appliquerModifications, adapterRubrique, RAISON_MISSION_NIEE } from '../src/generation/memoire_type';
import { alerteRedactionIndisponible } from '../src/generation/memoire_generator';

const mt = chargerMemoireType();
const CCP = `Contrôle des entrées – Sureté :\nPendant l’ouverture du site (de 07h20 à 19h30, du lundi au vendredi), le site n’est pas surveillé.\nL’accès au site est contrôlé par une barrière commandée à distance par le prestataire d’accueil entre 08h00 et 18h00 (interphone) pour les visiteurs.`;

describe('mission exclue par le cahier des charges (T5CP-1)', () => {
  it('« visiteurs » ne déclenche pas l’accueil du public quand le site n’est pas surveillé pendant l’ouverture', () => {
    const e = evaluerIndicateurs(mt, { dce: CCP, analyse: {} } as any);
    expect(e.ACCUEIL_PUBLIC.valeur).toBe(false);
    expect(e.FILTRAGE.valeur).toBe(false);
    expect(evaluerIndicateurs(mt, { dce: 'Accueil des visiteurs et contrôle des entrées du site.', analyse: {} } as any).ACCUEIL_PUBLIC.valeur).toBe(true);
  });
  it('une adaptation qui nie la mission de GSS est refusée et la rubrique signalée comme exclue', async () => {
    const t = "Gestion des entrées : filtrage des entrées ; orientation du public.\n\nContrôle intérieur : rondes de contrôle dans les zones d'accueil et les bureaux ; posture rassurante.";
    const r = appliquerModifications(t, { remplacements: [{ extrait: 'filtrage des entrées', par: 'pendant l’ouverture du site, celui-ci n’est pas surveillé' }] });
    expect(r.texte).toBe(t);
    expect(r.refusees[0].raison).toBe(RAISON_MISSION_NIEE);
    const rub = mt.rubriques.find((x) => x.id === 'b4_accueil_filtrage')!;
    const res = await adapterRubrique(rub, t, { dce: CCP }, async () => JSON.stringify({ remplacements: [{ extrait: "rondes de contrôle dans les zones d'accueil et les bureaux", par: "aucune ronde de contrôle dans les zones d'accueil et les bureaux pendant l’ouverture" }] }));
    expect(res.texte).toBe(t);
    expect(res.missionExclue?.par).toMatch(/^aucune ronde/);
  });
  it('restriction légitime (« n’est pas utilisé par les agents ») : pas une mission niée', () => {
    const t = 'Le portillon est ouvert par l’agent à la demande.';
    const r = appliquerModifications(t, { remplacements: [{ extrait: 'est ouvert par l’agent à la demande', par: 'reste fermé en permanence pendant les plages d’ouverture' }] });
    expect(r.refusees.every((x) => x.raison !== RAISON_MISSION_NIEE)).toBe(true);
  });
});

describe('OpenAI en panne en réponse libre (T5-COH-2)', () => {
  it('alerte explicite : étapes et rubriques non adaptées ; rien si tout a répondu', () => {
    const a = alerteRedactionIndisponible(['Analyse DCE', 'Matrice CCTP', 'Adaptation b4_tenues', 'Horaires du CCTP'], ['Les tenues']);
    expect(a).toBe("Rédaction automatique indisponible pendant la génération (4 appels au modèle sans réponse) : analyse du DCE, lecture et contrôle des exigences du CCTP, délais, fréquences et horaires imposés par le CCTP, adaptation des rubriques au CCTP ; rubrique non adaptée au CCTP : « Les tenues ». Le mémoire n'est pas complet : relancez la génération avant la remise.");
    expect(alerteRedactionIndisponible([])).toBe('');
  });
});

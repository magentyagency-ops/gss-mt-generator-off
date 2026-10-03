import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { calculerDimensionnement, messageDimensionnement } from '../src/generation/dimensionnement';
import { DCE, aCorpus } from './fixtures/corpus';

/** Tour 7 (T7N-1) : le scénario du cas pratique n'est jamais aussi une mise en situation (etampes2 553). */
const REP = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/dimensionnement_etampes2_553.json'), 'utf-8'));
const EXTRAIT = `Délais d’interventions proposés par le candidat /10 points
Cas pratique : sécurisation d’un périmètre de manifestation sur la voie publique pour 48 heures : un dimanche férié et un lundi férié
Manifestation à sécuriser : Fête communale
Lieu de la sécurisation : Place Saint Gilles
Dimension : 5 500 m²
Clôture : Oui. Pose de barrières Vauban assuré par la collectivité
Accès véhicule : 8 accès par les rues adjacentes
Nombre envisagé de visiteurs : 2500 sur les 48h
Heures d’ouverture au public et exposants : de 8h à 22h30
Condition d’exécution : Matériel à conserver sous surveillance, à savoir :
Tentes et stands d’exposants ;
Tentes et bâches municipales ;
Scène et arceaux de lumières appartenant à la collectivité
Véhicules appartenant à la collectivité
Missions à réaliser :
Sécurisation du périmètre de jour et de nuit ;
Contrôle des entrées exposants et spectateurs ;
Mise en situation appliquée : absence de 2 agents et d’1 chien ne pouvant exercer.`;

describe('cas pratique et mise en situation (T7N-1)', () => {
  it('réponse enregistrée de 553 : aucune mise en situation, premier message sans « 13 agents »', () => {
    const d = calculerDimensionnement(REP, EXTRAIT)!;
    expect(d.casPratique.length).toBeGreaterThan(0);
    expect(d.misesEnSituation || []).toEqual([]);
    expect(messageDimensionnement(d)).not.toMatch(/13 agents|place Saint Gilles, 48 heures/);
    expect(messageDimensionnement(d)).toMatch(/cas pratique, Dimanche férié/);
  });
  it('sans cas pratique, la mise en situation reste', () => {
    const d = calculerDimensionnement({ ...REP, cas_pratique: null }, EXTRAIT)!;
    expect(d.misesEnSituation?.length).toBe(1);
  });
  it.skipIf(!aCorpus('etampes2'))('DCE complet d’etampes2', () => {
    const d = calculerDimensionnement(REP, DCE('etampes2'))!;
    expect(d.misesEnSituation || []).toEqual([]);
  });
});

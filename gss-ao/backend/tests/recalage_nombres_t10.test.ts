// T10N-4 : au recalage du cadre, un nombre du DCE ne remplace celui de GSS qu'avec la même unité ; un effectif calculé
// (« équipe de N agents titulaires ») n'est jamais remplacé ; écart équipe / tableau signalé.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { recalerSurReference, ecartEquipeTableau } from '../src/generation/memoire_type_cadre';
import { nombresDceCompatibles } from '../src/generation/memoire_type';
import { aCorpus, DCE } from './fixtures/corpus';

describe('nombres du DCE au recalage (T10N-4)', () => {
  it('même unité seulement', () => {
    expect([...nombresDceCompatibles('Le rondier arrive en 45 minutes.', 'Le rondier arrive en 30 minutes.', "L'intervention a lieu dans un délai de 30 minutes.")]).toEqual(['N:30']);
    expect(nombresDceCompatibles('Une équipe de 26 agents.', 'Une équipe de 24 agents.', 'Permanence 24h/24, 24 heures sur 24. Ligne 24 du BPU.').size).toBe(0);
    expect([...nombresDceCompatibles('Contrôle 2 fois par mois.', 'Contrôle 4 fois par mois.', 'Le titulaire réalise 4 contrôles par mois.')]).toEqual(['N:4']);
  });
  it('effectif calculé protégé : « équipe de 26 agents titulaires » rétabli', () => {
    const ref = "Nous mettons en place une équipe de 26 agents titulaires, qui assurent les missions de façon régulière.";
    const rep = "Nous mettons en place une équipe de 24 agents titulaires, qui assurent les missions de façon régulière.";
    expect(recalerSurReference(ref, rep, { dce: 'Une équipe de 24 agents est demandée en pointe.' }).texte).toMatch(/équipe de 26 agents titulaires/);
  });
  it('écart entre l’équipe annoncée et le tableau de l’équipe dédiée', () => {
    const t = ['Catégorie de personnel : Qualification : Nombre : Observations', 'Agent de sécurité : CQP APS : 20 : cas pratique : 10 en service', 'Agent cynophile : CQP APS : 2 : 1 en service', 'Agent de sécurité incendie : SSIAP 1 : 2 : 1 en service', 'Encadrant : Encadrement : 2 : 1 en service', '', 'Nous mettons en place une équipe de 24 agents titulaires.'].join('\n');
    expect(ecartEquipeTableau(t)).toEqual({ annonce: 24, somme: 26 });
    expect(ecartEquipeTableau(t.replace('24 agents', '26 agents'))).toBeNull();
  });
});

const CAPTURE = path.join(__dirname, '../_verif/t10c/recalage_etampes2_553_4.json');
describe.skipIf(!aCorpus('etampes2') || !fs.existsSync(CAPTURE))('etampes2 553 (T10N-4)', () => {
  it('recalage réel : le 24 du modèle (« 24h/24 », ligne 24 du BPU) ne remplace pas les 26 titulaires', () => {
    const r = JSON.parse(fs.readFileSync(CAPTURE, 'utf-8'));
    const res = recalerSurReference(r.reference, r.reponse, { ...r.options, dce: DCE('etampes2') });
    expect(res.texte).toMatch(/équipe de 26 agents titulaires/);
    expect(res.texte).not.toMatch(/équipe de 24 agents titulaires/);
  });
});

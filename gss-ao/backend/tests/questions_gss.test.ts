import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { questionExacte, elementsSansDoublon, alerteCadreAbsent } from '../src/generation/memoire_generator';
import { motifRefusHarmonisation } from '../src/generation/memoire_type_cadre';
import { nomsHorsMarche } from '../src/generation/base_memoires';
import { libelleEmplacementSeul } from '../src/generation/reponse_libre_v2';

const mt = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/generation/memoire_type/memoire_type.json'), 'utf-8'));
const fini = (q: string) => /\?/.test(q);

/** Tour 2 (T2-COH-1, T2N-6) : toute question à GSS est une question ; une demande du mémoire type n'est jamais présentée
 *  comme une « Exigence du DCE ». */
describe('questions à GSS', () => {
  it('les questions du mémoire type sont de vraies questions, jamais une « Exigence du DCE »', () => {
    const qs: string[] = [];
    for (const v of Object.values<any>(mt.variables)) for (const k of ['question', 'a_confirmer']) if (v[k]) qs.push(v[k]);
    for (const q of mt.questions_gss_une_fois.questions) qs.push(q.question);
    const el = elementsSansDoublon(qs.map((question, i) => ({ cle: `Q${i}`, question, contexte: '', statut: 'ouvert' as const })));
    for (const e of el) {
      expect(e.question).not.toMatch(/^Exigence du DCE/);
      expect(fini(e.question)).toBe(true);
    }
  });
  it('met en forme les consignes et les libellés (parc_expo 202, cstb 221)', () => {
    for (const q of ['préciser les mesures de sécurité des données personnelles.', 'Confirmer la disponibilité d’une attestation.',
      'À confirmer : Les agents sont sensibilisés à la confidentialité.', 'Confirmer auprès de GSS et de son assureur la souscription des garanties.',
      "Diplômes détenus par l'équipe dédiée au marché.", 'Information à fournir pour compléter : « Taux : [À COMPLÉTER] »',
      "À demander à l'acheteur : plan des locaux à jour"]) {
      const r = questionExacte(q);
      expect(fini(r)).toBe(true);
      expect(r).not.toMatch(/^Exigence du DCE/);
      expect(r.charAt(0)).toBe(r.charAt(0).toUpperCase());
    }
    expect(questionExacte('Confirmer auprès de GSS et de son assureur la souscription.')).not.toMatch(/auprès de GSS/);
  });
  it('garde l’enveloppe « Exigence du DCE » pour une exigence de l’acheteur', () => {
    expect(questionExacte('Pour un agent cynophile affecté, le chien doit être tenu en laisse.')).toMatch(/^Exigence du DCE.*\?$/);
  });
  it('le libellé d’un emplacement seul reste nominal', () => {
    expect(libelleEmplacementSeul('Quel taux de reprise du personnel en place proposez-vous pour ce marché ?', '')).toBe('Taux de reprise du personnel en place');
    expect(libelleEmplacementSeul("Combien d'agents titulaires compte l'équipe dédiée au marché ?", '')).toBe("Nombre d'agents titulaires");
  });
});

/** Tour 2 (T2-COH-4) : l'alerte « cadre de réponse absent » nomme le document sans le couper et cite la phrase du DCE. */
describe('alerteCadreAbsent', () => {
  it('caen : nom du document seul, phrase entière, question', () => {
    const [a] = alerteCadreAbsent('Le Titulaire indique dans son cadre de réponse technique les délais et conditions de mobilisation des\npersonnels décrits au cadre de réponse financier.\n\n3.7 OBLIGATIONS');
    expect(a).toMatch(/« cadre de réponse technique »/);
    expect(a).toMatch(/mobilisation des personnels décrits au cadre de réponse financier\./);
    expect(a).toMatch(/\?$/);
  });
});

/** Tour 2 (T2N-1) : la passe de cohérence de la grille ne remplace jamais l'acheteur par une référence de GSS. */
describe('motifRefusHarmonisation', () => {
  const client = 'Ville de Vitry-sur-Seine, en qualité de coordonnateur des groupements de commandes Ville/Sidoresto et Ville/CCAS';
  const sources = 'Ville de Vitry-sur-Seine. Sécurité des manifestations. MARCHANI';
  it('refuse le nom d’une référence à la place de l’acheteur', () => {
    expect(motifRefusHarmonisation({ extrait: 'la Ville de Vitry-sur-Seine', remplacement: 'la Ville de Port-Jérôme-sur-Seine', valeur: "L'équipe dédiée à la Ville de Vitry-sur-Seine :", sources, client })).not.toBe('');
  });
  it('refuse une modification d’une phrase reprise du mémoire type', () => {
    const reference = 'Nos agents sont contrôlés une à trois fois par mois par nos contrôleurs.';
    expect(motifRefusHarmonisation({ extrait: 'une à trois fois', remplacement: 'deux fois', valeur: reference, reference, sources, client })).not.toBe('');
  });
  it('admet une harmonisation de nombre hors du texte de GSS', () => {
    expect(motifRefusHarmonisation({ extrait: '3 agents', remplacement: '4 agents', valeur: 'Pour le forum, 3 agents sont prévus.', reference: 'Autre texte de GSS.', sources, client })).toBe('');
  });
  it('les questions sur une référence de GSS absente du DCE sont repérées', () => {
    expect(nomsHorsMarche('Confirmer le délai applicable aux sites de Port-Jérôme-sur-Seine.', 'Ville de Vitry-sur-Seine', client)).toContain('Port-Jérôme-sur-Seine');
    expect(nomsHorsMarche('Quel est le délai de mobilisation ?', 'Ville de Vitry-sur-Seine', client)).toEqual([]);
  });
});

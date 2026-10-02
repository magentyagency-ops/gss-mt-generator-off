import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { calculerDimensionnement, lignesEquipe, texteDimensionnement, questionDimensionnement, agentsSimultanes } from '../src/generation/dimensionnement';
import { accorderEffectifUn } from '../src/generation/memoire_type';

const DCE_HAVRE2 = path.resolve(__dirname, '../../_corpus_verif/_dce_textes/havre2.txt');

/** Tour 3 (T3C-1, T3C-6) : poste tenu par plusieurs agents en même temps, effectif de 1 accordé au singulier. */
describe('dimensionnement : agents présents en même temps (havre2)', () => {
  const dce = fs.existsSync(DCE_HAVRE2) ? fs.readFileSync(DCE_HAVRE2, 'utf-8')
    : 'Pour l’évacuation, et la fermeture il faut envisager le déploiement de 2 agents de sécurité (ADS) sur une heure.\nPour l’évacuation, et la fermeture il faut envisager le déploiement de 2 agents de sécurité (ADS) sur un temps de 30 minutes maximum.';
  const semaine = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const rep = { postes: [
    { profil: 'Agent de sécurité (ADS)', qualification: 'ADS', lieu: 'Jardins suspendus', agents_simultanes: 2, citation: 'Pour l’évacuation, et la fermeture il faut envisager le déploiement de 2 agents de sécurité (ADS) sur une heure.', plages: [{ jours: semaine, debut: '19:00', fin: '20:00' }] },
    { profil: 'Agent de sécurité (ADS)', qualification: 'ADS', lieu: 'Parkings', agents_simultanes: 2, citation: 'il faut envisager le déploiement de 2 agents de sécurité (ADS) sur un temps de 30 minutes maximum', plages: [{ jours: semaine, debut: '20:00', fin: '20:30' }] },
  ] };

  it('2 agents en même temps : au moins 2 titulaires, même sous 1 ETP', () => {
    const d = calculerDimensionnement(rep, dce)!;
    expect(d.profils).toHaveLength(1);
    expect(d.profils[0].heuresSemaine).toBe(21);
    expect(d.profils[0].etp).toBeLessThan(1);
    expect(d.profils[0].titulaires).toBe(2);
    expect(d.titulaires).toBe(2);
    expect(lignesEquipe(d)).toMatch(/\| 2 \| .*2 agents en même temps sur le poste/);
    expect(texteDimensionnement(d)).toMatch(/→ 2 titulaires/);
    expect(questionDimensionnement(d)).toMatch(/2 agents titulaires/);
  });

  it('nombre absent de la citation : ignoré (1 agent)', () => {
    expect(agentsSimultanes(2, 'Gardiennage du site du lundi au vendredi')).toBe(1);
    expect(agentsSimultanes(2, 'le déploiement de deux agents de sécurité')).toBe(2);
    expect(agentsSimultanes(3, '3 SSIAP 1 en permanence')).toBe(3);
    expect(agentsSimultanes(2, 'pendant 2 heures')).toBe(1);
    expect(agentsSimultanes('x', '2 agents')).toBe(1);
  });

  it('effectif de 1 : accordé au singulier', () => {
    expect(accorderEffectifUn('Nous mettons en place une équipe de 1 agents titulaires, qui assurent les missions de façon régulière.'))
      .toBe('Nous mettons en place une équipe de 1 agent titulaire, qui assure les missions de façon régulière.');
    expect(accorderEffectifUn('une équipe de 21 agents titulaires, qui assurent')).toBe('une équipe de 21 agents titulaires, qui assurent');
    expect(accorderEffectifUn('soit 0,1 agents')).toBe('soit 0,1 agents');
  });
});

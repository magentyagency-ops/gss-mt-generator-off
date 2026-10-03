// Campagne « zéro défaut », tour 1 (T1-CONS-4) : page d'une rubrique dans un mémoire au style Marine v3, jamais la page
// d'ouverture de son bloc.
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { describe, it, expect } from 'vitest';
import { pageDe } from '../src/generation/assistant_memoire';

const R = path.resolve(__dirname, '../../_corpus_verif/_resultats');
const pdf = (n: string) => path.join(R, n);
const disponible = (n: string) => fs.existsSync(pdf(n)) && spawnSync('pdftotext', ['-v']).status === 0;

describe('pageDe : style Marine v3 (T1-CONS-4)', () => {
  it.skipIf(!disponible('v-fontainebleau-801.pdf'))('Fontainebleau : propositions aux pages 100 et 136, jamais aux ouvertures de bloc 62 et 102', () => {
    expect(pageDe(pdf('v-fontainebleau-801.pdf'), 'Surveillance des accès extérieurs')).toBe(100);
    expect(pageDe(pdf('v-fontainebleau-801.pdf'), 'Hygiène et sécurité au travail')).toBe(136);
    // Deux procédures au début identique : chacune sa page.
    expect(pageDe(pdf('v-fontainebleau-801.pdf'), 'Notre socle de procédures : la gestion d’une victime')).not.toBe(pageDe(pdf('v-fontainebleau-801.pdf'), 'Notre socle de procédures : la gestion d’un incendie'));
  });
  it.skipIf(!disponible('v-caen-706.pdf'))('Caen : « Plan de prévention » page 126', () => {
    expect(pageDe(pdf('v-caen-706.pdf'), 'Plan de prévention')).toBe(126);
  });
});

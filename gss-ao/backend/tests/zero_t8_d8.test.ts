// Tour 8 (correcteur) : D8, exigence citée et phrase rétablie (T8-CONS-5, T8N-8).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fondementDansDce, appliquerChoix } from '../src/generation/adaptations_cctp';

const D = path.join(__dirname, '../../_corpus_verif/_dce_textes');
describe('exigence du CCTP citée pour une phrase adaptée (T8-CONS-5)', () => {
  it('becquerel : phrase entière, jamais coupée après « L. », jamais « les bâtiments suivants »', () => {
    const dce = fs.readFileSync(path.join(D, 'becquerel.txt'), 'utf-8');
    const extrait = "Cette reprise s'effectue conformément à l'article L. 1224-1 du Code du travail et à l'accord du 5 mars 2002 relatif à la reprise du personnel, modifié par l'avenant du 28 janvier 2011.";
    const par = extrait.replace('L. 1224-1 du', 'L. 1224-1 et suivants du');
    const f = fondementDansDce({ type: 'remplacement', extrait, par }, extrait, dce);
    expect(f).toMatch(/article L\. 1224-1 et suivants du Code du travail/);
    expect(f).not.toMatch(/bâtiments suivants/);
  });
  it('imm : « point de contrôle » fondé sur les points de contrôle, jamais sur une ligne de pénalités ou un autre contrôle', () => {
    const dce = fs.readFileSync(path.join(D, 'imm.txt'), 'utf-8');
    const e = "Lorsque l'agent passe et scanne un pointeau, l'étape de ronde est aussitôt consignée dans la main courante et consultable sur le tableau de bord.";
    const p = e.replace('scanne un pointeau', 'valide un point de contrôle');
    const f = fondementDansDce({ type: 'remplacement', extrait: e, par: p }, e, dce);
    expect(f).toMatch(/points de contrôle/);
    expect(f).not.toMatch(/contradictoire|€/);
  });
});

describe('phrase retirée puis rétablie ou modifiée : à sa place, jamais dans une liste (T8N-8)', () => {
  const texte = "Nous suivons cette procédure :\n1. **Réception** de la demande ;\n4. **Envoi** du planning au CNRS et des consignes aux agents mobilisés.\nLes prestations supplémentaires sont contrôlées comme les autres.";
  const a: any = { n: 6, rubrique: 'b5', titre: 'x', origine: "Selon l'urgence, les agents sont en place dans un délai de 1 h à 24 h.", adaptee: '', exigence: '', etape: '', avant: 'Envoi du planning au CNRS et des consignes aux agents mobilisés.', apres: 'Les prestations supplémentaires sont contrôlées comme les autres.', statut: 'retablie' };
  it('rétablir', () => expect(appliquerChoix(texte, a, a.origine).texte.split('\n')[3]).toBe("Selon l'urgence, les agents sont en place dans un délai de 1 h à 24 h. Les prestations supplémentaires sont contrôlées comme les autres."));
  it('modifier', () => expect(appliquerChoix(texte, a, 'Selon l’urgence, délai convenu avec le CNRS.').texte.split('\n')[2]).toBe('4. **Envoi** du planning au CNRS et des consignes aux agents mobilisés.'));
});

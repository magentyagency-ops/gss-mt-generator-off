// Tour 2 (T2-REG-2, T2-COH-3) : une reconstruction de la base des mémoires et du registre ne perd aucune correction de
// GSS et redonne le registre versionné à l'identique.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { appliquerCorrectionsPassages, correctionsPassages } from '../src/generation/base_memoires';
import { consolider, registrePourConsolidation } from '../src/rag/base_memoires_build';

const DIR = path.resolve(__dirname, '../python/base_memoires');
const ANCIENS = /Peugeot 3008|RUE D ELBEUF|02\.35\.89\.09\.92|J-15 DES PLANNINGS|Délai max: 30|moins de 20 minutes\.|max: 20 minutes SECOURS/;

describe('base des mémoires et registre : reconstruction (T2-REG-2, T2-COH-3)', () => {
  it('aucun passage versionné ne contient un fait corrigé par GSS', () => {
    const base = JSON.parse(fs.readFileSync(path.join(DIR, 'base_memoires.json'), 'utf-8'));
    expect(base.passages.filter((p: any) => ANCIENS.test(p.texte)).map((p: any) => p.id)).toEqual([]);
  });
  it('les corrections versionnées, réappliquées à des passages non corrigés, redonnent les passages versionnés', () => {
    const base = JSON.parse(fs.readFileSync(path.join(DIR, 'base_memoires.json'), 'utf-8'));
    const corrections = correctionsPassages();
    expect(corrections.length).toBe(9);
    // Passage remis dans son état d'avant correction (texte extrait du PDF), puis corrigé.
    const touches = base.passages.filter((p: any) => corrections.some((c) => c.document === p.document && c.page === p.page && p.texte.split('\n').includes(c.nouveau)));
    expect(touches.length).toBe(8);
    const anciens = touches.map((p: any) => ({ ...p, texte: corrections.filter((c) => c.document === p.document && c.page === p.page).reduce((t: string, c) => t.split('\n').map((l) => (l === c.nouveau ? c.ancien : l)).join('\n'), p.texte) }));
    expect(anciens.every((p: any) => ANCIENS.test(p.texte) || /Peugeot 208 aux couleurs de GSS\. Nous/.test(p.texte))).toBe(true);
    expect(appliquerCorrectionsPassages(anciens, corrections)).toBe(9);
    expect(anciens.map((p: any) => p.texte)).toEqual(touches.map((p: any) => p.texte));
  });
  it('reconsolider le registre versionné le redonne à l’identique (valeurs et sources rédigées conservées)', () => {
    const r = JSON.parse(fs.readFileSync(path.join(DIR, 'registre_informations.json'), 'utf-8'));
    const reg = registrePourConsolidation(JSON.parse(JSON.stringify(r.informations)));
    consolider(reg);
    const champs = ['valeur_retenue', 'date_retenue', 'source_retenue', 'statut', 'valeurs_anterieures_differentes'];
    for (const e of r.informations) for (const k of champs) expect([e.cle, k, reg[e.cle][k]]).toEqual([e.cle, k, e[k]]);
    const st = r.informations.find((e: any) => e.cle === 'recours_sous_traitance');
    expect(st.valeur_retenue).toMatch(/^Non : GSS n'envisage pas de recourir à la sous-traitance/);
    expect(r.informations.find((e: any) => e.cle === 'vehicules_encadrement').source_retenue).toBe('Réponse de GSS (1er octobre 2026)');
  });
});

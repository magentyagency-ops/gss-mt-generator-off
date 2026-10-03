// Tour 5 (T5-COH-4, citedia2 474) : phrase type des délais du marché sans redire « GSS organise … ».
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { delaisHorsNormandie } from '../src/generation/base_memoires';

const DCE = path.join(__dirname, '../../_corpus_verif/_dce_textes/citedia2.txt');
describe.skipIf(!fs.existsSync(DCE))('délais du marché hors Normandie (T5-COH-4)', () => {
  it('la suite « GSS organise … » de la phrase d’origine n’est jamais redite', () => {
    const dce = fs.readFileSync(DCE, 'utf-8');
    const t = "Le CCTP fixe des mises à disposition de 2 heures en urgence et de 24 heures selon la demande ; GSS organise la mobilisation en fonction du délai applicable et confirme l'affectation à Citédia Métropole.";
    const r = delaisHorsNormandie(t, dce, true).texte;
    expect(r).toBe("Le marché fixe des délais de mise à disposition de 2 heures et de 24 heures ; GSS organise la mobilisation en fonction du délai applicable et confirme l'affectation à Citédia Métropole.");
    expect(r.match(/GSS organise/g)!.length).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { nettoyerChampCadre } from '../src/generation/base_memoires';

/** Tour 4 (T4N-1) : le tableau des ressources de GSS garde toutes ses lignes dans un cadre. */
describe('nettoyerChampCadre : lignes de tableau jamais dédoublonnées (T4N-1)', () => {
  it('la ligne « Agents SSIAP 3 » reste', () => {
    const t = 'Catégorie de personnel : Qualification : Nombre\nAgents SSIAP 1 : SSIAP 1 : 185\nAgents SSIAP 2 : SSIAP 1 – SSIAP 2 : 28\nAgents SSIAP 3 : SSIAP 1 – 2 – 3 : 2\nContrôleurs : Manager : 35';
    const s = nettoyerChampCadre(t);
    expect(s).toContain('Agents SSIAP 3 : SSIAP 1 – 2 – 3 : 2');
    expect(s).toContain('Agents SSIAP 2 : SSIAP 1 – SSIAP 2 : 28');
    expect(s.split('\n')).toHaveLength(5);
  });
  it('deux phrases dont les nombres diffèrent ne sont pas des doublons ; une vraie répétition est retirée', () => {
    const a = 'Nos agents interviennent sur le site en 45 minutes au maximum après le déclenchement.';
    const b = 'Nos agents interviennent sur le site en 60 minutes au maximum après le déclenchement.';
    expect(nettoyerChampCadre(`${a}\n${b}`)).toBe(`${a}\n${b}`);
    expect(nettoyerChampCadre(`${a}\n${a}`)).toBe(a);
  });
});

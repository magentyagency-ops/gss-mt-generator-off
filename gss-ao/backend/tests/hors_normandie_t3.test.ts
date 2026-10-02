// T3-COH-1 : une surface ou une jauge écrite en chiffres n'est jamais lue comme un code postal.
import { describe, it, expect } from 'vitest';
import { marcheHorsNormandie } from '../src/generation/base_memoires';

describe('marché hors Normandie : codes postaux seulement (T3-COH-1)', () => {
  const rouen = 'Centre Henri Becquerel, rue d’Amiens, 76000 Rouen.';
  it('« 12000 m² », « 18962 m2 », « 45000 visiteurs » ne sont pas des codes postaux', () => {
    expect(marcheHorsNormandie({}, `${rouen} Le site existant compte 12000 m² de locaux.`)).toBe(false);
    expect(marcheHorsNormandie({}, `${rouen} Surface 18962 m2, 30000 M2, 45000 visiteurs, 20000 personnes, 15000 euros.`)).toBe(false);
    expect(marcheHorsNormandie({ sites: [{ name: '76120 Le Grand-Quevilly' }] }, 'Surface 30000 m2, 45000 visiteurs')).toBe(false);
  });
  it('les vrais codes hors Normandie restent reconnus', () => {
    expect(marcheHorsNormandie({}, 'Surveillance du site de Lille (59000), rondes.')).toBe(true);
    expect(marcheHorsNormandie({}, 'Hôpital, 93330 – Neuilly-sur-Marne.')).toBe(true);
    expect(marcheHorsNormandie({}, '75014 Paris, 75014 PARIS')).toBe(true);
  });
});

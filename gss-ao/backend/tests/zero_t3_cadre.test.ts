// Campagne « zéro défaut », tour 3 : cadre imposé, identité CNAPS (T3-CONS-6).
import { describe, it, expect } from 'vitest';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-used';
import { completerIdentiteCnaps } from '../src/generation/memoire_generator';
import { chargerMemoireType } from '../src/generation/memoire_type';

describe('identité CNAPS d’une seule source dans le cadre (T3-CONS-6)', () => {
  it('activité et agrément de l’entreprise remplis, fin de validité inconnue laissée à compléter', () => {
    const t = completerIdentiteCnaps("• Activité : [À COMPLÉTER].\n• Date de fin de validité de l’autorisation d’exercer : [À COMPLÉTER].\n• Agrément de l’entreprise : [À COMPLÉTER].");
    expect(t).toContain('• Activité : Surveillance humaine et gardiennage (activités privées de sécurité, livre VI du CSI).');
    expect(t).toContain('• Agrément de l’entreprise : AUT-076-2114-02-12-20140458592.');
    expect(t).toContain('• Date de fin de validité de l’autorisation d’exercer : [À COMPLÉTER].');
  });
  it('la question des dates CNAPS est celle, unique, de questions_gss_une_fois', () => {
    expect(JSON.stringify((chargerMemoireType() as any).questions_gss_une_fois)).toMatch(/Autorisation CNAPS et agrément dirigeant/);
  });
});

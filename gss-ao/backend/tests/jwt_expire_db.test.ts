import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * JWT de l'utilisateur expiré pendant une longue génération (production, d230e40) : lectures ET écritures rejouées avec le
 * client Admin, sinon saveDossier échouait dès sa lecture du dossier existant, avant l'écriture que la production protégeait.
 */
const appels: string[] = [];
const ligne = { id: 'd1', user_id: 'u1', nom: 'Acheteur', contenu: { acheteur: 'Acheteur', statut: 'En cours' } };

function client(nom: 'scoped' | 'admin') {
  const reponse = (op: string) => {
    appels.push(`${nom}:${op}`);
    return nom === 'scoped' ? { data: null, error: { message: 'JWT expired' } } : { data: op === 'select' ? ligne : null, error: null };
  };
  return {
    from: () => {
      const q: any = {
        select: () => { q.op = q.op || 'select'; return q; },
        eq: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => reponse(q.op),
        single: async () => reponse(q.op),
        upsert: async () => reponse('upsert'),
        update: () => ({ eq: async () => reponse('update') }),
      };
      return q;
    },
  };
}

vi.mock('../src/core/supabase', () => ({
  getScopedClient: () => client('scoped'),
  getAdminClient: () => client('admin'),
  getCurrentUserId: () => 'u1',
}));

import { DB } from '../src/core/db';

beforeEach(() => { appels.length = 0; });

describe('JWT expiré pendant une génération', () => {
  it('getDossier : lecture rejouée avec le client Admin', async () => {
    const d = await DB.getDossier('d1');
    expect(d?.id).toBe('d1');
    expect(appels).toEqual(['scoped:select', 'admin:select']);
  });
  it('saveDossier : lecture puis écriture rejouées avec le client Admin, sans erreur', async () => {
    await expect(DB.saveDossier('d1', { statut: 'À valider' } as any)).resolves.toBeUndefined();
    expect(appels).toEqual(['scoped:select', 'admin:select', 'scoped:upsert', 'admin:upsert']);
  });
});

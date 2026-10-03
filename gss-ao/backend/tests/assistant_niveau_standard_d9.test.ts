import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Décision D9 (3 octobre 2026) : l'assistant interactif (échanges avec GSS et recomposition du mémoire qu'ils
 * déclenchent) appelle OpenAI au niveau STANDARD (aucun service_tier) ; la génération des mémoires reste en Flex.
 * Même modèle (gpt-6-luna), même effort. Hors ligne : le fetch du SDK OpenAI est intercepté, aucun appel réel.
 */
vi.hoisted(() => {
  process.env.OPENAI_API_KEY = 'sk-test-hors-ligne';
  process.env.SUPABASE_URL ||= 'http://127.0.0.1:9';
  process.env.SUPABASE_ANON_KEY ||= 'hors-ligne';
  delete process.env.GSS_IA_SERVICE_TIER;
  delete process.env.GSS_IA_MODELE;
});

const corps: any[] = [];
const fetchIntercepte = async (_url: any, init: any) => {
  corps.push(JSON.parse(init.body));
  return new Response(JSON.stringify({
    id: 'x', object: 'chat.completion', model: 'gpt-6-luna',
    choices: [{ index: 0, message: { role: 'assistant', content: '{"ok": true}' }, finish_reason: 'stop' }], usage: {},
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};

// Routes : seul le traitement de l'assistant est remplacé, pour observer le niveau de service de ses appels.
const vus: Record<string, any> = {};
vi.mock('../src/generation/assistant_memoire', () => ({
  discuter: async () => {
    const { json } = await import('../src/generation/completion');
    await new Promise((ok) => setTimeout(ok, 5));
    await json('assistant', 'message de GSS');
    vus.assistant = corps[corps.length - 1];
    return { etat: { elements: [] }, reponse: 'ok', modifies: [], page: undefined };
  },
}));
vi.mock('../src/generation/completion', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    vueEtat: () => ({}),
    capitaliser: async () => undefined,
    integrerReponse: async () => {
      await orig.json('simulation', 'réponse d\'équipe simulée');
      vus.simulation = corps[corps.length - 1];
      return { etat: { elements: [] }, cles: [] };
    },
    remplirSaisie: async () => {
      await orig.json('saisie', 'information de GSS');
      vus.saisie = corps[corps.length - 1];
      return { elements: [] };
    },
  };
});

import { reglagesIA, assistantInteractif, enAssistantInteractif, NIVEAU_SERVICE_ASSISTANT } from '../src/core/modeles_ia';
import { json, verrouiller } from '../src/generation/completion';

beforeAll(() => { vi.stubGlobal('fetch', fetchIntercepte); });
afterAll(() => {
  vi.unstubAllGlobals();
  // Dossier de pièces jointes vide créé par la route de l'assistant pour le dossier de test.
  fs.rmSync(path.resolve(__dirname, '../response/pieces/d9-route'), { recursive: true, force: true });
});

describe('D9 : niveau de service de l\'assistant interactif', () => {
  it('une seule constante : standard', () => {
    expect(NIVEAU_SERVICE_ASSISTANT).toBe('standard');
  });

  it('génération : Flex ; assistant : aucun service_tier ; modèle et effort inchangés', async () => {
    const generation = reglagesIA('redaction');
    const assistant = await assistantInteractif(async () => reglagesIA('redaction'));
    expect(generation.service_tier).toBe('flex');
    expect(assistant.service_tier).toBeUndefined();
    expect(assistant.model).toBe('gpt-6-luna');
    expect(assistant.model).toBe(generation.model);
    expect(assistant.reasoning_effort).toBe(generation.reasoning_effort);
    expect(assistant.prompt_cache_options).toEqual(generation.prompt_cache_options);
    for (const u of ['analyse', 'mecanique'] as const) {
      expect(reglagesIA(u).service_tier).toBe('flex');
      const a = await assistantInteractif(async () => reglagesIA(u));
      expect(a.service_tier).toBeUndefined();
      expect(a.reasoning_effort).toBe(reglagesIA(u).reasoning_effort);
    }
    expect(enAssistantInteractif()).toBe(false);
  });

  it('GSS_IA_SERVICE_TIER=flex explicite : l\'assistant reste en standard', async () => {
    process.env.GSS_IA_SERVICE_TIER = 'flex';
    try {
      expect(reglagesIA('redaction').service_tier).toBe('flex');
      expect((await assistantInteractif(async () => reglagesIA('redaction'))).service_tier).toBeUndefined();
    } finally {
      delete process.env.GSS_IA_SERVICE_TIER;
    }
  });

  it('requêtes envoyées (completion.json) : standard dans l\'assistant, Flex ailleurs, même en parallèle et à travers le verrou du dossier', async () => {
    corps.length = 0;
    await Promise.all([
      verrouiller('d9-test', () => assistantInteractif(async () => {
        await new Promise((ok) => setTimeout(ok, 10));
        await json('a', 'assistant');
      })),
      json('g', 'generation'),
    ]);
    const assistant = corps.find((c) => c.messages[1].content === 'assistant');
    const generation = corps.find((c) => c.messages[1].content === 'generation');
    expect(assistant.service_tier).toBeUndefined();
    expect(assistant.model).toBe('gpt-6-luna');
    expect(generation.service_tier).toBe('flex');
    expect(generation.model).toBe('gpt-6-luna');
    expect(assistant.reasoning_effort).toBe(generation.reasoning_effort);
  });

  it('recomposition déclenchée par l\'assistant (MemoireGenerator.callOpenAI) : standard ; génération : Flex', async () => {
    const { MemoireGenerator } = await import('../src/generation/memoire_generator');
    const gen: any = new MemoireGenerator();
    corps.length = 0;
    await gen.callOpenAI([{ role: 'user', content: 'generation json' }], 0.2, 'test génération', true);
    await assistantInteractif(() => gen.callOpenAI([{ role: 'user', content: 'recomposition json' }], 0.2, 'test assistant', true));
    expect(corps[0].service_tier).toBe('flex');
    expect(corps[1].service_tier).toBeUndefined();
    expect(corps[1].model).toBe(corps[0].model);
    expect(corps[1].reasoning_effort).toBe(corps[0].reasoning_effort);
  });

  it('routes de l\'assistant (POST /dossiers/:id/assistant et /dossiers/:id/completion) et d\'avant la génération (detect-missing, simuler-reponse) : standard', async () => {
    const router: any = (await import('../src/api/routes')).default;
    const route = (p: string) => router.stack.find((l: any) => l.route?.path === p && l.route.methods.post).route;
    const appeler = async (p: string, req: any) => {
      const pile = route(p).stack;
      let fini: (v?: any) => void = () => undefined;
      const termine = new Promise((ok) => { fini = ok; });
      const res: any = { statusCode: 200, status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.body = b; fini(); return this; } };
      await pile[pile.length - 1].handle(req, res, () => undefined);
      await termine;
      return res;
    };
    corps.length = 0;
    const r1 = await appeler('/dossiers/:id/assistant', { params: { id: 'd9-route' }, body: { message: 'Modifie la page 3' }, files: [] });
    expect(r1.statusCode).toBe(200);
    expect(vus.assistant.service_tier).toBeUndefined();
    const r2 = await appeler('/dossiers/:id/completion', { params: { id: 'd9-route' }, body: { cle: 'GSS_AC_1', valeur: '12 agents' } });
    expect(r2.statusCode).toBe(200);
    expect(vus.saisie.service_tier).toBeUndefined();
    // Échanges d'avant la génération (T5-REG-1) : détection des informations manquantes et réponse simulée de la démonstration.
    const { MemoireGenerator } = await import('../src/generation/memoire_generator');
    const espion = vi.spyOn(MemoireGenerator.prototype as any, 'detectMissingInfo').mockImplementation(async () => {
      await json('detection', 'informations manquantes');
      vus.detection = corps[corps.length - 1];
      return { missingFields: [], completude: null, contradictions: [], cached: false };
    });
    const r3 = await appeler('/dossiers/:id/detect-missing', { params: { id: 'd9-route' }, query: { force: '1' }, body: {} });
    expect(r3.statusCode).toBe(200);
    expect(vus.detection.service_tier).toBeUndefined();
    espion.mockRestore();
    const r4 = await appeler('/dossiers/:id/completion/simuler-reponse', { params: { id: 'demo-d9' }, body: { question: 'q', reponse: 'r' } });
    expect(r4.statusCode).toBe(200);
    expect(vus.simulation.service_tier).toBeUndefined();
    // Hors de ces routes, la même fonction part en Flex.
    await json('g', 'generation');
    expect(corps[corps.length - 1].service_tier).toBe('flex');
  });
});

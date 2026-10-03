// Tour 6 (T6-COH-7) : après un appel Flex resté sans réponse jusqu'au délai, les appels suivants partent en standard.
import { describe, it, expect, afterEach } from 'vitest';
import OpenAI from 'openai';
import { reglagesIA, flexSuspendu, reprendreFlex } from '../src/core/modeles_ia';

const OK = () => new Response(JSON.stringify({ id: 'x', object: 'chat.completion', model: 'gpt-6-luna', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: {} }), { status: 200, headers: { 'content-type': 'application/json' } });

describe('disjoncteur du Flex', () => {
  afterEach(() => reprendreFlex());
  it('délai dépassé en Flex : repli, puis appels suivants directement en standard', async () => {
    delete process.env.GSS_IA_SERVICE_TIER;
    const tiers: string[] = [];
    const fetch = async (_u: any, init: any) => {
      const t = JSON.parse(init.body).service_tier || 'standard';
      tiers.push(t);
      if (t === 'flex') { const e: any = new Error('The operation was aborted.'); e.name = 'AbortError'; throw e; }
      return OK();
    };
    const cli = new OpenAI({ apiKey: 'x', fetch: fetch as any });
    const corps = { ...reglagesIA('redaction'), messages: [{ role: 'user', content: 'a' }] } as any;
    expect(corps.service_tier).toBe('flex');
    await cli.chat.completions.create(corps);
    expect(flexSuspendu()).toBeGreaterThan(Date.now());
    await cli.chat.completions.create(corps);
    expect(tiers).toEqual(['flex', 'standard', 'standard']);
  });
  it('429 rapide : repli de l\'appel seul, pas de suspension', async () => {
    const tiers: string[] = [];
    const fetch = async (_u: any, init: any) => {
      const t = JSON.parse(init.body).service_tier || 'standard';
      tiers.push(t);
      if (t === 'flex') return new Response(JSON.stringify({ error: { message: 'Resource unavailable', type: 'rate_limit' } }), { status: 429, headers: { 'content-type': 'application/json' } });
      return OK();
    };
    const cli = new OpenAI({ apiKey: 'x', fetch: fetch as any });
    await cli.chat.completions.create({ ...reglagesIA('redaction'), messages: [{ role: 'user', content: 'a' }] } as any);
    expect(flexSuspendu()).toBe(0);
    expect(tiers).toEqual(['flex', 'standard']);
  });
});

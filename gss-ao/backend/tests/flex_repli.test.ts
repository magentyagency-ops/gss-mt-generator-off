import { describe, it, expect } from 'vitest';
import OpenAI from 'openai';
import { reglagesIA } from '../src/core/modeles_ia';

/** Tour 2 (T2N-4) : en Flex, une erreur serveur passagère est refaite en niveau standard ; un crédit épuisé jamais. */
async function essai(premiere: { status: number; corps: any }): Promise<{ ok: boolean; tiers: string[] }> {
  delete process.env.GSS_IA_SERVICE_TIER;
  const tiers: string[] = [];
  const fetch = async (_u: any, init: any) => {
    tiers.push(JSON.parse(init.body).service_tier || 'standard');
    if (tiers.length === 1) return new Response(JSON.stringify(premiere.corps), { status: premiere.status, headers: { 'content-type': 'application/json', 'retry-after-ms': '5' } });
    return new Response(JSON.stringify({ id: 'x', object: 'chat.completion', model: 'gpt-6-luna', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const cli = new OpenAI({ apiKey: 'x', fetch: fetch as any });
  try {
    await cli.chat.completions.create({ ...reglagesIA('redaction'), messages: [{ role: 'user', content: 'a' }] } as any);
    return { ok: true, tiers };
  } catch {
    return { ok: false, tiers };
  }
}

describe('repli Flex', () => {
  it('503 en Flex : refait en standard', async () => {
    const r = await essai({ status: 503, corps: { error: { message: 'Service Unavailable', type: 'server_error' } } });
    expect(r.ok).toBe(true);
    expect(r.tiers).toEqual(['flex', 'standard']);
  });
  it('500 en Flex : refait en standard', async () => {
    const r = await essai({ status: 500, corps: { error: { message: 'Internal error', type: 'server_error' } } });
    expect(r.ok).toBe(true);
  });
  it('crédit épuisé : jamais réessayé', async () => {
    const r = await essai({ status: 429, corps: { error: { message: 'You exceeded your current quota', type: 'insufficient_quota', code: 'insufficient_quota' } } });
    expect(r.ok).toBe(false);
    expect(r.tiers.length).toBe(1);
  });
  it('T7-COH-5 : crédit épuisé annoncé par le seul message réel (sans code) : jamais réessayé', async () => {
    const r = await essai({ status: 429, corps: { error: { message: 'You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.' } } });
    expect(r.ok).toBe(false);
    expect(r.tiers.length).toBe(1);
  });
});

import { creditEpuise } from '../src/core/modeles_ia';
/** Tour 2 (T2-COH-2) : crédit épuisé reconnu sous toutes ses formes. */
describe('creditEpuise', () => {
  it('reconnaît insufficient_quota et credit_balance_exhausted', () => {
    expect(creditEpuise({ status: 429, code: 'insufficient_quota' })).toBe(true);
    expect(creditEpuise({ status: 429, error: { code: 'credit_balance_exhausted' } })).toBe(true);
    expect(creditEpuise({ status: 429, message: 'Your credit balance is exhausted (credit_balance_exhausted)' })).toBe(true);
    expect(creditEpuise({ status: 429, code: 'rate_limit_exceeded' })).toBe(false);
  });
  it('T7-COH-5 : reconnaît le message réel relevé dans _corpus_verif/_logs, sans code', () => {
    const reel = '429 You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.';
    expect(creditEpuise({ status: 429, message: reel })).toBe(true);
    expect(creditEpuise({ status: 429, error: { message: 'You have no credits remaining.' } })).toBe(true);
    expect(creditEpuise({ status: 429, message: 'You exceeded your current quota, please check your plan and billing details.' })).toBe(true);
    expect(creditEpuise({ status: 429, message: 'Rate limit reached for gpt-6-luna in organization org-x on tokens per min (TPM).' })).toBe(false);
    expect(creditEpuise({ status: 429, message: 'Resource unavailable (flex)' })).toBe(false);
  });
});

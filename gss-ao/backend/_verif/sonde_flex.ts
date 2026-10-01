// Vérifie le niveau Flex par défaut (appel réel minimal) et son repli en niveau standard (réponses simulées).
import OpenAI from 'openai';
import { reglagesIA } from '../src/core/modeles_ia';
import { getSettings } from '../src/core/config';
const reponse = (status: number, corps: any) => new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });
(async () => {
  console.log('Réglages rédaction :', JSON.stringify(reglagesIA('redaction')));
  const c = new OpenAI({ apiKey: getSettings().openaiApiKey });
  const r: any = await c.chat.completions.create({ ...reglagesIA('mecanique'), messages: [{ role: 'user', content: 'Réponds OK' }] } as any);
  console.log('1. Appel réel :', r.choices[0].message.content, '| niveau facturé :', r.service_tier);
  for (const [nom, erreur] of [
    ['2. Flex indisponible (429 resource_unavailable)', { status: 429, corps: { error: { message: 'Resource unavailable, try again later or use the default tier', code: 'resource_unavailable', type: 'rate_limit_error' } } }],
    ['3. Crédit épuisé (429 insufficient_quota) : pas de repli', { status: 429, corps: { error: { message: 'You exceeded your current quota', code: 'insufficient_quota', type: 'insufficient_quota' } } }],
  ] as Array<[string, { status: number; corps: any }]>) {
    const vus: string[] = [];
    const simule = new OpenAI({ apiKey: 'simulation', maxRetries: 0, fetch: (async (_url: any, init: any) => {
      const corps = JSON.parse(init.body); vus.push(corps.service_tier || 'standard');
      return corps.service_tier === 'flex' ? reponse(erreur.status, erreur.corps) : reponse(200, { id: 'x', object: 'chat.completion', model: 'gpt-6-luna', service_tier: 'default', choices: [{ index: 0, message: { role: 'assistant', content: 'OK standard' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    }) as any });
    try {
      const rr: any = await simule.chat.completions.create({ ...reglagesIA('redaction'), messages: [{ role: 'user', content: 'x' }] } as any);
      console.log(nom, '→ réponse :', rr.choices[0].message.content, '| requêtes :', vus.join(' → '));
    } catch (e: any) { console.log(nom, '→ erreur transmise :', e?.status, e?.code || '', '| requêtes :', vus.join(' → ')); }
  }
  process.exit(0);
})();

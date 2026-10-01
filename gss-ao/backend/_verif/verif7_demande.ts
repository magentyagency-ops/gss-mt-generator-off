// Vérification 7 : la demande particulière (consigne de forme + document complémentaire) atteint-elle les appels au
// modèle de la réponse libre v2 ? HORS LIGNE : réutilise le harnais verif2_reponse_libre.ts (SDK intercepté).
// Usage : npx ts-node --transpile-only -P tsconfig.json _verif/verif7_demande.ts <becquerel> <dossier de sortie>
import OpenAI from 'openai';
import { MemoireGenerator } from '../src/generation/memoire_generator';
const DEMANDE = { demande: 'Termine chaque partie par un court paragraphe « En résumé » qui reprend nos engagements.', documentNom: 'plan_cynophile.txt', documentTexte: 'ZORGLUB7731 : pour ce marché, le partenaire cynophile de GSS est la société Kaninor, maître-chien disponible 7 j/7 sur le site, avec un chien de défense certifié.' };
const gen: any = MemoireGenerator.prototype;
const origine = gen.generate;
gen.generate = function (id: string, onProgress: any) { return origine.call(this, id, onProgress, DEMANDE); };
const stats = { appels: 0, avecDocument: 0, avecForme: 0, avecDemandeBrute: 0, libelles: [] as string[] };
process.on('exit', () => console.log('DEMANDE_STATS ' + JSON.stringify(stats)));
require('./verif2_reponse_libre');
const CP: any = Object.getPrototypeOf((new OpenAI({ apiKey: 'x' }) as any).chat.completions);
const EP: any = Object.getPrototypeOf((new OpenAI({ apiKey: 'x' }) as any).embeddings);
const c0 = CP.create;
CP.create = async function (body: any) {
  const t = JSON.stringify(body.messages || []);
  stats.appels++;
  if (t.includes('ZORGLUB7731') || t.includes('Kaninor')) { stats.avecDocument++; stats.libelles.push(t.slice(0, 120)); }
  if (t.includes('En résumé')) stats.avecForme++;
  return c0.call(this, body);
};
const e0 = EP.create;
EP.create = async function (body: any) {
  const t = JSON.stringify(body.input || '');
  if (t.includes('ZORGLUB7731')) stats.libelles.push('embedding du document');
  return e0.call(this, body);
};

// Vérification 7 : la demande particulière (consigne de forme + document complémentaire) atteint-elle les appels au
// modèle de la réponse libre v2 ? HORS LIGNE : réutilise le harnais verif2_reponse_libre.ts (SDK intercepté).
// Usage : npx ts-node --transpile-only -P tsconfig.json _verif/verif7_demande.ts <becquerel> <dossier de sortie>
//        HARNAIS_DEMANDE=./cadre_court_hors_ligne npx ts-node --transpile-only -P tsconfig.json _verif/verif7_demande.ts imm <dossier de sortie>
import OpenAI from 'openai';
import { MemoireGenerator } from '../src/generation/memoire_generator';
const DEMANDE = { demande: 'Termine chaque partie par un court paragraphe « En résumé » qui reprend nos engagements.', documentNom: 'plan_cynophile.txt', documentTexte: 'ZORGLUB7731 : pour ce marché, le partenaire cynophile de GSS est la société Kaninor, maître-chien disponible 7 j/7 sur le site, avec un chien de défense certifié.' };
const gen: any = MemoireGenerator.prototype;
const origine = gen.generate;
gen.generate = function (id: string, onProgress: any) { return origine.call(this, id, onProgress, DEMANDE); };
const stats = { appels: 0, avecDocument: 0, avecForme: 0, avecDemandeBrute: 0, libelles: [] as string[] };
process.on('exit', () => console.log('DEMANDE_STATS ' + JSON.stringify(stats)));
// Harnais à envelopper : réponse libre v2 (défaut) ou format court sur mémoire type (HARNAIS_DEMANDE=./cadre_court_hors_ligne, corpus imm).
require(process.env.HARNAIS_DEMANDE || './verif2_reponse_libre');
const CP: any = Object.getPrototypeOf((new OpenAI({ apiKey: 'x' }) as any).chat.completions);
const EP: any = Object.getPrototypeOf((new OpenAI({ apiKey: 'x' }) as any).embeddings);
const c0 = CP.create;
// Correction 7 : la simulation ne sait pas répartir une demande (réponse générique, forme vide) et ses embeddings
// sont aléatoires (aucun passage du document au-dessus du cosinus 0,3). Pour ce contrôle : répartition simulée
// (forme seule, comme le vrai modèle sur cette demande) et requêtes d'une seule entrée rapprochées du document.
const VECTEUR_DOC: number[] = [];
CP.create = async function (body: any) {
  const t = JSON.stringify(body.messages || []);
  const sys = String(body.messages?.[0]?.content || '');
  stats.appels++;
  if (/Tu répartis une demande particulière/.test(sys)) {
    return { choices: [{ message: { content: JSON.stringify({ forme: 'Terminer chaque partie par un court paragraphe « En résumé » qui reprend les engagements.', points: [] }) } }], usage: {}, model: body.model };
  }
  if (t.includes('ZORGLUB7731') || t.includes('Kaninor')) { stats.avecDocument++; stats.libelles.push(sys.slice(0, 60)); }
  if (t.includes('En résumé')) { stats.avecForme++; (stats as any).formePar = [...((stats as any).formePar || []), sys.slice(0, 60)]; }
  return c0.call(this, body);
};
const e0 = EP.create;
EP.create = async function (body: any) {
  const t = JSON.stringify(body.input || '');
  const r = await e0.call(this, body);
  if (t.includes('ZORGLUB7731')) { stats.libelles.push('embedding du document'); VECTEUR_DOC.splice(0, VECTEUR_DOC.length, ...r.data[0].embedding); }
  else if (VECTEUR_DOC.length && (Array.isArray(body.input) ? body.input.length : 1) === 1) {
    r.data[0].embedding = r.data[0].embedding.map((x: number, i: number) => x + VECTEUR_DOC[i]);
  }
  return r;
};

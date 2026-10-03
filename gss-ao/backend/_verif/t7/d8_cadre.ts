// Copie du harnais du vérificateur du tour 7 (T7N-2).
// Harnais hors ligne (aucun appel OpenAI) : choix de GSS sur une phrase adaptée (D8) dans l'assistant du CADRE.
// Usage : npx ts-node --transpile-only -P tsconfig.json <ce fichier> <dossierId> <n> <choix> [texte]
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import PizZip from 'pizzip';

const [dossierId, n, choix, texte] = process.argv.slice(2);
const cli: any = new OpenAI({ apiKey: 'hors-ligne' });
const CP = Object.getPrototypeOf(cli.chat.completions);
const appels: string[] = [];
CP.create = async (body: any) => {
  const sys = String(body?.messages?.[0]?.content || '');
  appels.push(sys.slice(0, 80));
  const content = /assistant de modification/.test(sys)
    ? JSON.stringify({ reponse: 'Choix appliqué.', actions: [{ type: 'adaptation', n: Number(n), choix, ...(texte ? { texte } : {}) }] })
    : '{}';
  return { choices: [{ message: { content } }], usage: {}, model: body.model };
};
const EP = Object.getPrototypeOf(cli.embeddings);
EP.create = async (body: any) => ({ data: (Array.isArray(body.input) ? body.input : [body.input]).map((_: any, i: number) => ({ index: i, embedding: new Array(1536).fill(0) })) });

const { discuter } = require(path.resolve('src/generation/assistant_memoire'));
const texteDocx = (f: string) => {
  const x = new PizZip(fs.readFileSync(f)).file('word/document.xml')!.asText();
  return x.split(/<w:p[ >]/).slice(1).map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((m) => m.replace(/<[^>]+>/g, '')).join('')).join('\n')
    .replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"');
};
(async () => {
  const r = await discuter(dossierId, `Rétablis ma phrase d'origine n° ${n}`);
  console.log('REPONSE :', r.reponse);
  console.log('MODIFIES :', r.modifies);
  console.log('APPELS :', appels);
  const t = texteDocx(r.etat.fichier);
  const k = t.search(/Préparation : mobilisation/);
  console.log('MARKDOWN :', /\*\*|\n- /.test(t.slice(Math.max(0, k - 200), k + 600)));
  console.log('EXTRAIT :', JSON.stringify(t.slice(Math.max(0, k - 80), k + 420)));
  const k2 = t.indexOf('Envoi du planning');
  console.log('EXTRAIT2 :', JSON.stringify(t.slice(Math.max(0, k2 - 40), k2 + 420)));
  console.log('ADAPTATIONS :', JSON.stringify(r.etat.adaptations.map((a: any) => ({ n: a.n, statut: a.statut, actuelle: a.actuelle })), null, 0));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });

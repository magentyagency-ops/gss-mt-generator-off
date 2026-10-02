/**
 * Génération RÉELLE via gen.ts (même plafond de dépense, même comptage), avec ENREGISTREMENT de chaque réponse du modèle
 * et de chaque embedding dans <GEN_ENREG> (JSON), pour la rejouer ensuite hors ligne avec _verif/rejouer.ts (aucun
 * appel OpenAI) après une correction du code. L'enregistreur est posé au plus près du SDK, avant le repli Flex de
 * modeles_ia.ts et le compteur de gen.ts.
 * Usage : GEN_ENREG=<fichier.json> npx ts-node --transpile-only -P tsconfig.json _verif/gen_enreg.ts <code corpus> <n°>
 */
import fs from 'fs';
import crypto from 'crypto';
import OpenAI from 'openai';

const FICHIER = process.env.GEN_ENREG;
if (!FICHIER) { console.error('GEN_ENREG manquant'); process.exit(2); }
const enreg: { chat: Record<string, any[]>; emb: Record<string, number[]> } = { chat: {}, emb: {} };
export const cleChat = (body: any) => crypto.createHash('sha1').update(JSON.stringify(body?.messages || [])).digest('hex');
const ecrire = () => { try { fs.writeFileSync(FICHIER, JSON.stringify(enreg)); } catch { /* facultatif */ } };
{
  const cli: any = new OpenAI({ apiKey: 'enregistreur' });
  const CP = Object.getPrototypeOf(cli.chat.completions);
  const EP = Object.getPrototypeOf(cli.embeddings);
  const creerChat = CP.create, creerEmb = EP.create;
  CP.create = function (...args: any[]) {
    const r = creerChat.apply(this, args);
    Promise.resolve(r).then((rep: any) => {
      if (!rep?.choices) return;
      const k = cleChat(args[0]);
      (enreg.chat[k] ||= []).push({ choices: rep.choices, model: rep.model, service_tier: rep.service_tier, usage: rep.usage });
      ecrire();
    }).catch(() => {});
    return r;
  };
  EP.create = function (...args: any[]) {
    const r = creerEmb.apply(this, args);
    Promise.resolve(r).then((rep: any) => {
      const inp: string[] = Array.isArray(args[0]?.input) ? args[0].input : [args[0]?.input];
      (rep?.data || []).forEach((d: any) => { enreg.emb[String(inp[d.index])] = d.embedding; });
      ecrire();
    }).catch(() => {});
    return r;
  };
}
process.on('exit', ecrire);
require('./gen');

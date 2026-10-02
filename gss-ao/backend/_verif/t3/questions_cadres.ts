// T3N-7 : question de recherche des rubriques (questionUtileChamp) de chaque champ des cadres du corpus, comparée à
// l'ancienne (question telle quelle). Aucun appel OpenAI (modèle et embeddings neutralisés). Usage : questions_cadres.ts <code>
import fs from 'fs'; import path from 'path';
import { DB } from '../../src/core/db';
import { MemoireGenerator } from '../../src/generation/memoire_generator';
import { questionUtileChamp, candidatsReference } from '../../src/generation/memoire_type_cadre';
import { preparerMemoireType, publierMemoire } from '../../src/generation/memoire_type';
import { chargerMemoireType, rechercherRubriques } from '../../src/generation/memoire_type';
const code = process.argv[2];
const id = `qc-${code}`;
const ROOT = path.resolve(__dirname, '../../..');
const dceDir = path.join(ROOT, 'data/output', `dce_${id}`);
fs.rmSync(dceDir, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, '_corpus_verif', code), dceDir, { recursive: true });
(DB as any).getDossier = async () => ({ id, dce_files: [] });
(DB as any).saveDossier = async () => null;
const P: any = MemoireGenerator.prototype;
P.materializeDceFromStorage = async () => null;
P.analyzeDce = async () => ({});
P.getGssDocumentation = async () => ({});
P.getGssReferents = async () => '';
P.getGssTotalEffectif = async () => null;
P.perimetreMarche = async () => '';
P.callOpenAI = async () => '{}';
P.embedTexts = async (t: string[]) => t.map(() => []);
const mt = chargerMemoireType();
P.textesMemoireTypeCadre = async (_d: any, _a: any, _c: any, _r: any, descriptors: Array<{ id: number; context: string; kind: string }>) => {
  const textes: Record<string, string> = {};
  for (const p of publierMemoire(preparerMemoireType({ analyse: {}, dce: '' } as any, { memoireType: mt }))) if (p.texte && p.mode !== 'besoin') textes[p.id] = p.texte;
  for (const d of descriptors) {
    if (d.kind === 'checkbox') continue;
    const q = (d.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '';
    const ancienne = `${q.replace(/[\s.:;,…\-—–/|()]+/g, '').length ? q : (((d.context.match(/Contexte(?: proche)?:\s*"([^"]*)"/) || [])[1] || '').split('/').map((s) => s.trim()).filter(Boolean).pop() || '')} ${(d.context.match(/Critère:\s*"([^"]*)"/) || [])[1] || ''}`.trim();
    const nouvelle = questionUtileChamp(d.context);
    if (ancienne !== nouvelle) console.log(`DIFFÉRENT champ ${d.id}\n  avant : ${ancienne.slice(0, 200)}\n  après : ${nouvelle.slice(0, 300)}\n  lexical : ${JSON.stringify(rechercherRubriques(mt, nouvelle, 3))}`);
    else console.log(`IDENTIQUE champ ${d.id}`);
    if (process.env.CANDIDATS) console.log(`CANDIDATS champ ${d.id} : ${candidatsReference(mt, textes, nouvelle, { scores: {} }).map((c) => c.id).join(', ')}${process.env.DETAIL ? ` :: ${nouvelle} :: ${JSON.stringify(rechercherRubriques(mt, nouvelle, 3))}` : ''}`);
  }
  throw new Error('STOP');
};
(async () => {
  try { await new MemoireGenerator().generate(id); } catch (e: any) { if (!/STOP/.test(String(e))) console.log('ERREUR', String(e?.stack || e).slice(0, 600)); }
  fs.rmSync(dceDir, { recursive: true, force: true });
})();

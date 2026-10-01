// SONDE (appel réel, embeddings seulement, coût < 0,001 $) : proximité entre les questions développées des cadres du
// corpus et les rubriques du mémoire type, pour régler le seuil de reprise du texte de référence dans le cadre imposé.
// Usage : sonde_reference_cadre.ts <dossier des fichiers <cadre>.complet.txt> <cadre> [<cadre>…]
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import '../src/core/config';
import { chargerMemoireType } from '../src/generation/memoire_type';
import { signatureRubrique, cosinus } from '../src/generation/memoire_type_cadre';

const [dossier, ...cadres] = process.argv.slice(2);
const mt = chargerMemoireType();
const rubriques = mt.rubriques.filter((r) => r.mode !== 'besoin' && r.texte);
const questions: Array<{ cadre: string; q: string }> = [];
for (const c of cadres) {
  for (const l of fs.readFileSync(path.join(dossier, `${c}.complet.txt`), 'utf-8').split('\n').filter((x) => /^Champ \[CHAMP_\d+\] \[PARAGRAPHE\]/.test(x))) {
    const q = (l.match(/Question:\s*"([^"]*)"/) || [])[1] || '';
    if (q.trim()) questions.push({ cadre: c, q });
  }
}
(async () => {
  const cli = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const entrees = [...rubriques.map(signatureRubrique), ...questions.map((x) => x.q)];
  const r = await cli.embeddings.create({ model: 'text-embedding-3-small', input: entrees });
  console.log(`jetons : ${r.usage?.total_tokens}`);
  const v = r.data.map((d) => d.embedding as number[]);
  const vr = v.slice(0, rubriques.length);
  questions.forEach((x, i) => {
    const vq = v[rubriques.length + i];
    const sc = rubriques.map((rb, k) => ({ id: rb.id, s: cosinus(vq, vr[k]) })).sort((a, b) => b.s - a.s).slice(0, 3);
    console.log(`[${x.cadre}] ${x.q.slice(0, 110)}\n   → ${sc.map((s) => `${s.id} ${s.s.toFixed(3)}`).join(' | ')}`);
  });
})();

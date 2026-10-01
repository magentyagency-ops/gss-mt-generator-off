// Correction 9, bug 1 : sonde du dimensionnement (1 appel « analyse » par DCE), coût mesuré. Usage : <code> [cadre.docx]
import fs from 'fs';
import PizZip from 'pizzip';
import { MemoireGenerator } from '../src/generation/memoire_generator';
import { lignesEquipe, questionDimensionnement, texteDimensionnement } from '../src/generation/dimensionnement';
const [code, cadre] = process.argv.slice(2);
const D = '/private/tmp/claude-501/-Users-stanislastolegano-GSS-Version-Finale/8345a302-25fc-48b3-8606-859ba09681d5/scratchpad/refonte/c9';
const dce = fs.readFileSync(`${D}/dce_${code}.txt`, 'utf-8');
const texteCadre = cadre ? new PizZip(fs.readFileSync(cadre)).file('word/document.xml')!.asText().split(/<w:p[ >]/).map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((m) => m.replace(/<[^>]+>/g, '')).join('')).filter((t) => t.trim()).join('\n') : '';
let entree = 0, sortie = 0;
const OpenAI = require('openai').default || require('openai');
const CP = Object.getPrototypeOf(new OpenAI({ apiKey: 'x' }).chat.completions);
const creer = CP.create;
CP.create = function (...a: any[]) { const r = creer.apply(this, a); Promise.resolve(r).then((x: any) => { entree += x?.usage?.prompt_tokens || 0; sortie += x?.usage?.completion_tokens || 0; }).catch(() => {}); return r; };
(async () => {
  const g: any = new MemoireGenerator(); const appel = g.callOpenAI.bind(g); g.callOpenAI = async (...a: any[]) => { const r = await appel(...a); if (process.env.BRUT) console.log('BRUT', r); return r; };
  const d = await (MemoireGenerator.prototype as any).dimensionner.call(g, dce, texteCadre);
  console.log(JSON.stringify(d, null, 1));
  if (d) { console.log(lignesEquipe(d)); console.log(questionDimensionnement(d)); console.log(texteDimensionnement(d)); }
  console.log(`COÛT ${((entree * 0.10 + sortie * 0.50) / 1e6).toFixed(4)} $ (${entree} entrée, ${sortie} sortie)`);
  process.exit(0);
})();

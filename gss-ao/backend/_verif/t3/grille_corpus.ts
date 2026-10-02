// T3-COH-4 : emplacements créés par completerGrilleCandidature dans le dernier cadre rendu de chaque dossier du corpus.
import fs from 'fs'; import path from 'path'; import PizZip from 'pizzip';
import { DOMParser } from '@xmldom/xmldom';
import { completerGrilleCandidature } from '../../src/generation/completion';
const R = path.resolve(__dirname, '../../../_corpus_verif/_resultats');
const derniers = new Map<string, string>();
for (const f of fs.readdirSync(R).filter((x) => x.endsWith('.docx')).sort((a, b) => fs.statSync(path.join(R, a)).mtimeMs - fs.statSync(path.join(R, b)).mtimeMs)) derniers.set(f.replace(/-\d+\.docx$/, ''), f);
for (const [code, f] of derniers) {
  try {
    const doc = new DOMParser().parseFromString(new PizZip(fs.readFileSync(path.join(R, f))).file('word/document.xml')!.asText(), 'text/xml');
    const q = completerGrilleCandidature(doc);
    console.log(`${f} : ${q.length} emplacement(s)${q.length ? ` — ${q[0]}` : ''}`);
  } catch (e: any) { console.log(`${f} : illisible (${e?.message})`); }
}

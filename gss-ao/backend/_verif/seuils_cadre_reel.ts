/**
 * D7 (seuils de conformité) — fidélité des réponses développées RÉELLES du cadre imposé au texte du mémoire type, avant
 * et après recalage (recalerSurReference), SANS AUCUN APPEL OPENAI :
 *  - réponses : textes des signets GSS_CH_n des .docx des générations réelles (_corpus_verif/_resultats) ;
 *  - rubriques reprises par champ : ligne « Mémoire type : … champ n ← rubriques fidélité » du journal de la génération ;
 *  - références : mémoire type publiposté pour le même acheteur (analyse simplifiée, DCE du corpus), en texte brut.
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/seuils_cadre_reel.ts <journaux.json> <sortie.json>
 *   journaux.json : [{ "run": "v-rouen_univ-14", "code": "rouen_univ", "journal": "/chemin/du/log", "client": "…", "grille": false }]
 */
import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import { chargerMemoireType, preparerMemoireType, publierMemoire, type ContexteMarche } from '../src/generation/memoire_type';
import { texteBrut, fideliteReponse, recalerSurReference } from '../src/generation/memoire_type_cadre';
import { phraseContraireAuDce } from '../src/generation/visuels_cadre';

const RACINE = path.resolve(__dirname, '../..');
const RES = path.join(RACINE, '_corpus_verif/_resultats');
const DCE = path.join(RACINE, '_corpus_verif/_dce_textes');
const PERSONNES = path.resolve(__dirname, '../Template/Documentation GSS/Personnes');
const [entree, sortie] = process.argv.slice(2);
const runs: Array<{ run: string; code: string; journal: string; client: string; grille: boolean }> = JSON.parse(fs.readFileSync(entree, 'utf-8'));

/** Texte de chaque signet GSS_CH_n du document (paragraphes séparés par des retours à la ligne). */
function signets(docx: string): Record<number, string> {
  const xml = new PizZip(fs.readFileSync(docx)).file('word/document.xml')!.asText();
  const out: Record<number, string> = {};
  const re = /<w:bookmarkStart w:id="(\d+)" w:name="GSS_CH_(\d+)"\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const fin = xml.indexOf(`<w:bookmarkEnd w:id="${m[1]}"/>`, m.index);
    const bloc = xml.slice(m.index, fin < 0 ? undefined : fin);
    out[Number(m[2])] = bloc.replace(/<\/w:p>/g, '\n').replace(/<w:br\/>/g, '\n').replace(/<w:tab\/>/g, ' ')
      .replace(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g, '\u0001$1\u0002').replace(/<[^>]+>/g, '').replace(/\u0001([^\u0002]*)\u0002/g, '$1')
      .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .split('\n').map((l) => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  return out;
}

const mt = chargerMemoireType();
const referents = fs.existsSync(PERSONNES) ? fs.readFileSync(PERSONNES, 'utf-8') : '';
const lignes: any[] = [];
for (const r of runs) {
  const journal = fs.readFileSync(r.journal, 'utf-8');
  const l = /Mémoire type : \d+ réponse\(s\) développée\(s\) reprise\(s\) \(([^)]*)\)/.exec(journal);
  if (!l) { console.log(`${r.run} : ligne de reprise introuvable`); continue; }
  const dce = fs.readFileSync(path.join(DCE, `${r.code}.txt`), 'utf-8');
  const ctx: ContexteMarche = { analyse: { clientName: r.client }, dce, referents };
  const textes: Record<string, string> = {};
  for (const p of publierMemoire(preparerMemoireType(ctx, { memoireType: mt }))) if (p.texte && p.mode !== 'besoin') textes[p.id] = texteBrut(p.texte);
  const valeurs = signets(path.join(RES, `${r.run}.docx`));
  for (const x of l[1].split(' ; ')) {
    const m = /champ (\d+) ← ([\w+]+) ([\d.]+)/.exec(x);
    if (!m) continue;
    const ids = m[2].split('+');
    const reference = ids.map((id) => textes[id] || '').filter(Boolean).join('\n\n');
    const valeur = valeurs[Number(m[1])] || '';
    if (!reference || !valeur) { console.log(`${r.run} champ ${m[1]} : ${!reference ? 'référence' : 'valeur'} introuvable (${ids.join('+')})`); continue; }
    const rec = recalerSurReference(reference, valeur, { limite: r.grille, exclure: (ph) => phraseContraireAuDce(ph, dce) });
    lignes.push({ run: r.run, champ: Number(m[1]), rubriques: ids, journal: Number(m[3]), avant: +fideliteReponse(reference, valeur, r.grille).toFixed(3),
      apres: +rec.fidelite.toFixed(3), reformulees: rec.reformulees, reinserees: rec.reinserees, ajouts_retires: rec.ajoutsRetires, bribes_retirees: rec.bribesRetirees,
      mots_avant: (valeur.match(/\S+/g) || []).length, mots_apres: (rec.texte.match(/\S+/g) || []).length, valeur, recalee: rec.texte });
  }
}
const stat = (k: 'journal' | 'avant' | 'apres') => {
  const v = lignes.map((x) => x[k]).sort((a, b) => a - b);
  return { min: v[0], mediane: v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2, sous_0_9: v.filter((x) => x < 0.9).length, n: v.length };
};
const bilan = { journal: stat('journal'), avant: stat('avant'), apres: stat('apres'), lignes };
fs.writeFileSync(sortie, JSON.stringify(bilan, null, 1));
for (const x of lignes) console.log(`${x.run} champ ${x.champ} ← ${x.rubriques.join('+')} : journal ${x.journal}, avant ${x.avant}, après ${x.apres} (reformulées ${x.reformulees}, remises ${x.reinserees}, ajouts retirés ${x.ajouts_retires}, bribes ${x.bribes_retirees} ; ${x.mots_avant} → ${x.mots_apres} mots)`);
console.log('journal', JSON.stringify(bilan.journal), '\navant', JSON.stringify(bilan.avant), '\naprès', JSON.stringify(bilan.apres));

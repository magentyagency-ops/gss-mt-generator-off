/**
 * Harnais hors ligne du mémoire type (aucun appel OpenAI) : publipostage sur 3 DCE du corpus avec une analyse
 * simulée, contrôle des schémas « spec » par le moteur Python, sortie lisible et JSON pour _corpus_verif/controle.py.
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/memoire_type_corpus.ts <dossier_de_sortie>
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  chargerMemoireType, preparerMemoireType, publierMemoire, questionsDuPubliposte, type ContexteMarche,
} from '../src/generation/memoire_type';

const RACINE = path.resolve(__dirname, '../..');
const CORPUS = path.join(RACINE, '_corpus_verif/_dce_textes');
const PERSONNES = path.resolve(__dirname, '../Template/Documentation GSS/Personnes');
const MOTEUR = path.resolve(__dirname, '../python/schemas_gss/rendu_schemas.py');
const SORTIE = process.argv[2] || path.join(__dirname, 'sorties_memoire_type');

/** Analyses simulées (forme de analyzeDce), établies à la lecture des CCTP : tests/fixtures/memoire_type_analyses.json. */
const ANALYSES: Record<string, any> = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/memoire_type_analyses.json'), 'utf-8')).analyses;

function main() {
  fs.mkdirSync(SORTIE, { recursive: true });
  const mt = chargerMemoireType();
  const referents = fs.existsSync(PERSONNES) ? fs.readFileSync(PERSONNES, 'utf-8') : '';
  let erreursSchemas = 0;
  for (const code of Object.keys(ANALYSES)) {
    const dce = fs.readFileSync(path.join(CORPUS, `${code}.txt`), 'utf-8');
    const ctx: ContexteMarche = { analyse: ANALYSES[code], dce, referents };
    const prep = preparerMemoireType(ctx, { memoireType: mt });
    const rubriques = publierMemoire(prep);
    const md: string[] = [`# Mémoire type publiposté — ${code}`, '',
      `Indicateurs vrais : ${Object.entries(prep.indicateurs).filter(([, v]) => v).map(([k]) => k).join(', ')}`,
      `Rubriques exclues : ${prep.plan.exclues.map((e) => e.id).join(', ')}`, ''];
    for (const b of prep.plan.blocs) {
      md.push(`## ${b.cle}. ${b.titre}`, '');
      for (const id of b.rubriques) {
        const r = rubriques.find((x) => x.id === id)!;
        md.push(`### ${r.titre}  _(${r.mode}, schéma : ${r.schema ? `${r.schema.source}${r.schema.ref ? ' ' + r.schema.ref : ''}${r.schema.gabarit ? ' ' + r.schema.gabarit : ''}` : 'aucun'})_`, '');
        md.push(r.texte ?? `(rédigé depuis le CCTP) — amorce : ${r.trame || ''}`, '');
      }
    }
    md.push('## Questions à GSS', '', ...questionsDuPubliposte(rubriques).map((q) => `- ${q}`));
    fs.writeFileSync(path.join(SORTIE, `${code}.md`), md.join('\n'));
    // Format attendu par _corpus_verif/controle.py
    const sections: Record<string, string> = {};
    for (const r of rubriques) if (r.texte) sections[r.id] = r.texte;
    fs.writeFileSync(path.join(SORTIE, `mt-${code}.json`), JSON.stringify({ id: `mt-${code}`, code, mode: 'libre', duree_s: 0, sections, elements: [], court: true }, null, 1));
    // Schémas « spec » contrôlés par le moteur (contrôle de fond avec le texte de la rubrique comme source).
    const demandes = rubriques.filter((r) => r.schema?.source === 'spec' && r.texte).map((r) => ({
      id: r.id, gabarit: r.schema!.gabarit, params: r.schema!.params, source: r.texte, titre_section: r.titre,
    }));
    const p = spawnSync('python3', [MOTEUR], { input: JSON.stringify({ mode: 'rendre', schemas: demandes }), encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
    const res = JSON.parse(p.stdout || '{"resultats":[]}').resultats as Array<{ id: string; ok: boolean; erreurs?: string[]; svg?: string }>;
    const ko = res.filter((x) => !x.ok);
    erreursSchemas += ko.length;
    for (const x of res.filter((y) => y.ok)) fs.writeFileSync(path.join(SORTIE, `${code}-${x.id}.svg`), x.svg || '');
    console.log(`${code} : ${rubriques.length} rubriques, ${prep.plan.exclues.length} exclues, schémas spec ${res.length - ko.length}/${res.length} valides, ${questionsDuPubliposte(rubriques).length} questions`);
    for (const x of ko) console.log(`   ✗ ${x.id} : ${(x.erreurs || []).join(' | ')}`);
  }
  console.log(erreursSchemas ? `${erreursSchemas} schéma(s) refusé(s) par le moteur` : 'Tous les schémas « spec » sont acceptés par le moteur.');
}

main();

/**
 * RECOMPOSITION PAR L'ASSISTANT ET THÈME (hors ligne, aucun appel OpenAI : construction des schémas neutralisée).
 * recomposerPdf (completion.ts) → rendreDepuisSections (memoire_generator.ts) → generatePdf (marp_generator.ts) :
 *  · un état écrit avant les thèmes (sans « theme ») est recomposé dans le rendu d'origine « gss-2026-09 » ;
 *  · un état « marine » est recomposé en marine, même si GSS_THEME désigne un autre style ;
 *  · format court : même règle.
 * Contrôle : polices embarquées dans le PDF (Inter/Outfit/Lexend pour l'origine, IBM Plex Sans pour marine).
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/themes_recomposition.ts <dossier_de_sortie>
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { recomposerPdf, EtatCompletion } from '../src/generation/completion';
import { SchemaService } from '../src/generation/schema_service';

const SORTIE = path.resolve(process.argv[2] || path.join(__dirname, 'sorties_themes_recomposition'));
process.env.GSS_THEME = 'graphite';   // le thème de l'environnement ne doit pas s'appliquer à un mémoire déjà rendu
(SchemaService.prototype as any).construireUne = async () => null;

const polices = (pdf: string) => [...new Set((spawnSync('pdffonts', [pdf], { encoding: 'utf-8' }).stdout || '').split('\n').slice(2)
  .map((l) => l.split(/\s+/)[0]).filter(Boolean).map((n) => n.replace(/^[A-Z]{6}\+/, '').split('-')[0]))];

async function main() {
  fs.mkdirSync(SORTIE, { recursive: true });
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'themes_fixtures.json'), 'utf-8'));
  const sections: Record<string, string> = {};
  for (const ch of fx.chapters) for (const s of ch.sections) sections[s.id] = s.text;
  const etat = (theme?: string, court = false): EtatCompletion => ({
    dossierId: `verif-themes-${theme || 'avant'}${court ? '-court' : ''}`, mode: 'libre', fichier: '', majLe: '', elements: [], reponsesTraitees: [],
    libre: {
      sections: court ? { c1: fx.parties_court[0].texte, c2: fx.parties_court[1].texte } : sections, schemas: {}, cover: fx.cover,
      ...(court ? { court: { pagesMax: 3, plan: [{ id: 'c1', title: fx.parties_court[0].titre }, { id: 'c2', title: fx.parties_court[1].titre }] } } : {}),
      ...(theme ? { theme } : {}),
    },
  });
  const bilan: Record<string, any> = { GSS_THEME: process.env.GSS_THEME };
  for (const [nom, e] of [['avant_les_themes', etat()], ['marine', etat('marine')], ['court_avant_les_themes', etat(undefined, true)], ['court_marine', etat('marine', true)]] as const) {
    const pdf = await recomposerPdf(e as EtatCompletion);
    const dest = path.join(SORTIE, `${nom}.pdf`);
    fs.renameSync(pdf, dest);
    bilan[nom] = { polices: polices(dest), schemas_conserves: Object.keys((e as EtatCompletion).libre!.schemas || {}).length };
  }
  fs.writeFileSync(path.join(SORTIE, 'bilan_recomposition.json'), JSON.stringify(bilan, null, 1));
  console.log(JSON.stringify(bilan, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });

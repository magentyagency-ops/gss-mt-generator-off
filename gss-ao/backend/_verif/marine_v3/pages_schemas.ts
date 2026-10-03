/**
 * Marine v3 : pages de schéma rendues comme dans le générateur (Marp, feuille du style, page « 1 schéma = 1 page »), pour
 * comparer un style à la planche validée. Schémas de la bibliothèque (moteur Python du style) et SVG déjà dessinés
 * (dossier, ex. P26 et P27). Usage : npx ts-node --transpile-only -P tsconfig.json _verif/marine_v3/pages_schemas.ts
 *   <style> <sortie.pdf> <dossier de SVG ou -> <id|titre|surtitre|bloc|titre du bloc> …
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { feuilleMarp, imagesTheme, schemasBibliotheque, pagesMarineV3 } from '../../src/generation/themes';
import { enteteBloc, surtitre, memesTitres, styleParcours } from '../../src/generation/marp_pages_marine';
import { styleDuTheme } from '../../src/generation/themes';

const [theme, sortie, dossier, ...pages] = process.argv.slice(2);
const B = path.resolve(__dirname, '../..');
const MARP = path.join(B, 'src/generation/marp');
const items = pages.map((p) => { const [id, titre, sur, bloc, titreBloc] = p.split('|'); return { id, titre, sur, bloc: +bloc, titreBloc }; });
const biblio = schemasBibliotheque(items.filter((x) => !(dossier !== '-' && fs.existsSync(path.join(dossier, `${x.id}.svg`)))).map((x) => x.id), 'page', theme);
const v3 = pagesMarineV3(theme);
const st = styleDuTheme(theme);
const corps = items.map((x) => {
  let svg = dossier !== '-' && fs.existsSync(path.join(dossier, `${x.id}.svg`)) ? fs.readFileSync(path.join(dossier, `${x.id}.svg`), 'utf-8') : biblio.get(x.id)!;
  svg = svg.replace(/(<svg\b[^>]*?) width="[\d.]+" height="[\d.]+"/, '$1 width="100%" preserveAspectRatio="xMidYMid meet"').replace(/\s*\n\s*/g, ' ');
  return ['---', v3 ? `<!-- _class: schema bloc-${x.bloc} -->` : '<!-- _class: schema -->', v3 ? enteteBloc(x.bloc, x.titreBloc) : `<!-- header: "${x.sur.toUpperCase()}" -->`, '',
    ...(v3 ? [memesTitres(x.sur, x.titre) ? '<div class="gss-sur gss-sur-vide"></div>' : surtitre(x.sur), ''] : []),
    `## ${x.titre}`, '', '<div class="schema-page">', svg, '</div>', ''].join('\n');
});
const tete = ['---', 'marp: true', 'theme: gss', 'size: a4', 'paginate: true', "header: 'GLOBAL SECURITY SERVICES'",
  ...(v3 ? ["footer: 'Mémoire technique · Centre Henri Becquerel'"] : []), '---', '',
  ...(v3 ? [styleParcours(5, st.couleurs.structure_2, st.couleurs.accent), ''] : [])].join('\n');
const travail = fs.mkdtempSync('/tmp/gss-pages-');
fs.writeFileSync(path.join(travail, 'gss-theme.css'), feuilleMarp(theme, fs.readFileSync(path.join(MARP, 'gss-theme.css'), 'utf-8')));
for (const f of [path.join(MARP, 'logogss.png'), ...imagesTheme(theme)]) fs.copyFileSync(f, path.join(travail, path.basename(f)));
fs.writeFileSync(path.join(travail, 'm.md'), `${tete}\n${corps.join('\n').replace(/^---\n/, '')}`);
execSync(`"${path.join(B, 'node_modules/.bin/marp')}" m.md --theme gss-theme.css --html --allow-local-files --pdf -o "${sortie}" --no-stdin`, { cwd: travail, stdio: 'pipe', timeout: 300000 });
fs.rmSync(travail, { recursive: true, force: true });
console.log(sortie);

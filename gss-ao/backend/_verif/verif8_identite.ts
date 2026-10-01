/**
 * NON-RÉGRESSION DU THÈME DE RETOUR ARRIÈRE « gss-2026-09 » (hors ligne, aucun appel OpenAI).
 * Compare, sur des entrées de référence, les modules d'AVANT les thèmes (commit de départ, copiés dans
 * _verif/themes_avant avec leurs chemins d'import vers src) et les modules actuels avec GSS_THEME=gss-2026-09 :
 *  1. réponse libre : Markdown Marp identique, PDF rendu par Marp + Chromium identique au pixel près ;
 *  2. format court : HTML identique, PDF identique au pixel près ;
 *  3. cadre imposé : schémas choisis identiques, images PNG insérées identiques ;
 *  4. schémas de secours de la bibliothèque (SchemaService) identiques.
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/themes_identite.ts <dossier_de_sortie> [commit]
 */
import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import PizZip from 'pizzip';
import { DOMParser } from '@xmldom/xmldom';

process.env.GSS_THEME = 'gss-2026-09';
const SORTIE = path.resolve(process.argv[2] || path.join(__dirname, 'sorties_themes_identite'));
const COMMIT = process.argv[3] || '8c2c7c7';
const RACINE_GIT = path.resolve(__dirname, '../..', '..');
const AVANT = path.join(__dirname, 'verif8_avant');

// ── Modules d'avant les thèmes ──────────────────────────────────────────────────────────────
function preparerAvant(): void {
  fs.rmSync(AVANT, { recursive: true, force: true });
  fs.mkdirSync(AVANT, { recursive: true });
  const imports: Array<[RegExp, string]> = [
    [/from '\.\/image_service'/g, "from '../../src/generation/image_service'"],
    [/from '\.\/d2_service'/g, "from '../../src/generation/d2_service'"],
    [/from '\.\/base_memoires'/g, "from '../../src/generation/base_memoires'"],
    [/from '\.\/docx_images'/g, "from '../../src/generation/docx_images'"],
    [/from '\.\.\/core\/config'/g, "from '../../src/core/config'"],
    [/from '\.\.\/core\/modeles_ia'/g, "from '../../src/core/modeles_ia'"],
  ];
  for (const f of ['marp_generator.ts', 'organigramme.ts', 'format_court.ts', 'visuels_cadre.ts', 'schema_service.ts']) {
    let src = execSync(`git -C "${RACINE_GIT}" show ${COMMIT}:gss-ao/backend/src/generation/${f}`, { encoding: 'utf-8', maxBuffer: 64 << 20 });
    for (const [re, rep] of imports) src = src.replace(re, rep);
    fs.writeFileSync(path.join(AVANT, f), src);
  }
  // Ressources Marp (logo, CSS d'origine du commit) : dossier propre, la feuille est celle d'avant les thèmes.
  const marp = path.join(AVANT, 'marp');
  fs.mkdirSync(marp);
  fs.writeFileSync(path.join(marp, 'gss-theme.css'), execSync(`git -C "${RACINE_GIT}" show ${COMMIT}:gss-ao/backend/src/generation/marp/gss-theme.css`, { encoding: 'utf-8' }));
  const src = path.resolve(__dirname, '../src/generation/marp');
  for (const f of ['logogss.png', 'gss_memoire_master.md']) fs.copyFileSync(path.join(src, f), path.join(marp, f));
  fs.symlinkSync(path.join(src, 'media'), path.join(marp, 'media'));
}

// ── Comparaison de PDF au pixel près (pdftoppm + Python/Pillow) ─────────────────────────────
function comparerPdf(a: string, b: string, nom: string): any {
  const d = path.join(SORTIE, `png_${nom}`);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  execSync(`pdftoppm -r 100 -png "${a}" "${d}/a"`);
  execSync(`pdftoppm -r 100 -png "${b}" "${d}/b"`);
  const py = `
import glob, json, sys
from PIL import Image, ImageChops
d = sys.argv[1]
A = sorted(glob.glob(d + "/a-*.png")); B = sorted(glob.glob(d + "/b-*.png"))
diff = []
for x, y in zip(A, B):
    ia, ib = Image.open(x).convert("RGB"), Image.open(y).convert("RGB")
    if ia.size != ib.size or ImageChops.difference(ia, ib).getbbox():
        diff.append(x.split("-")[-1])
print(json.dumps({"pages": [len(A), len(B)], "pages_differentes": diff}))`;
  const r = spawnSync('python3', ['-c', py, d], { encoding: 'utf-8' });
  return JSON.parse(r.stdout);
}

function docxMinimal(): { zip: PizZip; xmlDoc: any } {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const para = (cle: string, t: string) => `<w:p><w:bookmarkStart w:id="${cle.length}" w:name="${cle}"/><w:r><w:t>${t}</w:t></w:r><w:bookmarkEnd w:id="${cle.length}"/></w:p>`;
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body>${para('GSS_CH_1', 'Rondes')}${para('GSS_CH_2', 'Encadrement')}<w:sectPr/></w:body></w:document>`;
  zip.file('word/document.xml', xml);
  return { zip, xmlDoc: new DOMParser().parseFromString(xml, 'text/xml') };
}

async function main() {
  fs.mkdirSync(SORTIE, { recursive: true });
  preparerAvant();
  const bilan: Record<string, any> = { commit_reference: COMMIT, theme: process.env.GSS_THEME };
  const avant = {
    marp: require(path.join(AVANT, 'marp_generator.ts')),
    court: require(path.join(AVANT, 'format_court.ts')),
    cadre: require(path.join(AVANT, 'visuels_cadre.ts')),
    schemas: require(path.join(AVANT, 'schema_service.ts')),
    organigramme: require(path.join(AVANT, 'organigramme.ts')),
  };
  const apres = {
    marp: require('../src/generation/marp_generator'),
    court: require('../src/generation/format_court'),
    cadre: require('../src/generation/visuels_cadre'),
    schemas: require('../src/generation/schema_service'),
    organigramme: require('../src/generation/organigramme'),
  };
  const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'themes_fixtures.json'), 'utf-8'));

  // 4. Schémas de secours de la bibliothèque (aucun appel au modèle : construction neutralisée).
  for (const m of [avant.schemas, apres.schemas]) (m.SchemaService.prototype as any).construireUne = async () => null;
  const pages = fixtures.pages as Array<{ key: string; sectionId: string; sectionTitle: string; text: string }>;
  const sa: Map<string, string> = await new avant.schemas.SchemaService().construirePourPages(pages);
  const sb: Map<string, string> = await new apres.schemas.SchemaService().construirePourPages(pages);
  bilan.schemas_secours = { nb: [sa.size, sb.size], identiques: sa.size === sb.size && [...sa].every(([k, v]) => sb.get(k) === v) };

  // 1. Réponse libre : Markdown et PDF.
  const referents = fixtures.referents as string;
  avant.organigramme.actualiserOrganigramme(referents);
  apres.organigramme.actualiserOrganigramme(referents);
  const chapters = fixtures.chapters;
  const cover = fixtures.cover;
  const ga = new avant.marp.MarpGenerator(path.join(SORTIE, 'avant'));
  const gb = new apres.marp.MarpGenerator(path.join(SORTIE, 'apres'));
  const ma: string = (ga as any).buildMarkdown(chapters, cover, new Map(), sa);
  const mb: string = (gb as any).buildMarkdown(chapters, cover, new Map(), sb, 'gss-2026-09');
  bilan.libre_markdown = { octets: [ma.length, mb.length], identique: ma === mb };
  const pa = await ga.generatePdf(JSON.parse(JSON.stringify(chapters)), cover, new Map(), sa);
  const pb = await gb.generatePdf(JSON.parse(JSON.stringify(chapters)), cover, new Map(), sb, { theme: 'gss-2026-09' });
  bilan.libre_pdf = comparerPdf(pa.filePath, pb.filePath, 'libre');

  // 3. Cadre imposé : choix des schémas et images insérées.
  const reponses = fixtures.reponses_cadre;
  const ca = avant.cadre.choisir(reponses);
  const cb = apres.cadre.choisir(reponses);
  bilan.cadre_choix = { ids: [ca.map((c: any) => c.id), cb.map((c: any) => c.id)], identiques: JSON.stringify(ca) === JSON.stringify(cb) };
  const da = docxMinimal(); const db = docxMinimal();
  const na = await avant.cadre.insererSchemasReponses(da.zip, da.xmlDoc, reponses);
  const nb = await apres.cadre.insererSchemasReponses(db.zip, db.xmlDoc, reponses);
  const images = (z: PizZip) => Object.keys(z.files).filter((f) => f.startsWith('word/media/')).sort().map((f) => z.file(f)!.asNodeBuffer());
  const ia = images(da.zip), ib = images(db.zip);
  bilan.cadre_images = { inserees: [na, nb], identiques: ia.length === ib.length && ia.every((x, i) => x.equals(ib[i])) };
  ia.forEach((x, i) => fs.writeFileSync(path.join(SORTIE, `cadre_avant_${i}.png`), x));
  ib.forEach((x, i) => fs.writeFileSync(path.join(SORTIE, `cadre_apres_${i}.png`), x));

  // 2. Format court : HTML et PDF (schémas : ceux du cadre, choisis comme dans genererFormatCourt).
  const htmls: string[] = [];
  const ecrire = fs.writeFileSync;
  (fs as any).writeFileSync = function (f: any, data: any, ...r: any[]) {
    if (String(f).endsWith('memoire.html')) htmls.push(String(data));
    return (ecrire as any).call(fs, f, data, ...r);
  };
  const parties = fixtures.parties_court.map((p: any, i: number) => ({ ...p, schema: i < ca.length ? ca[i].svg.replace(/\s*\n\s*/g, ' ') : undefined }));
  const partiesB = fixtures.parties_court.map((p: any, i: number) => ({ ...p, schema: i < cb.length ? cb[i].svg.replace(/\s*\n\s*/g, ' ') : undefined }));
  const ra = await avant.court.rendreFormatCourt(parties, fixtures.cover, 3, path.join(SORTIE, 'avant'));
  const ha = htmls.slice();
  htmls.length = 0;
  const rb = await apres.court.rendreFormatCourt(partiesB, fixtures.cover, 3, path.join(SORTIE, 'apres'), 'gss-2026-09');
  (fs as any).writeFileSync = ecrire;
  // Seul écart attendu : le chemin du logo (copie des ressources d'avant dans _verif/themes_avant/marp).
  const logo = (h: string) => h.split(path.join(AVANT, 'marp')).join(path.resolve(__dirname, '../src/generation/marp'));
  fs.writeFileSync(path.join(SORTIE,'court_avant.html'), logo(ha[0]||'')); fs.writeFileSync(path.join(SORTIE,'court_apres.html'), htmls[0]||'');
  bilan.court_html = { essais: [ha.length, htmls.length], identiques: ha.length === htmls.length && ha.every((h, i) => logo(h) === htmls[i]) };
  bilan.court_pdf = { pages: [ra.pages, rb.pages], corps: [ra.corps, rb.corps], ...comparerPdf(ra.filePath, rb.filePath, 'court') };

  fs.writeFileSync(path.join(SORTIE, 'bilan_identite.json'), JSON.stringify(bilan, null, 1));
  console.log(JSON.stringify(bilan, null, 1));
  fs.rmSync(AVANT, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });

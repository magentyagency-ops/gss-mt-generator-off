/**
 * RENDU DANS LE THÈME ACTIF (par défaut « marine ») — hors ligne, aucun appel OpenAI :
 *  1. mémoire de test « 1 à 2 pages de texte, puis 1 page de schéma » (mémoire type publiposté sur le DCE Becquerel) :
 *     couverture, sommaire, ouvertures de bloc, pages de texte, pages de schéma (bibliothèque redessinée au format page,
 *     schémas « spec » dessinés par le moteur, organigramme au format page) → PDF Marp + Chromium ;
 *  2. ancienne mise en page (un schéma sous chaque page de texte) dans le thème → PDF ;
 *  3. format court → PDF ;  4. cadre imposé : images des schémas insérées dans le .docx → PNG ;
 *  5. contrôles : feuille du thème (variables, polices embarquées, aucune police chargée par le réseau), polices
 *     embarquées dans les PDF, aucune couleur de l'ancienne palette dans les schémas, hauteur de chaque schéma pleine
 *     page ≥ 70 % de la page et aucun débordement de page (mesures dans le HTML rendu par Marp).
 * Le bloc 1 (« Notre compréhension de votre besoin », rédigé par le modèle en génération réelle) reprend la maquette
 * illustrative de l'agent design (CCTP Becquerel), seulement pour montrer la mise en page.
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/themes_rendu.ts <dossier_de_sortie> [nombre de rubriques par bloc]
 */
import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import PizZip from 'pizzip';
import { DOMParser } from '@xmldom/xmldom';
import { MarpGenerator, AssembleChapter } from '../src/generation/marp_generator';
import { themeActif, feuilleMarp, schemasBibliotheque, imagesTheme, estRetourArriere } from '../src/generation/themes';
import { actualiserOrganigramme, organigrammeSvg } from '../src/generation/organigramme';
import { SchemaService, finaliserSvg } from '../src/generation/schema_service';
import { rendreFormatCourt } from '../src/generation/format_court';
import { choisir, insererSchemasReponses } from '../src/generation/visuels_cadre';

const SORTIE = path.resolve(process.argv[2] || path.join(__dirname, 'sorties_themes_rendu'));
const PAR_BLOC = Number(process.argv[3] || 4);
const MOTEUR = path.resolve(__dirname, '../python/schemas_gss');
const MARP_DIR = path.resolve(__dirname, '../src/generation/marp');
const theme = themeActif();
const ROMAIN = ['I', 'II', 'III', 'IV', 'V'];
const ANCIENNE_PALETTE = ['#D9D9D9', '#463A2F', '#FBFAF4', '#484545', '#ECDEC2', '#6298C0', '#B8CCB1', '#E78E83', '#F0D3A3', '#E5CA97', '#7A726F', '#9A928E', '#8A7550', '#1D49A7', '#377E3F', '#DD4E49', '#E99842'];

/** Identifiants préfixés, largeur fluide : la finalisation du service de schémas (format page compris). */
const finaliser = finaliserSvg;

function rendreSpecs(specs: any[], format: 'page' | 'paysage'): Map<string, { ok: boolean; svg?: string; erreurs?: string[] }> {
  const r = spawnSync('python3', [path.join(MOTEUR, 'rendu_schemas.py')], {
    input: JSON.stringify({ mode: 'rendre', format, schemas: specs }), encoding: 'utf-8', maxBuffer: 256 << 20,
    env: { ...process.env, GSS_THEME: theme },
  });
  const out = new Map<string, any>();
  for (const x of JSON.parse(r.stdout || '{"resultats":[]}').resultats) out.set(x.id, x);
  return out;
}

const couleursAnciennes = (svg: string) => ANCIENNE_PALETTE.filter((c) => svg.toUpperCase().includes(`"${c}"`));

/** Rendu HTML par Marp (même feuille que le PDF) et mesures dans Chromium. */
async function mesurerHtml(markdown: string): Promise<any> {
  const travail = path.join(SORTIE, 'html_marp');
  fs.rmSync(travail, { recursive: true, force: true });
  fs.mkdirSync(travail, { recursive: true });
  fs.writeFileSync(path.join(travail, 'gss-theme.css'), estRetourArriere(theme)
    ? fs.readFileSync(path.join(MARP_DIR, 'gss-theme.css'), 'utf-8')
    : feuilleMarp(theme, fs.readFileSync(path.join(MARP_DIR, 'gss-theme.css'), 'utf-8')));
  for (const f of [path.join(MARP_DIR, 'logogss.png'), ...imagesTheme(theme)]) fs.copyFileSync(f, path.join(travail, path.basename(f)));
  fs.symlinkSync(path.join(MARP_DIR, 'media'), path.join(travail, 'media'));
  fs.writeFileSync(path.join(travail, 'm.md'), markdown);
  execSync(`"${path.resolve(__dirname, '../node_modules/.bin/marp')}" m.md --theme gss-theme.css --html --allow-local-files -o m.html --no-stdin`, { cwd: travail, stdio: 'pipe' });
  const puppeteer = require('puppeteer');
  const nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  try {
    const page = await nav.newPage();
    await page.setViewport({ width: 1100, height: 1500 });
    await page.goto(`file://${path.join(travail, 'm.html')}`, { waitUntil: 'load' });
    await page.evaluate('document.fonts.ready');
    return await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('section')) as HTMLElement[];
      const res: any = { pages: sections.length, schemas: [] as any[], debordements: [] as any[], polices: [] as string[] };
      sections.forEach((s, i) => {
        const r = s.getBoundingClientRect();
        const svg = s.querySelector('.schema-page svg') as SVGElement | null;
        if (svg && s.classList.contains('schema')) {
          const b = svg.getBoundingClientRect();
          res.schemas.push({ page: i + 1, hauteur_page: +(b.height / r.height).toFixed(3), largeur: +(b.width / r.width).toFixed(3), bas_dans_page: b.bottom <= r.bottom + 0.5 });
        }
        // Contenu de la page (hors en-tête et pied) : rien ne doit dépasser la zone utile.
        const cs = getComputedStyle(s);
        const bas = r.bottom - parseFloat(cs.paddingBottom) * (r.height / s.offsetHeight) + 2;
        let max = 0;
        s.querySelectorAll(':scope > *:not(header):not(footer)').forEach((e) => { max = Math.max(max, (e as HTMLElement).getBoundingClientRect().bottom); });
        if (max > bas) res.debordements.push({ page: i + 1, classe: s.className, depassement_px: +(max - bas).toFixed(1) });
      });
      res.polices = Array.from((document as any).fonts).filter((f: any) => f.status === 'loaded').map((f: any) => `${f.family} ${f.weight}`);
      return res;
    });
  } finally {
    await nav.close();
  }
}

function pdfEnPng(pdf: string, nom: string, dpi = 50): string {
  const d = path.join(SORTIE, `png_${nom}`);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  execSync(`pdftoppm -r ${dpi} -png "${pdf}" "${d}/p"`);
  return d;
}

function policesPdf(pdf: string): string[] {
  const r = spawnSync('pdffonts', [pdf], { encoding: 'utf-8' });
  return [...new Set((r.stdout || '').split('\n').slice(2).map((l) => l.split(/\s+/)[0]).filter(Boolean).map((n) => n.replace(/^[A-Z]{6}\+/, '')))];
}

async function main() {
  fs.mkdirSync(SORTIE, { recursive: true });
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'themes_fixtures.json'), 'utf-8'));
  const bilan: Record<string, any> = { theme, rubriques_par_bloc: PAR_BLOC };
  actualiserOrganigramme(fx.referents);

  // ── 1. Mémoire de test : 1 à 2 pages de texte, puis 1 page de schéma ──
  const chapters: AssembleChapter[] = [];
  const schemasContoles: Array<{ id: string; source: string; anciennes_couleurs: string[]; ok: boolean; erreurs?: string[] }> = [];
  const maquette = JSON.parse(fs.readFileSync(path.join(__dirname, 'themes_maquette_bloc1.json'), 'utf-8'));
  for (const [i, b] of fx.blocs.entries()) {
    let rubs = (b.rubriques as any[]);
    if (!rubs.length && i === 0) rubs = [maquette.rubrique];
    // Un échantillon de chaque bloc : toutes les sources de schéma (bibliothèque, spécification, organigramme, process).
    const ech: any[] = [];
    for (const src of ['organigramme', 'process_besoin', 'spec', 'bibliotheque']) {
      for (const r of rubs.filter((x) => x.schema?.source === src)) if (ech.length < PAR_BLOC && !ech.includes(r)) { ech.push(r); break; }
    }
    for (const r of rubs) if (ech.length < PAR_BLOC && !ech.includes(r) && r.schema) ech.push(r);
    const specs = ech.filter((r) => r.schema?.source === 'spec' || r.schema?.source === 'process_besoin')
      .map((r) => ({ id: r.id, gabarit: r.schema.gabarit, params: r.schema.params, source: r.texte, titre_section: r.titre }));
    const rendus = rendreSpecs(specs, 'page');
    const biblio = schemasBibliotheque(ech.filter((r) => r.schema?.source === 'bibliotheque').map((r) => r.schema.ref), 'page', theme);
    const sections = ech.map((r) => {
      let svg: string | undefined;
      const s = r.schema;
      if (s?.source === 'bibliotheque' && biblio.get(s.ref)) svg = finaliser(biblio.get(s.ref)!, `b${r.id}`);
      else if (s?.source === 'organigramme') { const o = organigrammeSvg('page', theme); if (o) svg = finaliser(o, `o${r.id}`); }
      else if (rendus.get(r.id)?.ok) svg = rendus.get(r.id)!.svg;
      schemasContoles.push({ id: r.id, source: s?.source, anciennes_couleurs: svg ? couleursAnciennes(svg) : [], ok: !!svg, erreurs: svg ? undefined : rendus.get(r.id)?.erreurs });
      return { id: r.id, title: r.titre, text: r.texte, ...(svg ? { schemaPleinePage: { titre: s?.titre || r.titre, svg } } : {}) };
    });
    chapters.push({ key: ROMAIN[i], title: b.titre, sections });
  }
  bilan.memoire_schemas = { total: schemasContoles.length, dessines: schemasContoles.filter((s) => s.ok).length, refus: schemasContoles.filter((s) => !s.ok), anciennes_couleurs: schemasContoles.filter((s) => s.anciennes_couleurs.length) };
  const gen = new MarpGenerator(SORTIE);
  const md: string = (gen as any).buildMarkdown(chapters, fx.cover, new Map(), new Map(), theme);
  fs.writeFileSync(path.join(SORTIE, 'memoire_test.md'), md);
  const pdf = await gen.generatePdf(chapters, fx.cover, new Map(), new Map(), { theme });
  fs.renameSync(pdf.filePath, path.join(SORTIE, 'memoire_test.pdf'));
  bilan.memoire_pdf = { fichier: path.join(SORTIE, 'memoire_test.pdf'), polices_embarquees: policesPdf(path.join(SORTIE, 'memoire_test.pdf')), png: pdfEnPng(path.join(SORTIE, 'memoire_test.pdf'), 'memoire') };
  const mes = await mesurerHtml(md);
  bilan.memoire_mesures = { pages: mes.pages, pages_de_schema: mes.schemas.length, hauteur_min: Math.min(...mes.schemas.map((s: any) => s.hauteur_page)),
    sous_70_pourcent: mes.schemas.filter((s: any) => s.hauteur_page < 0.7), debordements: mes.debordements, polices_chargees: mes.polices };
  const css = feuilleMarp(theme, fs.readFileSync(path.join(MARP_DIR, 'gss-theme.css'), 'utf-8'));
  bilan.feuille = { variables: (css.match(/--gss-[a-z-]+:/g) || []).length, polices_embarquees: (css.match(/@font-face\{font-family:'([^']+)'/g) || []).length,
    reseau: /fonts\.googleapis\.com|https?:\/\//.test(css.replace(/url\(data:[^)]*\)/g, '')) };

  // ── 2. Ancienne mise en page (un schéma sous chaque page), dans le thème ──
  (SchemaService.prototype as any).construireUne = async () => null;   // aucun appel au modèle : schémas de secours
  const pages = fx.pages;
  const schemas: Map<string, string> = await new SchemaService().construirePourPages(pages, undefined, { theme });
  bilan.ancienne_mise_en_page = { schemas: schemas.size, anciennes_couleurs: [...schemas.values()].filter((s) => couleursAnciennes(s).length).length };
  const pdf2 = await gen.generatePdf(JSON.parse(JSON.stringify(fx.chapters)), fx.cover, new Map(), schemas, { theme });
  fs.renameSync(pdf2.filePath, path.join(SORTIE, 'ancienne_mise_en_page.pdf'));
  bilan.ancienne_mise_en_page.png = pdfEnPng(path.join(SORTIE, 'ancienne_mise_en_page.pdf'), 'ancienne', 40);
  bilan.ancienne_mise_en_page.polices = policesPdf(path.join(SORTIE, 'ancienne_mise_en_page.pdf'));

  // ── 3. Format court ──
  const choix = choisir(fx.reponses_cadre);
  const parties = fx.parties_court.map((p: any, i: number) => ({ ...p, schema: i < choix.length ? choix[i].svg.replace(/\s*\n\s*/g, ' ') : undefined }));
  const court = await rendreFormatCourt(parties, fx.cover, 3, SORTIE);
  fs.renameSync(court.filePath, path.join(SORTIE, 'format_court.pdf'));
  bilan.format_court = { pages: court.pages, corps: court.corps, schemas_retires: court.schemasRetires, polices: policesPdf(path.join(SORTIE, 'format_court.pdf')),
    anciennes_couleurs: choix.filter((c) => couleursAnciennes(c.svg).length).map((c) => c.id), png: pdfEnPng(path.join(SORTIE, 'format_court.pdf'), 'court', 60) };

  // ── 4. Cadre imposé : images insérées ──
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const para = (cle: string, t: string) => `<w:p><w:bookmarkStart w:id="${cle.length}" w:name="${cle}"/><w:r><w:t>${t}</w:t></w:r><w:bookmarkEnd w:id="${cle.length}"/></w:p>`;
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body>${para('GSS_CH_1', 'Rondes')}${para('GSS_CH_2', 'Encadrement')}<w:sectPr/></w:body></w:document>`;
  zip.file('word/document.xml', xml);
  const n = await insererSchemasReponses(zip, new DOMParser().parseFromString(xml, 'text/xml'), fx.reponses_cadre);
  const images = Object.keys(zip.files).filter((f) => f.startsWith('word/media/')).sort();
  images.forEach((f, i) => fs.writeFileSync(path.join(SORTIE, `cadre_${i}.png`), zip.file(f)!.asNodeBuffer()));
  bilan.cadre = { images: n, fichiers: images.map((_, i) => path.join(SORTIE, `cadre_${i}.png`)) };

  fs.writeFileSync(path.join(SORTIE, 'bilan_rendu.json'), JSON.stringify(bilan, null, 1));
  console.log(JSON.stringify(bilan, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });

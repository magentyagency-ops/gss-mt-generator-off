import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import type { PooledIllustration, SlideContext } from './image_service';
import { D2Service } from './d2_service';
import { organigrammeSvg } from './organigramme';
import { themeActif, estRetourArriere, feuilleMarp, imagesTheme } from './themes';

/** Illustrations attribuées, indexées par clé de slide (unicité globale garantie amont). */
export type SlideAssignments = Map<string, PooledIllustration>;

/** Schémas GSS (SVG sur une ligne, identifiants uniques), indexés par clé de slide : un par page. */
export type SlideSchemas = Map<string, string>;

/** Police Lexend des schémas GSS, embarquée une fois dans le document (mesure du texte identique). */
const LEXEND_PATH = path.resolve(__dirname, '../../python/schemas_gss/polices/Lexend.ttf');
const ORGANIGRAMME_GSS_PATH = path.resolve(__dirname, '../../python/schemas_gss/organigramme_gss.svg');

/** Organigramme GSS en SVG sur une ligne, identifiants préfixés (null si absent). Thème de la refonte : organigramme
 *  au format page (1 schéma = 1 page A4 portrait) ; retour arrière : organigramme d'origine. */
function lireOrganigrammeGss(theme: string = themeActif()): string | null {
  try {
    if (!estRetourArriere(theme)) {
      const svg = organigrammeSvg('page', theme);
      if (svg) {
        return svg
          .replace(/id="([^"]+)"/g, (_m, id) => `id="org-${id}"`)
          .replace(/url\(#([^)]+)\)/g, (_m, id) => `url(#org-${id})`)
          .replace(/(<svg\b[^>]*?) width="[\d.]+" height="[\d.]+"/, '$1 width="100%" preserveAspectRatio="xMidYMid meet"')
          .replace(/\s*\n\s*/g, ' ')
          .trim();
      }
    }
    // Organigramme dessiné d'après l'organigramme GSS de référence (mêmes personnes que le texte).
    return (organigrammeSvg('paysage', theme) ?? fs.readFileSync(ORGANIGRAMME_GSS_PATH, 'utf-8'))
      .replace(/id="([^"]+)"/g, (_m, id) => `id="org-${id}"`)
      .replace(/url\(#([^)]+)\)/g, (_m, id) => `url(#org-${id})`)
      .replace(/width="1200" height="\d+"/, 'width="100%" preserveAspectRatio="xMidYMid meet"')
      .replace(/\s*\n\s*/g, ' ')
      .trim();
  } catch {
    return null;
  }
}

// ─── Constants ───
/** Maximum words per slide body before splitting to a new slide.
 *  Abaissé (vs 220) pour réserver l'espace de l'illustration placée sous le texte. */
const MAX_WORDS_PER_SLIDE = 170;
/** Hauteur de texte maximale par slide, en lignes estimées (≈ 90 caractères par ligne, un
 *  intervalle entre paragraphes compte pour 0,7 ligne). Au-delà, le schéma GSS placé sous le
 *  texte serait repoussé hors de la page : on coupe avant. */
const MAX_LINES_PER_SLIDE = 19;
const CHARS_PER_LINE = 90;
/** Limites d'une page de texte SANS schéma dessous (mise en page « 1 à 2 pages de texte, puis 1 page de schéma ») :
 *  thèmes de la refonte (corps de 10 pt) et thème d'origine (corps de 15 px, marges plus grandes). */
const LIMITES_TEXTE_SEUL = { refonte: { mots: 400, lignes: 40 }, origine: { mots: 280, lignes: 28 } };
/** Path to Marp assets (CSS + logo) bundled with the backend. */
const MARP_ASSETS_DIR = path.resolve(__dirname, 'marp');

// ─── Helpers ───
/**
 * Escape markdown special characters in generated text so Marp renders
 * it as plain paragraphs (the AI sometimes produces raw markdown).
 * We keep line breaks (\n) but strip markdown headings, bold markers, etc.
 */
function cleanTextForMarp(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    // Convertit les sous-titres soulignés que l'IA produit parfois (**<u>Titre</u>**) en vrais
    // titres Markdown niveau 2 → rendus en ROUGE et plus grands par le thème gss.
    .replace(/^\s*\*{0,3}<u>\s*(.+?)\s*<\/u>\*{0,3}\s*$/gim, '## $1')
    // On PRÉSERVE les titres Markdown (##/###) et le gras (**…**) : le thème les met en rouge et
    // en plus grande police. On escape seulement les caractères qui casseraient le rendu Marp.
    .replace(/([\\()[\]{}])/g, '\\$1')
    .trim();
}

/**
 * Split a long text block into chunks of ~MAX_WORDS_PER_SLIDE words,
 * splitting on paragraph boundaries (\n\n) when possible.
 */
function splitIntoSlideChunks(text: string, limites: { mots: number; lignes: number } = { mots: MAX_WORDS_PER_SLIDE, lignes: MAX_LINES_PER_SLIDE }): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const isHeading = (p: string) => /^#{1,6}\s/.test(p);
  const wordCount = (p: string) => p.split(/\s+/).length;
  // Lignes occupées par un paragraphe (chaque retour à la ligne interne compte) + intervalle.
  const lineCount = (p: string) =>
    p.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / CHARS_PER_LINE)), 0) * (isHeading(p) ? 1.5 : 1) + 0.7;

  // Un bloc plus haut qu'une slide (longue liste sans ligne vide) est scindé par groupes de lignes.
  for (let i = 0; i < paragraphs.length; i++) {
    const lignes = paragraphs[i].split('\n');
    if (lignes.length > 1 && lineCount(paragraphs[i]) > limites.lignes) {
      const groupes: string[] = [];
      let g: string[] = [];
      for (const l of lignes) {
        if (g.length && lineCount([...g, l].join('\n')) > limites.lignes) { groupes.push(g.join('\n')); g = []; }
        g.push(l);
      }
      if (g.length) groupes.push(g.join('\n'));
      paragraphs.splice(i, 1, ...groupes);
      i += groupes.length - 1;
    }
  }

  const chunks: string[] = [];
  let current = '';
  let currentWords = 0;
  let currentLines = 0;

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
    currentWords = 0;
    currentLines = 0;
  };

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const paraWords = wordCount(para);

    if (isHeading(para) && current.trim()) {
      // Un titre ne doit JAMAIS rester seul en bas d'une slide : on le garde collé au paragraphe
      // qui le suit. Si le bloc « titre + son 1er paragraphe » ne tient pas sur la slide en cours,
      // on coupe AVANT le titre pour qu'il ouvre la slide suivante avec son contenu.
      const next = paragraphs[i + 1];
      const blockWords = paraWords + (next && !isHeading(next) ? wordCount(next) : 0);
      const blockLines = lineCount(para) + (next && !isHeading(next) ? lineCount(next) : 0);
      if (currentWords + blockWords > limites.mots || currentLines + blockLines > limites.lignes) {
        flush();
      }
    } else if ((currentWords + paraWords > limites.mots || currentLines + lineCount(para) > limites.lignes) && current.trim()) {
      flush();
    }

    current += (current ? '\n\n' : '') + para;
    currentWords += paraWords;
    currentLines += lineCount(para);
  }
  flush();

  return chunks.length > 0 ? chunks : [''];
}

/** Clé stable d'une slide de contenu, partagée entre l'énumération et le rendu. */
function slideKeyOf(chapterIdx: number, sectionIdx: number, chunkIdx: number): string {
  return `${chapterIdx}_${sectionIdx}_${chunkIdx}`;
}

/** Découpage du texte d'une rubrique : pages plus pleines quand son schéma a sa propre page. */
function limitesSection(section: AssembleSection, theme: string): { mots: number; lignes: number } | undefined {
  if (!section.schemaPleinePage) return undefined;
  return estRetourArriere(theme) ? LIMITES_TEXTE_SEUL.origine : LIMITES_TEXTE_SEUL.refonte;
}

/** Titre d'une page de schéma : une ligne, sans balise. */
function titreSchema(t?: string): string {
  return String(t || '').replace(/[\r\n]+/g, ' ').replace(/[<>]/g, '').replace(/^#+\s*/, '').trim();
}

export interface AssembleSection {
  title: string;
  text: string;
  id?: string;
  illustration?: string;
  d2Code?: string;
  d2SvgFileName?: string;
  /** Photos ajoutées à la rubrique avec l'assistant de modification : une page par photo, après le texte. */
  photos?: Array<{ chemin: string; legende?: string }>;
  /**
   * Mise en page « 1 à 2 pages de texte, puis 1 page de schéma » (1 schéma = 1 page, en grand) : le schéma de la
   * rubrique (SVG sur une ligne, identifiants uniques, format page du moteur de schémas) et son titre-message. Les
   * pages de texte de la rubrique n'ont alors plus de schéma dessous.
   */
  schemaPleinePage?: { titre?: string; svg: string };
}

export interface AssembleChapter {
  key: string;
  title: string;
  sections: AssembleSection[];
}

export interface CoverInfo {
  client?: string;
  title?: string;
  ref?: string;
  objet?: string;
}

// ─── Main Generator ───
export class MarpGenerator {
  private outputDir: string;

  constructor(outputDir?: string) {
    const baseDir = path.resolve(__dirname, '../../../../');
    this.outputDir = outputDir || path.resolve(baseDir, 'response');
    if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
  }

  /**
   * Énumère, dans l'ORDRE DE RENDU, toutes les slides de contenu (une par chunk
   * de section) avec leur clé stable. Utilisé en amont pour attribuer les images
   * selon le contexte : `buildMarkdown` recalcule EXACTEMENT les mêmes clés.
   */
  public static enumerateContentSlides(chapters: AssembleChapter[], theme: string = themeActif()): SlideContext[] {
    const slides: SlideContext[] = [];
    chapters.forEach((chapter, ci) => {
      if (!chapter.sections || chapter.sections.length === 0) return;
      chapter.sections.forEach((section, si) => {
        const chunks = splitIntoSlideChunks(cleanTextForMarp(section.text), limitesSection(section, theme));
        chunks.forEach((chunk, k) => {
          slides.push({ key: slideKeyOf(ci, si, k), title: section.title, text: chunk });
        });
      });
    });
    return slides;
  }

  /**
   * Generate a full Marp markdown document from chapters + sections,
   * then render it to PDF using @marp-team/marp-cli.
   * Returns the path to the generated PDF.
   */
  public async generatePdf(
    chapters: AssembleChapter[],
    cover: CoverInfo = {},
    assignments: SlideAssignments = new Map(),
    schemas: SlideSchemas = new Map(),
    opts: { theme?: string } = {},
  ): Promise<{ filePath: string; markdownPath: string }> {
    // Thème de style (themes.ts) : celui du mémoire déjà rendu s'il est fourni, sinon GSS_THEME / style par défaut.
    const theme = themeActif(opts.theme);
    // Write markdown + copy assets to a temp working directory
    const workDir = path.join(this.outputDir, `marp_work_${Date.now()}`);
    fs.mkdirSync(workDir, { recursive: true });

    const cssPath = path.join(workDir, 'gss-theme.css');
    const logoSrc = path.join(MARP_ASSETS_DIR, 'logogss.png');
    const logoDst = path.join(workDir, 'logogss.png');

    // Check if css exists
    const cssSrc = path.join(MARP_ASSETS_DIR, 'gss-theme.css');
    if (fs.existsSync(cssSrc)) {
      if (estRetourArriere(theme)) {
        fs.copyFileSync(cssSrc, cssPath);
      } else {
        // Variables du thème, polices embarquées (aucune dépendance réseau) et mise en page de la refonte.
        fs.writeFileSync(cssPath, feuilleMarp(theme, fs.readFileSync(cssSrc, 'utf-8')), 'utf-8');
        for (const image of imagesTheme(theme)) {
          if (fs.existsSync(image)) fs.copyFileSync(image, path.join(workDir, path.basename(image)));
        }
      }
    } else {
      console.warn(`[MarpGenerator] Warning: CSS file not found at ${cssSrc}`);
    }

    if (fs.existsSync(logoSrc)) {
      fs.copyFileSync(logoSrc, logoDst);
    }

    const mediaSrc = path.join(MARP_ASSETS_DIR, 'media');
    const mediaDst = path.join(workDir, 'media');
    if (fs.existsSync(mediaSrc)) {
      fs.cpSync(mediaSrc, mediaDst, { recursive: true });
    } else {
      fs.mkdirSync(mediaDst, { recursive: true });
    }

    // Traitement et compilation des schémas D2 pour chaque section (doit être fait AVANT buildMarkdown)
    await this.processD2Diagrams(chapters, mediaDst, cover.client || 'Client');

    const markdown = this.buildMarkdown(chapters, cover, assignments, schemas, theme);
    const mdPath = path.join(workDir, 'memoire_template.md');
    fs.writeFileSync(mdPath, markdown, 'utf-8');

    // Écrit dans media/ UNIQUEMENT les images réellement attribuées (unicité déjà
    // garantie en amont) → media/<fileName> référencé par le markdown.
    if (assignments.size > 0) {
      fs.mkdirSync(mediaDst, { recursive: true });
      const written = new Set<string>();
      for (const illus of assignments.values()) {
        if (written.has(illus.fileName)) continue;
        fs.writeFileSync(path.join(mediaDst, illus.fileName), illus.data);
        written.add(illus.fileName);
      }
      // Réduit les images « db_ » à leur taille d'affichage : les images pleine
      // résolution ralentissent énormément (voire bloquent) le rendu Chromium.
      this.downscaleDbImages(mediaDst);
    }

    // Render to PDF via marp-cli
    const pdfName = `Mémoire_Technique_GSS_Template_${Date.now()}.pdf`;
    const pdfPath = path.join(this.outputDir, pdfName);

    console.log(`[MarpGenerator] Rendering PDF with Template: ${mdPath} → ${pdfPath}`);

    // Sous Windows, npx est « npx.cmd » : spawnSync('npx') échoue en ENOENT, et le spawn direct
    // d'un .cmd est désormais bloqué par Node (EINVAL, suite à CVE-2024-27980). On passe donc par
    // le shell sur Windows. Comme shell:true concatène les arguments SANS les échapper, on
    // guillemète les chemins (susceptibles de contenir des espaces).
    const isWin = process.platform === 'win32';
    const q = (p: string) => (isWin ? `"${p}"` : p);

    let chromePath: string | undefined = process.env.CHROME_PATH;
    if (!chromePath) {
      // Utilise le Chromium embarqué par puppeteer (installé via npm install)
      try {
        const puppeteer = require('puppeteer');
        chromePath = puppeteer.executablePath();
        console.log(`[MarpGenerator] Chromium trouvé via puppeteer: ${chromePath}`);
      } catch (e) {
        console.warn('[MarpGenerator] puppeteer non disponible, recherche système…');
      }
    }
    if (!chromePath) {
      // Fallback : chercher dans le système
      try {
        chromePath = require('child_process').execSync('which chromium || which chromium-browser || which google-chrome').toString().trim();
      } catch (e) {
        console.warn('[MarpGenerator] Aucun navigateur trouvé sur le système.');
      }
    }
    console.log(`[MarpGenerator] CHROME_PATH final: ${chromePath || 'NON DÉFINI'}`);

    // Utilise le binaire marp-cli installé localement (en dependencies) au lieu de npx
    const marpBin = path.resolve(__dirname, '../../node_modules/.bin/marp');
    const useMarpBin = !isWin && fs.existsSync(marpBin);
    const cmd = useMarpBin ? marpBin : 'npx';
    const baseArgs = [
      q(mdPath), '--theme', q(cssPath), '--pdf', '-o', q(pdfPath),
      '--allow-local-files', '--html', '--no-stdin',
      '--puppeteer-launch-args', '--no-sandbox --disable-setuid-sandbox --disable-gpu --disable-dev-shm-usage',
    ];
    const args = useMarpBin
      ? baseArgs
      : ['-y', '@marp-team/marp-cli@latest', ...baseArgs];

    const result = spawnSync(
      cmd,
      args,
      {
        cwd: workDir,
        // 15 min max : un mémoire de ~180 pages avec un schéma par page peut dépasser 5 min de rendu
        // (machine chargée, rendus simultanés) — l'ancienne limite faisait échouer la génération à la toute fin.
        timeout: 900_000,
        stdio: 'pipe',
        encoding: 'utf-8',
        shell: isWin,
        // Marp/Puppeteer abandonne la conversion après 30 s par défaut : insuffisant
        // pour un mémoire volumineux illustré d'images (base de données). On aligne
        // ce délai interne sur le timeout du process (cause du « Timed out after 30000ms »).
        env: { 
          ...process.env, 
          PUPPETEER_TIMEOUT: '900000',
          PUPPETEER_PROTOCOL_TIMEOUT: '900000',
          CHROME_PATH: chromePath || '',
        },
      }
    );

    if (result.error) {
      console.error('[MarpGenerator] marp-cli spawn error:', result.error);
      throw new Error(`Marp CLI failed to start: ${result.error.message}`);
    }

    if (result.status !== 0) {
      console.error('[MarpGenerator] marp-cli stderr:', result.stderr);
      throw new Error(`Marp CLI exited with code ${result.status}: ${result.stderr?.slice(0, 500)}`);
    }

    console.log(`[MarpGenerator] PDF generated successfully: ${pdfPath}`);

    // Cleanup work directory (keep only the PDF)
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }

    return { filePath: pdfPath, markdownPath: mdPath };
  }

  /**
   * Scanne et compile tous les schémas D2 des sections en images SVG dans le dossier media.
   * Si la section contient un bloc ```d2 ... ```, il est extrait et compilé.
   */
  private async processD2Diagrams(chapters: AssembleChapter[], mediaDir: string, clientName: string): Promise<void> {
    const promises: Promise<void>[] = [];
    chapters.forEach((chapter, ci) => {
      if (!chapter.sections) return;
      chapter.sections.forEach((section, si) => {
        let d2Code = section.d2Code || '';

        // Extrait du code D2 noyé dans le texte de la section
        if (!d2Code && section.text && section.text.includes('```d2')) {
          const match = section.text.match(/```d2([\s\S]*?)```/);
          if (match) {
            d2Code = match[1].trim();
            section.text = section.text.replace(/```d2[\s\S]*?```/g, '').trim();
          }
        }

        if (!d2Code) return;

        const compilePromise = (async () => {
          try {
            const fileName = `schema_${ci}_${si}.svg`;
            const filePath = path.join(mediaDir, fileName);

            const svgBuffer = await D2Service.compileD2ToSvg(d2Code);
            fs.writeFileSync(filePath, svgBuffer);
            section.d2SvgFileName = fileName;
            console.log(`[MarpGenerator] Schéma D2 compilé avec succès: ${fileName}`);
          } catch (e: any) {
            console.warn(`[MarpGenerator] Échec compilation D2 pour section ${section.title}:`, e.message || e);
          }
        })();
        promises.push(compilePromise);
      });
    });
    await Promise.all(promises);
  }

  /**
   * Réduit (in place) les images « db_ » du dossier media à leur taille
   * d'affichage via Pillow. Étape best-effort : si Python/Pillow est absent ou
   * échoue, on conserve les images d'origine (le rendu reste possible).
   */
  private downscaleDbImages(mediaDir: string): void {

    try {
      const script = path.resolve(__dirname, '../../python/downscale_images.py');
      if (!fs.existsSync(script)) return;
      const pythonBin = this.findPythonBin();
      if (!pythonBin) {
        console.warn('[MarpGenerator] Redimensionnement images ignoré (aucun interpréteur Python trouvé).');
        return;
      }
      const isWin = process.platform === 'win32';
      const q = (p: string) => (isWin ? `"${p}"` : p);
      const proc = spawnSync(
        pythonBin,
        [q(script), '--dir', q(mediaDir), '--max', '1000', '--prefix', 'db_'],
        { encoding: 'utf-8', timeout: 120_000, shell: isWin },
      );
      if (proc.status === 0 && proc.stdout) {
        console.log(`[MarpGenerator] Redimensionnement images: ${proc.stdout.trim()}`);
      } else if (proc.error || proc.status !== 0) {
        console.warn(
          `[MarpGenerator] Redimensionnement images ignoré (${proc.error?.message || 'status ' + proc.status}).`,
        );
      }
    } catch (err: any) {
      console.warn(`[MarpGenerator] Redimensionnement images ignoré: ${err.message || err}`);
    }
  }

  /**
   * Détecte le binaire Python disponible sur le système.
   * Priorité : variable d'env PYTHON_BIN, puis python3 / python / py.
   */
  private findPythonBin(): string | null {
    if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
    const isWin = process.platform === 'win32';
    const candidates = isWin ? ['py', 'python', 'python3'] : ['python3', 'python', 'py'];
    for (const bin of candidates) {
      try {
        const check = spawnSync(bin, ['--version'], {
          encoding: 'utf-8',
          timeout: 5_000,
          shell: isWin,
          stdio: 'pipe',
        });
        if (!check.error && check.status === 0) {
          console.log(`[MarpGenerator] Python trouvé: ${bin} → ${(check.stdout || '').trim()}`);
          return bin;
        }
      } catch { /* essai suivant */ }
    }
    return null;
  }

  /**
   * Build the full Marp markdown string.
   */
  private buildMarkdown(
    chapters: AssembleChapter[],
    cover: CoverInfo = {},
    assignments: SlideAssignments = new Map(),
    schemas: SlideSchemas = new Map(),
    theme: string = themeActif(),
  ): string {
    const lines: string[] = [];
    // Thèmes de la refonte : ouverture de bloc numérotée avec ses rubriques, organigramme et schémas en pleine page.
    // Retour arrière (« gss-2026-09 ») : Markdown identique à celui d'avant les thèmes.
    const refonte = !estRetourArriere(theme);

    // ── Frontmatter ──
    lines.push('---');
    lines.push('marp: true');
    lines.push('theme: gss');
    lines.push('size: a4');
    lines.push('paginate: true');
    lines.push("header: 'GLOBAL SECURITY SERVICES'");
    lines.push('---');
    lines.push('');
    if (fs.existsSync(LEXEND_PATH)) {
      // Police des schémas GSS : embarquée une seule fois pour tout le document.
      const b64 = fs.readFileSync(LEXEND_PATH).toString('base64');
      lines.push(`<style>@font-face{font-family:'Lexend';src:url(data:font/ttf;base64,${b64}) format('truetype');font-weight:100 900;}</style>`);
      lines.push('');
    }

    // ── Cover page (lead) ──
    lines.push('<!-- _class: lead -->');
    lines.push('');
    lines.push('# GLOBAL SECURITY SERVICES');
    lines.push('## VOTRE PARTENAIRE SÉCURITÉ');
    lines.push('### MÉMOIRE TECHNIQUE');
    if (cover.objet || cover.title) {
      lines.push(`#### ${(cover.objet || cover.title || '').toUpperCase()}`);
    } else {
      lines.push('#### SÉCURITÉ INCENDIE & SÛRETÉ');
    }

    if (cover.client) {
      lines.push('');
      lines.push(`##### ${cover.client.toUpperCase()}`);
    }
    lines.push('');

    // ── Table of contents ──
    lines.push('---');
    lines.push('<!-- _header: "" -->');
    lines.push('');
    lines.push('## SOMMAIRE');
    lines.push('');

    let tocItemCount = 0;
    const tocPages: string[][] = [[]];

    for (const chapter of chapters) {
      if (!chapter.sections || chapter.sections.length === 0) continue;

      const chapterLine = `${this.romanToNumber(chapter.key)}. __${chapter.title.toUpperCase()}__`;
      tocPages[tocPages.length - 1].push(chapterLine);
      tocItemCount++;

      // Numérotation des rubriques propre à chaque chapitre (1, 2, 3… rendus i, ii, iii) : un compteur
      // global faisait démarrer les chapitres suivants à 6, 13… (sommaire « 6. 7. … 11 »).
      // Les pages de références « Ils nous font confiance » suivent le chapitre I : elles figurent au sommaire.
      const titresToc = [...chapter.sections.map((sec) => sec.title), ...((chapter.key === 'I' || chapter.key === '1') && this.getReferencesSlides().length ? ['Ils nous font confiance'] : [])];
      titresToc.forEach((titre, idx) => {
        const sectionLine = `\t${idx + 1}. __${titre.toUpperCase()}__`;
        tocPages[tocPages.length - 1].push(sectionLine);
        tocItemCount++;

        // Split TOC across pages if it gets too long (~18 items per page)
        if (tocPages[tocPages.length - 1].length >= (refonte ? 28 : 18)) {
          // Thèmes de la refonte (corps de texte plus petit) : 28 lignes par page, et la page suivante reprend la ligne
          // du chapitre en cours (sinon la sous-rubrique qui l'ouvre serait lue comme un bloc de code).
          tocPages.push(refonte && idx < titresToc.length - 1 ? [chapterLine] : []);
        }
      });
    }

    // First TOC page already has the "## SOMMAIRE" header
    if (tocPages[0]) {
      for (const item of tocPages[0]) {
        lines.push(item);
      }
    }

    // Additional TOC pages
    for (let i = 1; i < tocPages.length; i++) {
      if (tocPages[i].length === 0) continue;
      lines.push('');
      lines.push('---');
      lines.push('<!-- _header: "" -->');
      lines.push('');
      lines.push('## SOMMAIRE');
      lines.push('');
      for (const item of tocPages[i]) {
        lines.push(item);
      }
    }

    lines.push('');

    // ── Chapters & sections ──
    chapters.forEach((chapter, ci) => {
      if (!chapter.sections || chapter.sections.length === 0) return;

      // Intercalaire (chapter divider page)
      lines.push('---');
      lines.push('<!-- _class: intercalaire -->');
      lines.push(`<!-- _header: "" -->`);
      lines.push('');
      if (refonte) {
        // Ouverture de bloc (planche de l'agent design) : numéro du bloc en grand, comme au sommaire.
        lines.push(`<div class="gss-bloc-numero">${String(this.romanToNumber(chapter.key)).padStart(2, '0')}</div>`);
        lines.push('');
      }
      lines.push(`# ${chapter.title.toUpperCase()}`);
      lines.push('');
      if (refonte) {
        // … puis les rubriques du bloc, dans l'ordre et avec les titres du sommaire.
        const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const titresBloc = [...chapter.sections.map((sec) => sec.title), ...((chapter.key === 'I' || chapter.key === '1') && this.getReferencesSlides().length ? ['Ils nous font confiance'] : [])];
        lines.push(`<ul class="gss-bloc-rubriques">${titresBloc.map((t) => `<li>${echapper(t)}</li>`).join('')}</ul>`);
        lines.push('');
      }

      // Sections
      chapter.sections.forEach((section, si) => {
        const headerTitle = section.title.toUpperCase();
        const cleanedText = cleanTextForMarp(section.text);
        const chunks = splitIntoSlideChunks(cleanedText, limitesSection(section, theme));

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          lines.push('---');
          lines.push(`<!-- header: "${headerTitle}" -->`);
          lines.push('');
          lines.push(chunk);
          lines.push('');

          // Rubrique dont le schéma a sa propre page : aucun schéma sous le texte (1 schéma = 1 page).
          if (section.schemaPleinePage) continue;
          const schemaGss = schemas.get(slideKeyOf(ci, si, i));
          if (schemaGss) {
            // Un schéma GSS par page, à l'emplacement réservé à l'illustration (sous le texte).
            // Largeur du texte (plus grand qu'avant, centrage et marges latérales symétriques conservés).
            lines.push(`<div class="schema-gss" style="width: 100%; margin: 15px auto 0;">`);
            lines.push(schemaGss.replace('<svg ', '<svg style="display: block; width: 100%; height: auto; max-height: 440px; margin: 0 auto;" '));
            lines.push(`</div>`);
            lines.push('');
            continue;
          }

          const hasSchema = section.d2SvgFileName && i === chunks.length - 1;
          const illus = assignments.get(slideKeyOf(ci, si, i));

          if (hasSchema) {
            lines.push(`<div style="text-align: center; margin: 15px 0; width: 100%;">`);
            lines.push(`  <img src="./media/${section.d2SvgFileName}" alt="Schéma - ${section.title.replace(/"/g, '&quot;')}" style="width: 85%; height: auto; max-height: 440px; object-fit: contain; display: block; margin: 0 auto;" />`);
            lines.push(`</div>`);
            lines.push('');
            lines.push(`<div class="box" style="margin-top: 0.5rem; font-size: 0.85em; padding: 0.5rem;">`);
            lines.push(`⚠️ Dispositif sur-mesure : l'architecture technique et humaine présentée répond spécifiquement aux exigences de sécurité de ce chapitre.`);
            lines.push(`</div>`);
            lines.push('');
          }

          if (illus && !hasSchema) {
            // Illustration attribuée à CETTE slide selon son contexte (ignorée s'il y a déjà un schéma D2).
            lines.push(`![${illus.alt}](media/${illus.fileName})`);
            lines.push('');
          }
        }

        // Page de schéma (1 à 2 pages de texte, puis 1 page de schéma) : le titre-message du schéma, puis le schéma
        // en grand, sans autre texte (toile portrait du moteur de schémas, au moins 70 % de la hauteur de la page).
        if (section.schemaPleinePage?.svg) {
          lines.push('---');
          lines.push('<!-- _class: schema -->');
          lines.push(`<!-- header: "${headerTitle}" -->`);
          lines.push('');
          const titre = titreSchema(section.schemaPleinePage.titre);
          if (titre) {
            lines.push(`## ${titre}`);
            lines.push('');
          }
          lines.push('<div class="schema-page">');
          lines.push(section.schemaPleinePage.svg.replace(/\s*\n\s*/g, ' ').trim());
          lines.push('</div>');
          lines.push('');
        }

        // Photos ajoutées par l'utilisateur (assistant de modification) : une page par photo, à la suite
        // du texte de la rubrique. Sans photo, rien ne change.
        for (const photo of section.photos || []) {
          let src = '';
          try {
            const ext = path.extname(photo.chemin).toLowerCase() === '.png' ? 'png' : 'jpeg';
            src = `data:image/${ext};base64,${fs.readFileSync(photo.chemin).toString('base64')}`;
          } catch { continue; }
          const legende = (photo.legende || '').replace(/[<>]/g, '');
          lines.push('---');
          lines.push(`<!-- header: "${headerTitle}" -->`);
          lines.push('');
          lines.push(`<div class="photo-gss" style="width: 100%; margin: 20px auto 0; text-align: center;">`);
          lines.push(`<img src="${src}" alt="${legende.replace(/"/g, '&quot;')}" style="display: block; max-width: 100%; max-height: 470px; height: auto; margin: 0 auto; border-radius: 4px;" />`);
          if (legende) lines.push(`<p style="margin-top: 10px; font-size: 0.8em; font-style: italic;">${legende}</p>`);
          lines.push(`</div>`);
          lines.push('');
        }

        // Organigramme GSS (section encadrement) : dessiné dans le design validé des schémas GSS,
        // contenu identique à l'ancienne image organigramme.png. Intégré dans la page (police Lexend).
        // Rubrique qui a déjà son schéma en pleine page (mémoire type) : pas d'organigramme en plus.
        const organigramme = section.id === 'b_encadrement' && !section.schemaPleinePage ? lireOrganigrammeGss(theme) : null;
        if (organigramme && refonte) {
          // Thème de la refonte : l'organigramme est une page de schéma (format page, en grand).
          lines.push('---');
          lines.push('<!-- _class: schema -->');
          lines.push(`<!-- header: "${headerTitle}" -->`);
          lines.push('');
          lines.push('<div class="schema-page">');
          lines.push(organigramme);
          lines.push('</div>');
          lines.push('');
        } else if (organigramme) {
          lines.push('---');
          lines.push(`<!-- header: "${headerTitle}" -->`);
          lines.push('');
          lines.push(`<div class="schema-gss" style="width: 100%; margin: 40px auto 0;">`);
          lines.push(organigramme.replace('<svg ', '<svg style="display: block; width: 100%; height: auto; margin: 0 auto;" '));
          lines.push(`</div>`);
          lines.push('');
        }

        // Dynamic illustrations mapping based on section id
        const illustrationMap: Record<string, string> = {
          // More illustrations will be added here pas à pas
        };

        if (section.id && illustrationMap[section.id] && !section.d2SvgFileName) {
          lines.push('---');
          lines.push('<!-- _class: lead -->');
          lines.push('<!-- _header: "" -->');
          lines.push(`![bg contain](media/${illustrationMap[section.id]})`);
          lines.push('');
        }


      });

      if (chapter.key === 'I' || chapter.key === '1') {
        const refSlides = this.getReferencesSlides();
        for (const slide of refSlides) {
          lines.push('---');
          lines.push(slide);
          lines.push('');
        }
      }
    });

    return lines.join('\n');
  }

  /**
   * Extract the static references slides from the master template.
   */
  private getReferencesSlides(): string[] {
    try {
      const masterPath = path.join(MARP_ASSETS_DIR, 'gss_memoire_master.md');
      if (!fs.existsSync(masterPath)) return [];
      const content = fs.readFileSync(masterPath, 'utf-8');
      const slides = content.replace(/\r\n/g, '\n').split('\n---');
      const refSlides: string[] = [];
      let inRef = false;

      for (const slide of slides) {
        const cleanSlide = slide.trim();
        const norm = cleanSlide.toUpperCase();

        if (norm.includes('ILS NOUS ONT FAIT CONFIANCEZONE D’IMAGE') || norm.includes('ILS NOUS ONT FAIT CONFIANCEZONE D\'IMAGE')) {
          inRef = true;
        } else if (norm.includes('LES MOYENS HUMAINS')) {
          inRef = false;
        }

        if (inRef) {
          // Le repère « Zone d’image » du modèle sert à détecter les pages de références ; il ne doit
          // jamais apparaître dans le PDF : la ligne titre devient l'en-tête de page.
          refSlides.push(
            cleanSlide
              .replace(/^ILS NOUS ONT FAIT CONFIANCE\s*Zone d[’']image\s*$/m, '<!-- header: "ILS NOUS ONT FAIT CONFIANCE" -->\n')
              .replace(/Zone d[’']image/g, '')
              // Pages de la distribution titrées « I. PRESENTATION » / « PRESENTATION » dans le modèle : même
              // en-tête que les autres pages de références.
              .replace(/<!--\s*header:\s*"(?:I\.\s*)?PRESENTATION"\s*-->/g, '<!-- header: "ILS NOUS FONT CONFIANCE" -->')
              .trim(),
          );
        }
      }
      return refSlides;
    } catch (err) {
      console.error('[MarpGenerator] Error reading references slides:', err);
      return [];
    }
  }

  /**
   * Convert roman numeral key to number for TOC numbering.
   */
  private romanToNumber(key: string): number {
    const map: Record<string, number> = {
      'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5,
      'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10,
    };
    return map[key.toUpperCase()] || parseInt(key, 10) || 1;
  }
}

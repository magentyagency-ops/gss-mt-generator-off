import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import type { PooledIllustration, SlideContext } from './image_service';
import { D2Service } from './d2_service';

/** Illustrations attribuées, indexées par clé de slide (unicité globale garantie amont). */
export type SlideAssignments = Map<string, PooledIllustration>;

// ─── Constants ───
/** Maximum words per slide body before splitting to a new slide.
 *  Abaissé (vs 220) pour réserver l'espace de l'illustration placée sous le texte. */
const MAX_WORDS_PER_SLIDE = 170;
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
function splitIntoSlideChunks(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const isHeading = (p: string) => /^#{1,6}\s/.test(p);
  const wordCount = (p: string) => p.split(/\s+/).length;

  const chunks: string[] = [];
  let current = '';
  let currentWords = 0;

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
    currentWords = 0;
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
      if (currentWords + blockWords > MAX_WORDS_PER_SLIDE) {
        flush();
      }
    } else if (currentWords + paraWords > MAX_WORDS_PER_SLIDE && current.trim()) {
      flush();
    }

    current += (current ? '\n\n' : '') + para;
    currentWords += paraWords;
  }
  flush();

  return chunks.length > 0 ? chunks : [''];
}

/** Clé stable d'une slide de contenu, partagée entre l'énumération et le rendu. */
function slideKeyOf(chapterIdx: number, sectionIdx: number, chunkIdx: number): string {
  return `${chapterIdx}_${sectionIdx}_${chunkIdx}`;
}

export interface AssembleSection {
  title: string;
  text: string;
  id?: string;
  illustration?: string;
  d2Code?: string;
  d2SvgFileName?: string;
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
  public static enumerateContentSlides(chapters: AssembleChapter[]): SlideContext[] {
    const slides: SlideContext[] = [];
    chapters.forEach((chapter, ci) => {
      if (!chapter.sections || chapter.sections.length === 0) return;
      chapter.sections.forEach((section, si) => {
        const chunks = splitIntoSlideChunks(cleanTextForMarp(section.text));
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
  ): Promise<{ filePath: string; markdownPath: string }> {
    // Write markdown + copy assets to a temp working directory
    const workDir = path.join(this.outputDir, `marp_work_${Date.now()}`);
    fs.mkdirSync(workDir, { recursive: true });

    const cssPath = path.join(workDir, 'gss-theme.css');
    const logoSrc = path.join(MARP_ASSETS_DIR, 'logogss.png');
    const logoDst = path.join(workDir, 'logogss.png');

    // Check if css exists
    const cssSrc = path.join(MARP_ASSETS_DIR, 'gss-theme.css');
    if (fs.existsSync(cssSrc)) {
      fs.copyFileSync(cssSrc, cssPath);
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

    const markdown = this.buildMarkdown(chapters, cover, assignments);
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

    let linuxChromePath: string | undefined;
    if (!isWin) {
      try {
        linuxChromePath = require('child_process').execSync('which chromium || which chromium-browser || which google-chrome').toString().trim();
      } catch (e) {
        console.warn('[MarpGenerator] Impossible de localiser Chromium avec which');
      }
    }

    const result = spawnSync(
      'npx',
      [
        '-y', '@marp-team/marp-cli@latest',
        q(mdPath),
        '--theme', q(cssPath),
        '--pdf',
        '-o', q(pdfPath),
        '--allow-local-files',
        '--html',
        '--no-stdin',
      ],
      {
        cwd: workDir,
        timeout: 300_000, // 5 minutes max (les gros mémoires ~120 pages dépassent 2 min de rendu)
        stdio: 'pipe',
        encoding: 'utf-8',
        shell: isWin,
        // Marp/Puppeteer abandonne la conversion après 30 s par défaut : insuffisant
        // pour un mémoire volumineux illustré d'images (base de données). On aligne
        // ce délai interne sur le timeout du process (cause du « Timed out after 30000ms »).
        env: { 
          ...process.env, 
          PUPPETEER_TIMEOUT: '280000',
          CHROME_PATH: process.env.CHROME_PATH || linuxChromePath
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
      const pythonBin = process.env.PYTHON_BIN || 'py';
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
   * Build the full Marp markdown string.
   */
  private buildMarkdown(
    chapters: AssembleChapter[],
    cover: CoverInfo = {},
    assignments: SlideAssignments = new Map(),
  ): string {
    const lines: string[] = [];

    // ── Frontmatter ──
    lines.push('---');
    lines.push('marp: true');
    lines.push('theme: gss');
    lines.push('size: a4');
    lines.push('paginate: true');
    lines.push("header: 'GLOBAL SECURITY SERVICES'");
    lines.push('---');
    lines.push('');

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

      for (const sec of chapter.sections) {
        const sectionLine = `\t${tocItemCount}. __${sec.title.toUpperCase()}__`;
        tocPages[tocPages.length - 1].push(sectionLine);
        tocItemCount++;

        // Split TOC across pages if it gets too long (~18 items per page)
        if (tocPages[tocPages.length - 1].length >= 18) {
          tocPages.push([]);
        }
      }
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
      lines.push(`# ${chapter.title.toUpperCase()}`);
      lines.push('');

      // Sections
      chapter.sections.forEach((section, si) => {
        const headerTitle = section.title.toUpperCase();
        const cleanedText = cleanTextForMarp(section.text);
        const chunks = splitIntoSlideChunks(cleanedText);

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          lines.push('---');
          lines.push(`<!-- header: "${headerTitle}" -->`);
          lines.push('');
          lines.push(chunk);
          lines.push('');

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

        // Dynamic illustrations mapping based on section id
        const illustrationMap: Record<string, string> = {
          'b_encadrement': 'organigramme.png',
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
          refSlides.push(cleanSlide);
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

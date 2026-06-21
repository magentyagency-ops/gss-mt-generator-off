const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { PDFDocument } = require('pdf-lib');

const LIVE_PDF_PATH = '/Users/clarencegomis/memoiretechnique/GSS-new/live_edit/Mémoire_Technique_GSS_Template_1782000541623.pdf';
const MASTER_MD_PATH = '/Users/clarencegomis/memoiretechnique/GSS-new/gss-ao/backend/src/generation/marp/gss_memoire_master.md';
const MARP_ASSETS_DIR = '/Users/clarencegomis/memoiretechnique/GSS-new/gss-ao/backend/src/generation/marp';

function getReferencesSlides() {
  const content = fs.readFileSync(MASTER_MD_PATH, 'utf-8');
  const slides = content.replace(/\r\n/g, '\n').split('\n---');
  const refSlides = [];
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
}

async function run() {
  try {
    console.log('1. Extracting references slides from master...');
    const refSlides = getReferencesSlides();
    console.log(`Found ${refSlides.length} reference slides.`);

    // 2. Build Marp markdown for references
    const lines = [];
    lines.push('---');
    lines.push('marp: true');
    lines.push('theme: gss');
    lines.push('size: a4');
    lines.push('paginate: true');
    lines.push("header: 'GLOBAL SECURITY SERVICES'");
    lines.push('---');
    lines.push('');

    for (const slide of refSlides) {
      lines.push('---');
      lines.push(slide);
      lines.push('');
    }

    const tempDir = path.join(__dirname, 'temp_ref_gen');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const mdPath = path.join(tempDir, 'references.md');
    fs.writeFileSync(mdPath, lines.join('\n'), 'utf-8');

    // Copy assets to tempDir
    const cssSrc = path.join(MARP_ASSETS_DIR, 'gss-theme.css');
    const cssDst = path.join(tempDir, 'gss-theme.css');
    if (fs.existsSync(cssSrc)) fs.copyFileSync(cssSrc, cssDst);

    const logoSrc = path.join(MARP_ASSETS_DIR, 'logogss.png');
    const logoDst = path.join(tempDir, 'logogss.png');
    if (fs.existsSync(logoSrc)) fs.copyFileSync(logoSrc, logoDst);

    const mediaSrc = path.join(MARP_ASSETS_DIR, 'media');
    const mediaDst = path.join(tempDir, 'media');
    if (fs.existsSync(mediaSrc)) {
      fs.cpSync(mediaSrc, mediaDst, { recursive: true });
    }

    const refPdfPath = path.join(tempDir, 'references.pdf');

    console.log('2. Rendering references slides to PDF via Marp...');
    const marpResult = spawnSync(
      'npx',
      [
        '-y', '@marp-team/marp-cli@latest',
        mdPath,
        '--theme', cssDst,
        '--pdf',
        '-o', refPdfPath,
        '--allow-local-files',
        '--html',
        '--no-stdin',
      ],
      {
        cwd: tempDir,
        stdio: 'pipe',
        encoding: 'utf-8',
      }
    );

    if (marpResult.status !== 0) {
      throw new Error(`Marp failed: ${marpResult.stderr}`);
    }
    console.log('References PDF generated successfully.');

    // 3. Merge references PDF into the live PDF
    console.log(`3. Loading live PDF: ${LIVE_PDF_PATH}`);
    const livePdfBytes = fs.readFileSync(LIVE_PDF_PATH);
    const livePdfDoc = await PDFDocument.load(livePdfBytes);

    console.log(`4. Loading references PDF: ${refPdfPath}`);
    const refPdfBytes = fs.readFileSync(refPdfPath);
    const refPdfDoc = await PDFDocument.load(refPdfBytes);

    // We want to insert references pages after the "Présentation de la société GSS" section.
    // Let's copy the pages from refPdfDoc into livePdfDoc.
    const refPageIndices = Array.from({ length: refPdfDoc.getPageCount() }, (_, i) => i);
    const copiedPages = await livePdfDoc.copyPages(refPdfDoc, refPageIndices);

    const pageCount = livePdfDoc.getPageCount();
    console.log(`Original PDF page count: ${pageCount}`);

    // Insert at index 5 (which is page 6, right after "1. PRÉSENTATION DE LA SOCIÉTÉ GSS")
    const insertIndex = 5; 
    console.log(`Inserting ${copiedPages.length} pages at page index ${insertIndex}...`);

    for (let i = 0; i < copiedPages.length; i++) {
      livePdfDoc.insertPage(insertIndex + i, copiedPages[i]);
    }

    console.log(`Saving modified PDF...`);
    const modifiedPdfBytes = await livePdfDoc.save();
    fs.writeFileSync(LIVE_PDF_PATH, modifiedPdfBytes);
    console.log(`Successfully merged references into: ${LIVE_PDF_PATH}`);

    // Cleanup tempDir
    fs.rmSync(tempDir, { recursive: true, force: true });

  } catch (err) {
    console.error('Error during merge:', err);
  }
}

run();

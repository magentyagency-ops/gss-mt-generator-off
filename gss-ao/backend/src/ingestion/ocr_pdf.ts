// ════════════════════════════════════════════════════════════════════════════════════════
// LECTURE DES PDF SANS COUCHE TEXTE (scans, « Microsoft Print To PDF »…)
// ════════════════════════════════════════════════════════════════════════════════════════
// Certains acheteurs publient un CCTP, un RC ou un CCAP dont le texte est dessiné (aucune couche
// texte) : l'extraction classique n'en tire que quelques centaines de caractères, et le mémoire était
// rédigé sans avoir lu le cahier des charges. Ces PDF sont transcrits par le modèle (lecture des pages
// en image), par blocs de pages en parallèle. La transcription est mise en cache (empreinte du
// fichier) : un même PDF n'est lu qu'une fois.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import OpenAI from 'openai';
import { PDFDocument } from 'pdf-lib';
import { getSettings } from '../core/config';
import { creditEpuise } from '../core/modeles_ia';

const CACHE = path.resolve(__dirname, '../../response/ocr_cache');
const PAGES_PAR_BLOC = 4;
const EN_PARALLELE = 4;

/** Vrai si le texte extrait est manifestement trop pauvre pour le nombre de pages (PDF sans couche texte). */
export function texteTropPauvre(texte: string, pages: number): boolean {
  if (!pages) return false;
  return texte.replace(/\s+/g, '').length / pages < 150;
}

/** Transcrit un PDF sans couche texte. Renvoie '' si la transcription est impossible. */
export async function transcrirePdf(fichier: string): Promise<string> {
  const contenu = fs.readFileSync(fichier);
  const cle = crypto.createHash('sha1').update(contenu).digest('hex');
  const cache = path.join(CACHE, `${cle}.txt`);
  if (fs.existsSync(cache)) return fs.readFileSync(cache, 'utf-8');

  const cleApi = getSettings().openaiApiKey;
  if (!cleApi) return '';
  const client = new OpenAI({ apiKey: cleApi, timeout: 300_000 });
  const modele = process.env.OCR_MODEL || process.env.MEMOIRE_MODEL || 'gpt-5.6-luna';
  const source = await PDFDocument.load(contenu, { ignoreEncryption: true });
  const total = source.getPageCount();
  const blocs: number[][] = [];
  for (let d = 0; d < total; d += PAGES_PAR_BLOC) blocs.push(Array.from({ length: Math.min(PAGES_PAR_BLOC, total - d) }, (_, k) => d + k));

  const lireBloc = async (pages: number[]): Promise<string> => {
    const extrait = await PDFDocument.create();
    (await extrait.copyPages(source, pages)).forEach((p) => extrait.addPage(p));
    const b64 = Buffer.from(await extrait.save()).toString('base64');
    for (let essai = 1; essai <= 3; essai++) {
      try {
        const r = await client.chat.completions.create({
          model: modele,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Transcris intégralement et fidèlement le texte de ces pages de document (dans l\'ordre de lecture ; tableaux en lignes « cellule | cellule | … »). Ne résume rien, n\'ajoute rien, ne commente pas. Si une page est vide, n\'écris rien pour elle.' },
              { type: 'file', file: { filename: 'pages.pdf', file_data: `data:application/pdf;base64,${b64}` } } as any,
            ],
          }],
        });
        return r.choices[0]?.message?.content || '';
      } catch (e: any) {
        // Crédit OpenAI épuisé (« 429 You have no credits remaining… », T10-COH-4) : arrêt immédiat, sans nouvel essai ni attente.
        if (essai === 3 || creditEpuise(e)) { console.warn(`[OCR] Pages ${pages[0] + 1}-${pages[pages.length - 1] + 1} illisibles (${e?.message || e}).`); return ''; }
        await new Promise((ok) => setTimeout(ok, 10_000 * essai));
      }
    }
    return '';
  };

  const resultats: string[] = new Array(blocs.length).fill('');
  let suivant = 0;
  await Promise.all(Array.from({ length: Math.min(EN_PARALLELE, blocs.length) }, async () => {
    while (suivant < blocs.length) { const i = suivant++; resultats[i] = await lireBloc(blocs[i]); }
  }));
  const texte = resultats.join('\n\n').trim();
  if (texte) {
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(cache, texte, 'utf-8');
    console.log(`[OCR] ${path.basename(fichier)} : PDF sans couche texte transcrit (${total} pages, ${texte.length} caractères).`);
  }
  return texte;
}

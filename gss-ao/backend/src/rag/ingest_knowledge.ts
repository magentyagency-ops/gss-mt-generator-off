/**
 * Ingestion de la base de connaissance RAG → table public.rag_chunk (Supabase).
 *
 * Alimente la table avec CE QUE L'IA LIT AUJOURD'HUI, indexé une fois pour toutes au lieu
 * d'être relu et ré-embeddé à chaque génération (cf. memoire_generator.getGssDocumentation) :
 *   • Template/Documentation GSS/<CATÉGORIE>/*.pdf|docx  → source = 'GSS', categorie = le dossier
 *   • Template/Mémoire technique/AO RNE.docx             → source = 'TEMPLATE'
 *
 * Le chunk_id est déterministe (hash du chemin + index) : relancer le script fait un UPSERT,
 * jamais de doublon. Un fichier inchangé est ignoré (comparaison du hash de contenu).
 *
 * Usage :
 *   npx ts-node src/rag/ingest_knowledge.ts            # ingère tout
 *   npx ts-node src/rag/ingest_knowledge.ts --dry-run  # aucun écrit en base, aucun embedding
 *   npx ts-node src/rag/ingest_knowledge.ts --force    # ré-embedde même les fichiers inchangés
 *   npx ts-node src/rag/ingest_knowledge.ts --only=GSS # ingère seulement la Documentation GSS
 *
 * Variables d'environnement requises : DATABASE_URL (Supabase, connexion directe), OPENAI_API_KEY.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Client } from 'pg';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import PizZip from 'pizzip';
import { extractText } from '../ingestion/docConverter';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Modèle d'embeddings : doit correspondre à extensions.vector(1536) de la migration.
const EMBEDDING_MODEL = process.env.RAG_EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_DIM = 1536;

// Découpage : ~1200 caractères avec 150 de recouvrement — assez large pour garder une procédure
// GSS entière dans un chunk, assez court pour rester précis à la récupération.
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;
const EMBED_BATCH = 64;   // l'API accepte des lots ; limite la latence et le nombre d'appels

const SUPPORTED_EXT = ['.pdf', '.docx', '.doc'];

interface PendingChunk {
  chunkId: string;
  text: string;
  source: 'GSS' | 'TEMPLATE';
  categorie: string;
  sourceFile: string;
  sourcePath: string;
  chunkIndex: number;
  extra: Record<string, unknown>;
}

/** Racine `Template/` — voisine de gss-ao/, comme dans memoire_generator (this.templateDir). */
function templateDir(): string {
  return path.resolve(__dirname, '../../../../', 'Template');
}

/** Liste récursive des documents exploitables d'un dossier. */
function listDocs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { out.push(...listDocs(full)); continue; }
    // ~$… = fichiers de verrouillage Word, à ignorer
    if (entry.name.startsWith('~$')) continue;
    if (SUPPORTED_EXT.includes(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

/**
 * Découpe un texte en chunks se recouvrant, en coupant de préférence sur une fin de phrase
 * ou un saut de ligne pour ne pas trancher une procédure au milieu d'une phrase.
 */
function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length <= CHUNK_SIZE) return clean ? [clean] : [];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);
    if (end < clean.length) {
      // Cherche une frontière naturelle dans le dernier tiers de la fenêtre.
      const window = clean.slice(start + Math.floor(CHUNK_SIZE * 0.66), end);
      const m = window.lastIndexOf('\n\n') >= 0 ? window.lastIndexOf('\n\n')
              : Math.max(window.lastIndexOf('. '), window.lastIndexOf('\n'));
      if (m > 0) end = start + Math.floor(CHUNK_SIZE * 0.66) + m + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks;
}

/**
 * Texte d'un .docx lu directement dans word/document.xml (même approche que memoire_generator).
 * extractText() passe par docConverter, qui échoue sur AO RNE.docx (structure OOXML riche).
 */
function docxTextViaZip(filePath: string): string {
  const xml = new PizZip(fs.readFileSync(filePath)).file('word/document.xml')?.asText();
  if (!xml) return '';
  return xml
    .split(/<w:p[ >]/).slice(1)
    .map((p) => (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
      .map((m) => m.replace(/<[^>]+>/g, '')).join(''))
    .map((t) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim())
    .filter(Boolean)
    .join('\n');
}

function sha1(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex');
}

/** Embeddings par lots. Renvoie un vecteur par texte (null si l'appel échoue). */
async function embedAll(openai: OpenAI, texts: string[]): Promise<Array<number[] | null>> {
  const out: Array<number[] | null> = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    try {
      const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: batch });
      for (const d of res.data) out.push(d.embedding as number[]);
      console.log(`  embeddings ${Math.min(i + batch.length, texts.length)}/${texts.length}`);
    } catch (e: any) {
      console.error(`  ⚠ embeddings échoués (lot ${i}) : ${e?.message || e}`);
      for (const _ of batch) out.push(null);
    }
  }
  return out;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.split('=')[1].toUpperCase() : null;   // 'GSS' | 'TEMPLATE' | null

  const root = templateDir();
  if (!fs.existsSync(root)) {
    console.error(`Dossier Template introuvable : ${root}`);
    process.exit(1);
  }

  // ── 1. Recensement des sources ────────────────────────────────────────────────────────
  const docGssRoot = path.join(root, 'Documentation GSS');
  const memoireRoot = path.join(root, 'Mémoire technique');

  type Source = { file: string; source: 'GSS' | 'TEMPLATE'; categorie: string };
  let sources: Source[] = [
    // Documentation GSS : la catégorie = le nom du sous-dossier (FORMATION, MATERIEL, …),
    // c'est la clé utilisée par GSS_DOC_KEYWORDS dans memoire_generator.
    ...listDocs(docGssRoot).map((f) => ({
      file: f,
      source: 'GSS' as const,
      categorie: path.relative(docGssRoot, f).split(path.sep)[0],
    })),
    // Mémoire maître AO RNE : sert de référence de style et de contenu.
    ...listDocs(memoireRoot)
      .filter((f) => path.extname(f).toLowerCase() === '.docx')
      .map((f) => ({ file: f, source: 'TEMPLATE' as const, categorie: 'MEMOIRE MAITRE' })),
  ];
  if (only) sources = sources.filter((s) => s.source === only);

  console.log(`${sources.length} document(s) trouvé(s) sous ${root}${only ? ` (filtre --only=${only})` : ''}`);
  if (sources.length === 0) process.exit(0);

  // ── 2. Connexion base (sauf dry-run) ──────────────────────────────────────────────────
  let client: Client | null = null;
  const knownHashes = new Map<string, string>();   // source_path → hash du fichier déjà ingéré
  if (!dryRun) {
    const url = (process.env.DATABASE_URL || '').replace(/^postgresql\+psycopg:\/\//, 'postgresql://');
    if (!url) { console.error('DATABASE_URL manquant.'); process.exit(1); }
    // SSL requis par Supabase ; rejectUnauthorized:false = on ne vérifie pas la CA (suffisant ici).
    client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await client.connect();
    const res = await client.query(
      `select source_path, extra->>'file_hash' as file_hash
         from public.rag_chunk where chunk_index = 0`
    );
    for (const r of res.rows) if (r.file_hash) knownHashes.set(r.source_path, r.file_hash);
  }

  // ── 3. Extraction + découpage ─────────────────────────────────────────────────────────
  const pending: PendingChunk[] = [];
  let skipped = 0;

  for (const src of sources) {
    const rel = path.relative(root, src.file);
    let text: string;
    try {
      text = await extractText(src.file);
    } catch (e: any) {
      // Repli PizZip pour les .docx que docConverter ne sait pas lire (ex. AO RNE.docx).
      text = path.extname(src.file).toLowerCase() === '.docx' ? docxTextViaZip(src.file) : '';
      if (!text) { console.warn(`  ⚠ extraction impossible — ${rel} : ${e?.message || e}`); continue; }
    }
    if (!text.trim()) { console.warn(`  ⚠ vide (PDF image ? OCR requis) — ${rel}`); continue; }

    const fileHash = sha1(text);
    if (!force && knownHashes.get(rel) === fileHash) { skipped++; continue; }

    const parts = chunkText(text);
    parts.forEach((piece, i) => {
      pending.push({
        chunkId: `${sha1(rel)}:${i}`,          // déterministe → UPSERT au ré-import
        text: piece,
        source: src.source,
        categorie: src.categorie,
        sourceFile: path.basename(src.file),
        sourcePath: rel,                        // chemin relatif à Template/ (portable)
        chunkIndex: i,
        extra: { file_hash: fileHash, chunk_count: parts.length },
      });
    });
    console.log(`  ${rel} → ${parts.length} chunk(s) [${src.source}/${src.categorie}]`);
  }

  console.log(`\n${pending.length} chunk(s) à indexer, ${skipped} fichier(s) inchangé(s) ignoré(s).`);

  if (dryRun) {
    console.log('--dry-run : aucun embedding calculé, aucune écriture en base.');
    return;
  }
  if (pending.length === 0) { await client!.end(); return; }

  // ── 4. Embeddings ─────────────────────────────────────────────────────────────────────
  if (!process.env.OPENAI_API_KEY) { console.error('OPENAI_API_KEY manquant.'); process.exit(1); }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const embeddings = await embedAll(openai, pending.map((c) => c.text));

  // ── 5. Upsert ─────────────────────────────────────────────────────────────────────────
  const sql = `
    insert into public.rag_chunk
      (chunk_id, text, source, categorie, source_file, source_path, chunk_index, extra, embedding)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    on conflict (chunk_id) do update set
      text = excluded.text, source = excluded.source, categorie = excluded.categorie,
      source_file = excluded.source_file, source_path = excluded.source_path,
      chunk_index = excluded.chunk_index, extra = excluded.extra, embedding = excluded.embedding
  `;

  let written = 0;
  for (let i = 0; i < pending.length; i++) {
    const c = pending[i];
    const vec = embeddings[i];
    if (vec && vec.length !== EMBEDDING_DIM) {
      console.warn(`  ⚠ dimension ${vec.length} ≠ ${EMBEDDING_DIM} — chunk ignoré (${c.sourcePath})`);
      continue;
    }
    await client!.query(sql, [
      c.chunkId, c.text, c.source, c.categorie, c.sourceFile, c.sourcePath,
      c.chunkIndex, JSON.stringify(c.extra), vec ? `[${vec.join(',')}]` : null,
    ]);
    written++;
  }

  const total = await client!.query('select count(*)::int as n from public.rag_chunk');
  await client!.end();
  console.log(`\n✔ ${written} chunk(s) écrits. Total en base : ${total.rows[0].n}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });

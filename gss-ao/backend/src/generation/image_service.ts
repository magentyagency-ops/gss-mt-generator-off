import OpenAI from 'openai';
import { getScopedClient } from '../core/supabase';
import { getSettings } from '../core/config';

/** Bucket privé où sont stockés les fichiers de la bibliothèque d'images. */
const IMAGES_BUCKET = 'images-library';

/** Modèle utilisé pour comprendre le contexte des slides et attribuer les images. */
const MATCH_MODEL = process.env.IMAGE_MATCH_MODEL || 'luna';

/** Nombre maximal d'images chargées dans le pool (borne de sécurité mémoire). */
const MAX_POOL_SIZE = 40;

/** Taille max d'une image embarquée : au-delà, Chromium ralentit le rendu. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Délai max d'un téléchargement d'image (évite qu'un fichier bloque la génération). */
const DOWNLOAD_TIMEOUT_MS = 20_000;

/** Téléchargements simultanés (parallélise le chargement du pool sans saturer le réseau). */
const DOWNLOAD_CONCURRENCY = 6;

/** Poids des différentes sources de mots-clés d'une image lors du scoring. */
const WEIGHT_TAG = 5;
const WEIGHT_NAME = 3;
const WEIGHT_DESC = 1;

/** Classe CSS d'insertion : bloc centré SOUS le texte (jamais à côté d'un titre). */
const ILLUSTRATION_ALT = 'class:illustration-block';

/**
 * Mots vides français/anglais ignorés lors du rapprochement contextuel : trop
 * fréquents pour être discriminants (sinon toutes les images « matchent »).
 */
const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'à', 'au', 'aux',
  'en', 'dans', 'sur', 'pour', 'par', 'avec', 'sans', 'sous', 'ce', 'cette', 'ces',
  'nos', 'notre', 'votre', 'vos', 'leur', 'leurs', 'son', 'sa', 'ses', 'est', 'sont',
  'qui', 'que', 'dont', 'plus', 'moins', 'tout', 'tous', 'toute', 'toutes',
  'nous', 'vous', 'ils', 'elles', 'the', 'and', 'for', 'with', 'gss', 'notamment',
  'ainsi', 'afin', 'chaque', 'entre', 'lors', 'via', 'être', 'avoir', 'fait',
]);

/** Ligne de la table public.images (colonnes exposées par select). */
interface ImageRow {
  id: string;
  nom: string;
  description: string | null;
  storage_path: string;
  type: string;
  tags: string[] | null;
}

/**
 * Image chargée en mémoire, prête à être écrite dans le dossier de travail Marp
 * et rapprochée d'une slide par son contexte via `keywords`.
 */
export interface PooledIllustration {
  /** Nom de fichier sûr utilisé dans le markdown (media/<fileName>). */
  fileName: string;
  /** Octets de l'image téléchargés depuis le bucket. */
  data: Buffer;
  /** Texte alternatif (pilote la classe CSS d'insertion Marp). */
  alt: string;
  /** Nom lisible (logs + contexte LLM). */
  nom: string;
  /** Description libre (contexte LLM). */
  description: string;
  /** Tags bruts (contexte LLM). */
  tags: string[];
  /** Mots-clés pondérés (tags > nom > description) pour le scoring de repli. */
  keywords: Array<[string, number]>;
}

/** Slide candidate à l'illustration : contexte = titre + texte affiché sur la page. */
export interface SlideContext {
  /** Clé stable partagée avec le générateur pour retrouver la slide. */
  key: string;
  /** Titre/en-tête de la slide. */
  title: string;
  /** Texte affiché sur la slide. */
  text: string;
}

/** Découpe un texte en jetons normalisés (minuscule, sans accents, sans mots vides). */
export function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Extension de fichier déduite du storage_path (par défaut .png). */
function extFromPath(storagePath: string): string {
  const m = storagePath.match(/\.([a-z0-9]{2,5})$/i);
  return m ? `.${m[1].toLowerCase()}` : '.png';
}

/**
 * Bibliothèque d'images GSS (table public.images + bucket images-library).
 * Charge en mémoire l'ensemble des images « insertion » puis laisse le
 * générateur en placer une sur (quasi) chaque slide selon son contexte.
 *
 * Toutes les requêtes passent par le client scoppé au JWT de la requête courante
 * (RLS active) : lecture autorisée pour tout utilisateur authentifié.
 */
export class ImageLibraryService {
  /**
   * Charge le pool d'images insérables (type insertion | les_deux), octets
   * téléchargés depuis le bucket + mots-clés pré-calculés pour le scoring.
   * Tolérant aux pannes : renvoie [] si la bibliothèque est indisponible/vide.
   */
  async loadPool(): Promise<PooledIllustration[]> {
    let rows: ImageRow[];
    try {
      rows = await this.fetchInsertableImages();
    } catch (err: any) {
      console.warn(`[ImageLibraryService] Bibliothèque d'images indisponible: ${err.message || err}`);
      return [];
    }
    if (!rows.length) {
      console.log('[ImageLibraryService] Aucune image « insertion » en base — génération sans illustrations.');
      return [];
    }

    // Téléchargements parallèles (par lots) : bien plus rapide que le séquentiel,
    // sans saturer le réseau ni la mémoire (pool borné + tailles plafonnées).
    const selected = rows.slice(0, MAX_POOL_SIZE);
    const pool: PooledIllustration[] = [];
    for (let i = 0; i < selected.length; i += DOWNLOAD_CONCURRENCY) {
      const batch = selected.slice(i, i + DOWNLOAD_CONCURRENCY);
      const settled = await Promise.all(
        batch.map(async (row): Promise<PooledIllustration | null> => {
          try {
            const data = await this.download(row.storage_path);
            if (data.length > MAX_IMAGE_BYTES) {
              console.warn(
                `[ImageLibraryService] Image « ${row.nom} » ignorée (${Math.round(data.length / 1024)} Ko > ${MAX_IMAGE_BYTES / 1024 / 1024} Mo).`,
              );
              return null;
            }
            return {
              fileName: `db_${row.id}${extFromPath(row.storage_path)}`,
              data,
              alt: ILLUSTRATION_ALT,
              nom: row.nom,
              description: row.description || '',
              tags: row.tags || [],
              keywords: this.imageKeywords(row),
            };
          } catch (err: any) {
            console.warn(
              `[ImageLibraryService] Téléchargement de « ${row.nom} » (${row.storage_path}) échoué: ${err.message || err}`,
            );
            return null;
          }
        }),
      );
      for (const item of settled) if (item) pool.push(item);
    }
    console.log(`[ImageLibraryService] ${pool.length} image(s) chargée(s) pour insertion contextuelle.`);
    return pool;
  }

  /**
   * Attribue une image à (quasi) CHAQUE slide, la plus pertinente selon le contexte
   * du texte. Mode « couverture » : la densité prime. La réutilisation n'est autorisée
   * qu'une fois TOUTES les images placées (cycles), et jamais sur deux slides
   * consécutives — réutilisation minimale et espacée quand la bibliothèque est petite.
   *
   * Classement contextuel : mots-clés (déterministe, robuste), affiné si possible par
   * le LLM (compréhension sémantique du texte). Le LLM ne bloque jamais la génération
   * (timeout + repli). @returns Map clé de slide → image (toutes les slides couvertes).
   */
  async assignImages(
    slides: SlideContext[],
    pool: PooledIllustration[],
  ): Promise<Map<string, PooledIllustration>> {
    if (!pool.length || !slides.length) return new Map();

    // 1. Classement de base par mots-clés : pour chaque slide, TOUTES les images
    //    ordonnées de la plus à la moins pertinente (garantit toujours un candidat).
    const prefs: number[][] = slides.map((s) => this.rankImagesByKeywords(s, pool));

    // 2. Affinage sémantique optionnel par le LLM (best-effort, jamais bloquant).
    try {
      const picks = await this.llmRankSlides(slides, pool);
      if (picks) {
        picks.forEach((imgs, si) => {
          if (!imgs || imgs.length === 0 || si < 0 || si >= prefs.length) return;
          const rest = prefs[si].filter((x) => !imgs.includes(x));
          prefs[si] = [...imgs, ...rest]; // les choix du LLM passent devant
        });
      }
    } catch (err: any) {
      console.warn(`[ImageLibraryService] Affinage LLM ignoré (${err.message || err}).`);
    }

    // 3. Placement : couverture maximale, réutilisation cyclique et espacée.
    return this.placeWithCoverage(slides, pool, prefs);
  }

  /** Toutes les images ordonnées par pertinence (score mots-clés) pour une slide. */
  private rankImagesByKeywords(slide: SlideContext, pool: PooledIllustration[]): number[] {
    const tokens = new Set(tokenize(`${slide.title} ${slide.title} ${slide.text}`));
    return pool
      .map((img, ii) => {
        let score = 0;
        for (const [tok, w] of img.keywords) if (tokens.has(tok)) score += w;
        return { ii, score };
      })
      .sort((a, b) => b.score - a.score || a.ii - b.ii)
      .map((x) => x.ii);
  }

  /**
   * Placement final : parcourt les slides dans l'ordre et attribue à chacune la
   * meilleure image de sa liste de préférence qui n'est PAS déjà utilisée dans le
   * cycle courant et différente de la slide précédente. Quand toutes les images ont
   * servi, un nouveau cycle démarre (réutilisation, mais la plus espacée possible).
   */
  private placeWithCoverage(
    slides: SlideContext[],
    pool: PooledIllustration[],
    prefs: number[][],
  ): Map<string, PooledIllustration> {
    const map = new Map<string, PooledIllustration>();
    const n = pool.length;
    let cycleUsed = new Set<number>();
    let prev = -1;

    for (let si = 0; si < slides.length; si++) {
      const pref = prefs[si];
      let chosen = -1;

      // Idéal : image pertinente, hors cycle courant, différente de la précédente.
      for (const ii of pref) {
        if (ii !== prev && !cycleUsed.has(ii)) { chosen = ii; break; }
      }
      // Cycle épuisé (toutes les images déjà utilisées) → on recommence un cycle.
      if (chosen === -1) {
        cycleUsed = new Set();
        for (const ii of pref) {
          if (ii !== prev) { chosen = ii; break; }
        }
        if (chosen === -1) chosen = pref[0]; // bibliothèque d'une seule image
      }

      map.set(slides[si].key, pool[chosen]);
      cycleUsed.add(chosen);
      if (cycleUsed.size >= n) cycleUsed = new Set(); // cycle complet → réinitialise
      prev = chosen;
    }

    const distinct = new Set([...map.values()].map((i) => i.fileName)).size;
    console.log(
      `[ImageLibraryService] Couverture : ${map.size}/${slides.length} slide(s) illustrée(s), ${distinct}/${n} image(s) distinctes utilisées.`,
    );
    return map;
  }

  /**
   * Affinage sémantique par le LLM : pour chaque slide, renvoie jusqu'à 3 images
   * les plus pertinentes par le SENS du texte (ordre décroissant, réutilisation
   * autorisée entre slides — l'espacement est géré au placement). null si indisponible.
   */
  private async llmRankSlides(
    slides: SlideContext[],
    pool: PooledIllustration[],
  ): Promise<number[][] | null> {
    const apiKey = (getSettings().openaiApiKey || '').trim();
    if (!apiKey) return null;
    // Timeout + retries bornés : l'attribution ne doit JAMAIS figer la génération.
    const openai = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 1 });

    const imagesBlock = pool
      .map((img, i) => {
        const tags = img.tags.length ? ` | tags: ${img.tags.join(', ')}` : '';
        const desc = img.description ? ` | ${img.description.slice(0, 200)}` : '';
        return `#${i} ${img.nom}${desc}${tags}`;
      })
      .join('\n');

    const slidesBlock = slides
      .map((s, i) => `#${i} [${s.title}] ${s.text.replace(/\s+/g, ' ').slice(0, 320)}`)
      .join('\n');

    const system =
      "Tu es responsable de l'illustration d'un mémoire technique de sécurité privée (société GSS). " +
      "On te donne une BIBLIOTHÈQUE d'images (index, nom, description, tags) et une liste de SLIDES " +
      "(index, titre, extrait du texte affiché). Pour CHAQUE slide, classe les images par pertinence " +
      "de SENS avec le contenu de la slide.\n" +
      "RÈGLES :\n" +
      "1. Donne jusqu'à 3 images par slide, la plus pertinente en premier (index uniquement).\n" +
      "2. N'inclus QUE des images réellement en rapport avec le sujet de la slide ; liste vide si aucune.\n" +
      "3. Une même image peut apparaître pour plusieurs slides (l'espacement est géré ensuite).\n" +
      'Réponds STRICTEMENT en JSON : {"rankings":[{"slide":<index>,"images":[<index>,...]}]}.';

    const user = `BIBLIOTHÈQUE (${pool.length} images) :\n${imagesBlock}\n\nSLIDES (${slides.length}) :\n${slidesBlock}`;

    const completion = await openai.chat.completions.create({
      model: MATCH_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const raw = completion.choices[0]?.message?.content || '';
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const rankings: any[] = Array.isArray(parsed?.rankings) ? parsed.rankings : [];
    if (rankings.length === 0) return null;

    const out: number[][] = slides.map(() => []);
    for (const r of rankings) {
      const si = Number(r?.slide);
      if (!Number.isInteger(si) || si < 0 || si >= slides.length) continue;
      const imgs = Array.isArray(r?.images) ? r.images : [];
      const clean: number[] = [];
      for (const raw of imgs) {
        const ii = Number(raw);
        if (Number.isInteger(ii) && ii >= 0 && ii < pool.length && !clean.includes(ii)) {
          clean.push(ii);
        }
        if (clean.length >= 3) break;
      }
      out[si] = clean;
    }
    const covered = out.filter((x) => x.length > 0).length;
    console.log(`[ImageLibraryService] Affinage LLM : ${covered}/${slides.length} slide(s) avec suggestion sémantique.`);
    return out;
  }

  /** Images destinées à l'insertion dans les mémoires (type insertion | les_deux). */
  private async fetchInsertableImages(): Promise<ImageRow[]> {
    const supabase = getScopedClient();
    const { data, error } = await supabase
      .from('images')
      .select('id, nom, description, storage_path, type, tags')
      .in('type', ['insertion', 'les_deux']);
    if (error) throw new Error(error.message);
    return (data as ImageRow[]) || [];
  }

  /** Télécharge les octets d'une image depuis le bucket privé images-library. */
  private async download(storagePath: string): Promise<Buffer> {
    const supabase = getScopedClient();
    const dl = supabase.storage.from(IMAGES_BUCKET).download(storagePath);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout après ${DOWNLOAD_TIMEOUT_MS} ms`)), DOWNLOAD_TIMEOUT_MS),
    );
    const { data, error } = await Promise.race([dl, timeout]);
    if (error || !data) throw new Error(error?.message || 'fichier vide');
    return Buffer.from(await data.arrayBuffer());
  }

  /** Jetons pondérés d'une image (tags > nom > description). */
  private imageKeywords(img: ImageRow): Array<[string, number]> {
    const weights = new Map<string, number>();
    const add = (tokens: string[], weight: number) => {
      for (const t of tokens) {
        weights.set(t, Math.max(weights.get(t) || 0, weight));
      }
    };
    add((img.tags || []).flatMap(tokenize), WEIGHT_TAG);
    add(tokenize(img.nom), WEIGHT_NAME);
    add(tokenize(img.description || ''), WEIGHT_DESC);
    return [...weights.entries()];
  }
}

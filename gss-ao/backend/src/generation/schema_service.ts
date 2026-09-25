import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import OpenAI from 'openai';
import { getSettings } from '../core/config';

/**
 * Schémas GSS du mémoire technique : UN schéma par page de contenu.
 *
 * Pour chaque page, l'IA lit le sujet de la section et le texte exact de la page, choisit
 * le format le plus adapté (procédure, étoile, cycle, organigramme, tableau, camembert,
 * barres…) et en extrait le contenu. Le dessin est réalisé par le moteur de la planche
 * validée par GSS (python/schemas_gss) : mêmes gabarits, mêmes couleurs, même police.
 *
 * Garde-fous (bloquants, côté moteur) : chaque chiffre doit figurer dans le texte de la
 * page, chaque mot dans la page ou dans le vocabulaire GSS validé (ni invention, ni faute),
 * aucun texte ne doit déborder. Une spécification refusée est renvoyée à l'IA avec les
 * erreurs (2 nouvelles tentatives). En dernier recours, la page reçoit un schéma validé de
 * la bibliothèque GSS pour la même section : il y a donc toujours un schéma par page.
 */

const SCHEMA_MODEL = process.env.SCHEMA_MODEL || 'gpt-5.6-luna';
const MAX_ESSAIS = 4;
const CONCURRENCE = 6;
const OPENAI_TIMEOUT_MS = 120_000;
const MOTEUR_DIR = path.resolve(__dirname, '../../python/schemas_gss');
const SCRIPT = path.join(MOTEUR_DIR, 'rendu_schemas.py');

export interface PageSchema {
  /** Clé de slide (identique à MarpGenerator.enumerateContentSlides). */
  key: string;
  sectionId?: string;
  sectionTitle: string;
  text: string;
}

interface Resultat { id: string; ok: boolean; svg?: string; erreurs?: string[]; bibliotheque_id?: string }

const SYSTEM_PROMPT = `Tu conçois le schéma d'UNE page du mémoire technique de GSS (Global Security Services, sécurité privée).
Tu reçois le titre de la section et le texte EXACT de la page. Tu choisis le gabarit le plus adapté au propos de la page et tu en extrais le contenu.

RÈGLES DE FOND (impératives, contrôlées automatiquement) :
- Reprends UNIQUEMENT des informations écrites dans la page. N'invente rien : ni étape, ni chiffre, ni délai, ni nom.
- Chaque chiffre du schéma doit figurer tel quel dans le texte de la page. S'il n'y a pas de chiffres dans la page, n'utilise pas les gabarits chiffres, barres, camembert ou jauge.
- Utilise les mots exacts du texte (orthographe et accents identiques). Libellés courts et professionnels, en français, style GSS.
- Recopie les mots tels qu'ils sont écrits dans la page (même conjugaison, mêmes accords) : ne reformule pas avec des mots absents de la page.
- Écris en minuscules avec une majuscule initiale accentuée si nécessaire (« Écoute », « État »), jamais tout en capitales sauf sigles (SSIAP, CNAPS, PTI…).
- LONGUEURS MAXIMALES (en caractères, espaces compris) : titre de carte 36 ; texte de carte 90 ; condition sur flèche 30 ; point de liste 80 ; sous-élément d'organigramme 44 ; titre du centre 40 ; titre_court 18.
- Titres de carte : 1 à 4 mots. Textes : une phrase courte (12 mots maximum).
- Ne numérote que ce qui est réellement une suite ordonnée (procédure, chronologie). Sinon : grille, étoile, comparatif ou liste.
- Respecte l'ordre et la logique décrits dans la page (déclencheur → actions → issue). Ne commence pas une procédure par une étape que la page ne place pas en premier.
- Chaque carte apporte une information : le texte ne répète jamais le titre.

RÈGLE DE COULEUR GSS (champ "role", toujours la même signification) :
- "bleu" : un contrôle, une vérification ;
- "orange" : une action ;
- "rouge" : un déclencheur, un incident, une non-conformité ;
- "vert" : une issue, un résultat, un engagement environnemental ;
- "sable", "creme", "or" : la structure (organisation, catégories, équipements, préparation).

GABARITS (champ "gabarit") et format de "params" :
- "flux" : procédure ordonnée. {"etapes":[{"titre","texte","role","icone"}] (2 à 5), "conditions":[{"apres_etape":n,"texte","role"}] (facultatif, condition posée sur la flèche après l'étape n), "issues":[{"sous_etape":n,"titre","texte","role","condition"}] (facultatif, branche sous l'étape n)}
- "chevrons" : 3 ou 4 phases successives. {"etapes":[{"titre","texte","role"}]}
- "grille" : éléments de même nature, sans ordre. {"cartes":[{"titre","texte","role","icone"}] (3 à 9)}
- "etoile" : un sujet central et ses composantes. {"centre":{"titre","sous_titre"},"branches":[{"titre","texte","role","icone"}] (3 à 7)}
- "cycle" : démarche qui boucle (amélioration continue…). {"centre":{"titre","sous_titre"},"etapes":[{"titre","titre_court","texte","role"}] (3 ou 4)}
- "pyramide" : niveaux hiérarchiques, du sommet à la base. {"niveaux":[{"titre","titre_court","texte","role"}] (3 à 5)}
- "arbre" : organigramme ou arborescence. {"racine":{"titre","texte","role","icone"},"branches":[{"titre","texte","role","sous_elements":["…"]}] (2 à 4)}
- "comparatif" : 2 ou 3 options côte à côte. {"colonnes":[{"titre","sous_titre","role","icone","points":["…"]}], "alternative":true si les options s'excluent}
- "checklist" : points de contrôle ou exigences. {"groupes":[{"titre","sous_titre","role","icone","points":["…"]}] (1 à 3)}
- "matrice" : tableau (qui fait quoi, fréquences). {"lignes":["…"],"colonnes":["…"],"cellules":[["texte court" | true | ""]]}
- "frise" : chronologie datée (J-30, J+7…). {"jalons":[{"date","titre","texte","role"}] (3 à 7)}
- "chiffres" : chiffres clés écrits dans la page. {"chiffres":[{"valeur":"texte court","libelle","role","icone"}] (2 à 6), "note"}
- "barres" : comparaison de valeurs chiffrées de la page. {"barres":[{"libelle","valeur":nombre,"role"}] (2 à 8), "unite", "note"}
- "camembert" : répartition d'un TOTAL écrit dans la page. {"parts":[{"libelle","valeur":nombre,"role"}], "total":nombre (écrit dans la page, égal à la somme), "libelle_total"}
- "jauge" : délais ou seuils sur une échelle. {"reperes":[{"valeur":nombre,"titre","texte","role"}] (2 à 4), "unite", "note"}
- "fiche" : référence client. {"nom","lieu","secteur","icone","chiffres":[{"valeur","libelle"}],"missions":["…"]}
- "silhouette" : tenue d'agent annotée. {"tenue":"costume"|"intervention"|"ssiap","reperes":[{"titre","texte","role","zone"}]} zones : tete, col, torse, poitrine, bras, taille, jambes, pieds, epaules, main.

PICTOGRAMMES : n'utilise QUE ces noms exacts (champ "icone", facultatif) : __ICONES__.

Varie les formats d'une page à l'autre. Réponds UNIQUEMENT par un objet JSON {"gabarit": "...", "params": {...}}.`;

const ICONES = ['alerte', 'ampoule', 'ascenseur', 'badge', 'ballon', 'banque', 'batiment', 'bouclier', 'caddie', 'cadeau', 'cadenas',
  'calendrier', 'camera', 'camion', 'carte_pro', 'casque', 'chaussure', 'check', 'chien', 'cible', 'cle', 'coeur', 'compteur', 'croix',
  'detecteur', 'diplome', 'document', 'drone', 'echange', 'echelle', 'eclair', 'ecole', 'escalier', 'etoile', 'euro', 'extincteur', 'feu',
  'feuille', 'fumee', 'gilet', 'goutte', 'graphique', 'groupe', 'hopital', 'horloge', 'lampe', 'lieu', 'lit', 'loupe', 'mail', 'main',
  'marche', 'masque', 'monde', 'nacelle', 'oeil', 'ordinateur', 'oreille', 'papier', 'personne', 'pompier', 'porte', 'poubelle', 'prise',
  'recycle', 'reunion', 'route', 'sirene', 'tablette', 'talkie', 'tasse', 'tel', 'trottinette', 'usine', 'velo', 'voiture'];

function findPythonBin(): string | null {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const isWin = process.platform === 'win32';
  for (const bin of isWin ? ['py', 'python', 'python3'] : ['python3', 'python']) {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf-8', timeout: 5_000, shell: isWin, stdio: 'pipe' });
    if (!r.error && r.status === 0) return bin;
  }
  return null;
}

const MOTS = /[A-Za-zÀ-ÖØ-öø-ÿŒœ]+/g;
const motsDe = (t: string) => new Set((t.toLowerCase().match(MOTS) || []).filter((w) => w.length >= 4));

/** Préfixe les identifiants internes du SVG (plusieurs schémas dans un même document). */
function finaliserSvg(svg: string, prefixe: string): string {
  const p = prefixe.replace(/[^a-zA-Z0-9]/g, '');
  return svg
    .replace(/id="([^"]+)"/g, (_m, id) => `id="${p}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id) => `url(#${p}-${id})`)
    .replace('width="1200" height="660"', 'width="100%" preserveAspectRatio="xMidYMid meet"')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

/**
 * Secours : schémas VALIDÉS de la bibliothèque GSS (fichiers statiques, sans Python), même
 * section en priorité, meilleur recouvrement de vocabulaire avec la page, jamais deux fois le
 * même dans un mémoire. Les schémas propres à un marché (chiffres d'un client) sont exclus.
 */
function secoursBibliotheque(pages: PageSchema[]): Map<string, string> {
  const out = new Map<string, string>();
  let index: any[] = [];
  try {
    index = JSON.parse(fs.readFileSync(path.join(MOTEUR_DIR, 'bibliotheque', 'index.json'), 'utf-8'));
  } catch (e: any) {
    console.error(`[SchemaService] Bibliothèque GSS illisible : ${e?.message || e}`);
    return out;
  }
  const dispo = index.filter((x) => x.reutilisable);
  const utilises = new Set<string>();
  for (const p of pages) {
    const mots = motsDe(`${p.sectionTitle} ${p.text}`);
    const score = (x: any) => [...motsDe(`${x.titre} ${x.texte}`)].filter((w) => mots.has(w)).length;
    let cands = dispo.filter((x) => !utilises.has(x.id) && x.section === p.sectionId);
    if (!cands.length) cands = dispo.filter((x) => !utilises.has(x.id));
    if (!cands.length) cands = dispo;
    if (!cands.length) continue;
    const choix = cands.reduce((a, b) => (score(b) > score(a) ? b : a));
    utilises.add(choix.id);
    try {
      const svg = fs.readFileSync(path.join(MOTEUR_DIR, 'bibliotheque', `${choix.id}.svg`), 'utf-8');
      out.set(p.key, finaliserSvg(svg, `b${p.key}`));
    } catch (e: any) {
      console.error(`[SchemaService] Schéma ${choix.id} illisible : ${e?.message || e}`);
    }
  }
  return out;
}

/** Appelle le moteur Python (stdin JSON → stdout JSON), sans bloquer la boucle d'événements. */
function appelMoteur(python: string, requete: object): Promise<Resultat[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(python, [SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error('Moteur de schémas : délai dépassé')); }, 180_000);
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`Moteur de schémas (code ${code}) : ${err.slice(0, 400)}`));
      try { resolve(JSON.parse(out).resultats as Resultat[]); } catch (e: any) { reject(new Error(`Réponse du moteur illisible : ${e.message}`)); }
    });
    proc.stdin.end(JSON.stringify(requete));
  });
}

async function parLots<T>(items: T[], n: number, f: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await f(items[i++]);
  });
  await Promise.all(workers);
}

export class SchemaService {
  private openai: OpenAI | null;
  private python: string | null;

  constructor() {
    const key = getSettings().openaiApiKey;
    this.openai = key ? new OpenAI({ apiKey: key, timeout: OPENAI_TIMEOUT_MS }) : null;
    this.python = findPythonBin();
    if (!this.python) console.error('[SchemaService] Python introuvable : schémas de la bibliothèque GSS uniquement.');
  }

  /** Construit un schéma par page. Renvoie la carte clé de slide → SVG (une ligne, identifiants uniques). */
  public async construirePourPages(pages: PageSchema[], onProgress?: (msg: string) => void): Promise<Map<string, string>> {
    const resultat = new Map<string, string>();
    const aSecourir: PageSchema[] = [];

    // Pages d'une même section traitées dans l'ordre (pour varier les formats), sections en parallèle.
    const parSection = new Map<string, PageSchema[]>();
    for (const p of pages) {
      const k = p.key.split('_').slice(0, 2).join('_');
      if (!parSection.has(k)) parSection.set(k, []);
      parSection.get(k)!.push(p);
    }
    let faits = 0;
    await parLots([...parSection.values()], CONCURRENCE, async (groupe) => {
      const utilises: string[] = [];
      for (const page of groupe) {
        const r = await this.construireUne(page, utilises);
        if (r) {
          resultat.set(page.key, r.svg);
          utilises.push(r.gabarit);
        } else {
          aSecourir.push(page);
        }
        faits++;
        onProgress?.(`Schémas : ${faits}/${pages.length} pages`);
      }
    });

    if (aSecourir.length > 0) {
      console.warn(`[SchemaService] ${aSecourir.length} page(s) sans schéma conforme → schéma validé de la bibliothèque GSS.`);
      for (const [k, svg] of secoursBibliotheque(aSecourir)) resultat.set(k, svg);
    }
    console.log(`[SchemaService] ${resultat.size}/${pages.length} page(s) illustrée(s) (${pages.length - aSecourir.length} schéma(s) construits, ${aSecourir.length} issus de la bibliothèque).`);
    return resultat;
  }

  private async construireUne(page: PageSchema, dejaUtilises: string[]): Promise<{ svg: string; gabarit: string } | null> {
    if (!this.openai || !this.python) return null;
    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT.replace('__ICONES__', ICONES.join(', ')) },
      {
        role: 'user',
        content: `Section : ${page.sectionTitle}\n` +
          (dejaUtilises.length ? `Gabarits déjà utilisés sur les pages précédentes de cette section (à éviter si possible) : ${dejaUtilises.slice(-3).join(', ')}\n` : '') +
          `\nTexte de la page :\n"""\n${page.text}\n"""`,
      },
    ];
    for (let essai = 1; essai <= MAX_ESSAIS; essai++) {
      let spec: any;
      try {
        const c = await this.openai.chat.completions.create({
          model: SCHEMA_MODEL,
          response_format: { type: 'json_object' },
          messages,
        });
        const brut = c.choices[0]?.message?.content || '{}';
        messages.push({ role: 'assistant', content: brut });
        spec = JSON.parse(brut);
      } catch (e: any) {
        console.warn(`[SchemaService] ${page.key} essai ${essai} : appel IA en échec (${e?.message || e}).`);
        if (e?.status === 429) await new Promise((r) => setTimeout(r, 15_000 * essai));
        continue;
      }
      let r: Resultat | undefined;
      try {
        [r] = await appelMoteur(this.python, {
          mode: 'rendre',
          schemas: [{ id: page.key, gabarit: spec?.gabarit, params: spec?.params, source: page.text, titre_section: page.sectionTitle }],
        });
      } catch (e: any) {
        console.error(`[SchemaService] ${page.key} : moteur de schémas en échec (${e?.message || e}).`);
        return null;
      }
      if (r?.ok && r.svg) return { svg: r.svg, gabarit: String(spec.gabarit) };
      const erreurs = r?.erreurs || ['Spécification refusée.'];
      console.warn(`[SchemaService] ${page.key} essai ${essai} refusé : ${erreurs.slice(0, 3).join(' | ')}`);
      messages.push({ role: 'user', content: `Ce schéma est refusé :\n- ${erreurs.join('\n- ')}\nCorrige-le (ou change de gabarit) et renvoie l'objet JSON complet.` });
    }
    return null;
  }
}

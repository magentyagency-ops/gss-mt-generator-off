import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import OpenAI from 'openai';
import { getSettings } from '../core/config';
import { reglagesIA, prefixeEnCache } from '../core/modeles_ia';
import { themeActif, estRetourArriere, envTheme, schemasBibliotheque, FormatSchema } from './themes';

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

const ESSAIS_LIBRES = 4;      // choix libre du gabarit, corrections guidées par les erreurs
const ESSAIS_SIMPLIFIES = 3;  // puis gabarits simples, contenu recopié de la page
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
Tu reçois le titre de la section et le texte EXACT de la page.

DÉMARCHE (consigne de GSS) : réfléchis d'abord à ce qui est pertinent à illustrer sur cette page, puis construis le schéma en conséquence.
1. Identifie le SUJET PRINCIPAL de la page : ce que le lecteur doit retenir (champ "sujet", une phrase courte).
2. Le schéma montre directement CE sujet, avec les éléments que la page en donne. Exemples :
   - une page qui parle des effectifs de GSS → un schéma qui montre les effectifs de GSS ;
   - une page qui parle des méthodes de protection → un schéma qui montre les méthodes de protection de GSS.
   Jamais un détail secondaire, jamais un schéma décoratif ou générique.
3. Choisis le gabarit qui rend ce sujet le plus lisible (suite d'étapes → flux ; composantes → étoile ou grille ; hiérarchie → arbre ou pyramide ; comparaison → comparatif ; exigences → checklist ; chronologie → frise ; données chiffrées → voir la règle des graphiques).

RÈGLE DES GRAPHIQUES (histogramme, courbe, barres, camembert, taux, chiffres, jauge) : n'en utilise un QUE si la page contient réellement les données qu'il représente, écrites en chiffres, et que le graphique est la meilleure façon de montrer le sujet. Aucun quota : sur un mémoire, il peut y en avoir aucun, un ou plusieurs selon les pages.
Inversement, quand le sujet principal de la page EST un ensemble de quantités écrites dans la page (effectifs par catégorie, volumes, délais, taux), un graphique est le format attendu : c'est lui qui montre le mieux ce sujet.
- "colonnes" (histogramme) : comparer des quantités entre 2 à 7 catégories (effectifs par qualification, agents par site…).
- "courbe" : une évolution dans le temps, avec au moins 3 périodes datées ET une valeur écrite pour chacune. Jamais de période ou de valeur déduite.
- "barres" : même usage que "colonnes" quand les libellés sont longs.
- "camembert" : la répartition d'un total écrit dans la page.
- "pourcentages" : 1 à 4 taux écrits en % dans la page (taux de reprise, part…), chacun avec ce qu'il mesure. Jamais un objectif présenté comme un résultat.
- "chiffres" : quelques chiffres clés isolés ; "jauge" : des délais ou seuils sur une même échelle.

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
- "colonnes" : histogramme. {"colonnes":[{"libelle","valeur":nombre,"role"}] (2 à 7), "unite" (ex. "agents", en minuscules), "note"}
- "courbe" : évolution dans le temps. {"periodes":["…"] (3 à 8, dans l'ordre), "series":[{"libelle","role","valeurs":[un nombre par période]}] (1 ou 2), "unite", "note"}
- "pourcentages" : taux en anneaux. {"taux":[{"titre","texte","valeur":nombre entre 0 et 100,"role"}] (1 à 4), "note"}
- "jauge" : délais ou seuils sur une échelle. {"reperes":[{"valeur":nombre,"titre","texte","role"}] (2 à 4), "unite", "note"}
- "fiche" : référence client. {"nom","lieu","secteur","icone","chiffres":[{"valeur","libelle"}],"missions":["…"]}
- "silhouette" : tenue d'agent annotée. {"tenue":"costume"|"intervention"|"ssiap","reperes":[{"titre","texte","role","zone"}]} zones : tete, col, torse, poitrine, bras, taille, jambes, pieds, epaules, main.

PICTOGRAMMES : n'utilise QUE ces noms exacts (champ "icone", facultatif) : __ICONES__.

Varie les formats d'une page à l'autre. Réponds UNIQUEMENT par un objet JSON {"sujet": "...", "gabarit": "...", "params": {...}}.`;

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

/** Préfixe les identifiants internes du SVG (plusieurs schémas dans un même document). Toile paysage (1200 × 660) ou
 *  page (format page du thème) : largeur fluide. Sert aussi à préparer le schéma d'une page de schéma
 *  (AssembleSection.schemaPleinePage) à partir d'un SVG de la bibliothèque (themes.schemasBibliotheque). */
export function finaliserSvg(svg: string, prefixe: string): string {
  const p = prefixe.replace(/[^a-zA-Z0-9]/g, '');
  return svg
    .replace(/id="([^"]+)"/g, (_m, id) => `id="${p}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id) => `url(#${p}-${id})`)
    .replace('width="1200" height="660"', 'width="100%" preserveAspectRatio="xMidYMid meet"')
    .replace(/(<svg\b[^>]*?) width="[\d.]+" height="[\d.]+"/, '$1 width="100%" preserveAspectRatio="xMidYMid meet"')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

/**
 * Secours : schémas VALIDÉS de la bibliothèque GSS (fichiers statiques, sans Python), même
 * section en priorité, meilleur recouvrement de vocabulaire avec la page, jamais deux fois le
 * même dans un mémoire. Les schémas propres à un marché (chiffres d'un client) sont exclus.
 */
function secoursBibliotheque(pages: PageSchema[], format: FormatSchema = 'paysage', theme: string = themeActif()): Map<string, string> {
  const out = new Map<string, string>();
  let index: any[] = [];
  try {
    index = JSON.parse(fs.readFileSync(path.join(MOTEUR_DIR, 'bibliotheque', 'index.json'), 'utf-8'));
  } catch (e: any) {
    console.error(`[SchemaService] Bibliothèque GSS illisible : ${e?.message || e}`);
    return out;
  }
  // Contenu daté (Covid) ou propre à un autre secteur : jamais repris hors de sa propre rubrique.
  const DATE_OU_SECTEUR = /covid|hydroalcool|gestes barri|pass sanitaire|magasin|caisse|transport de fonds|antivol|prospection|commercial/i;
  const dispo = index.filter((x) => x.reutilisable && !/covid|hydroalcool|gestes barri|pass sanitaire/i.test(`${x.titre} ${x.texte}`));
  const utilises = new Set<string>();
  const choix: Array<{ page: PageSchema; id: string }> = [];
  for (const p of pages) {
    const mots = motsDe(`${p.sectionTitle} ${p.text}`);
    const score = (x: any) => [...motsDe(`${x.titre} ${x.texte}`)].filter((w) => mots.has(w)).length;
    let cands = dispo.filter((x) => !utilises.has(x.id) && x.section === p.sectionId);
    // Hors de sa rubrique, un schéma doit parler du même sujet que la page : jamais une référence client
    // ni un contenu d'un autre secteur (ex. « gel hydroalcoolique » d'un magasin dans les plannings d'un hôpital).
    if (!cands.length) {
      cands = dispo.filter((x) => !utilises.has(x.id) && x.section !== 'b_references'
        && !DATE_OU_SECTEUR.test(`${x.titre} ${x.texte}`) && score(x) >= 3);
    }
    if (!cands.length) continue;
    const retenu = cands.reduce((a, b) => (score(b) > score(a) ? b : a));
    utilises.add(retenu.id);
    choix.push({ page: p, id: retenu.id });
  }
  // Thème de style : schémas de la bibliothèque redessinés dans le thème (format demandé) ; retour arrière : originaux.
  const themes = estRetourArriere(theme) ? null : schemasBibliotheque(choix.map((c) => c.id), format, theme);
  for (const { page: p, id } of choix) {
    try {
      const svg = themes?.get(id) ?? fs.readFileSync(path.join(MOTEUR_DIR, 'bibliotheque', `${id}.svg`), 'utf-8');
      out.set(p.key, finaliserSvg(svg, `b${p.key}`));
    } catch (e: any) {
      console.error(`[SchemaService] Schéma ${id} illisible : ${e?.message || e}`);
    }
  }
  return out;
}

/** Appelle le moteur Python (stdin JSON → stdout JSON), sans bloquer la boucle d'événements, dans le thème donné. */
function appelMoteur(python: string, requete: object, theme: string = themeActif()): Promise<Resultat[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(python, [SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'], shell: process.platform === 'win32', env: envTheme(theme) });
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

  /** Construit un schéma par page. Renvoie la carte clé de slide → SVG (une ligne, identifiants uniques).
   *  opts.format : « paysage » (par défaut, schéma sous le texte) ou « page » (1 schéma = 1 page A4 portrait) ;
   *  opts.theme : thème de style (par défaut GSS_THEME / style par défaut, voir themes.ts). */
  public async construirePourPages(pages: PageSchema[], onProgress?: (msg: string) => void, opts: { format?: FormatSchema; theme?: string } = {}): Promise<Map<string, string>> {
    const format: FormatSchema = opts.format === 'page' ? 'page' : 'paysage';
    const theme = themeActif(opts.theme);
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
        const r = await this.construireUne(page, utilises, format, theme);
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
      for (const [k, svg] of secoursBibliotheque(aSecourir, format, theme)) resultat.set(k, svg);
    }
    console.log(`[SchemaService] ${resultat.size}/${pages.length} page(s) illustrée(s) (${pages.length - aSecourir.length} schéma(s) construits, ${aSecourir.length} issus de la bibliothèque).`);
    return resultat;
  }

  private async construireUne(page: PageSchema, dejaUtilises: string[], format: FormatSchema = 'paysage', theme: string = themeActif()): Promise<{ svg: string; gabarit: string } | null> {
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
    for (let essai = 1; essai <= ESSAIS_LIBRES + ESSAIS_SIMPLIFIES; essai++) {
      if (essai === ESSAIS_LIBRES + 1) {
        // Rattrapage : gabarits simples et robustes, contenu recopié mot pour mot, toujours sur le sujet de la page.
        messages.push({
          role: 'user',
          content: 'Reprends le schéma de cette page avec un gabarit simple parmi "grille", "checklist", "chevrons" ou "etoile", ' +
            'toujours centré sur le sujet principal de la page. Pour chaque élément, recopie MOT POUR MOT un court passage de la page ' +
            '(titres de 1 à 3 mots, textes de 12 mots maximum), sans chiffre absent de la page, sans pictogramme hors liste. Renvoie l\'objet JSON complet.',
        });
      }
      let spec: any = null;
      // Les erreurs d'API (limite de débit 429, réseau) sont réessayées sans consommer d'essai de schéma.
      for (let appel = 1; appel <= 5 && spec === null; appel++) {
        try {
          // Modèle et effort : core/modeles_ia.ts ; la consigne système, identique pour toutes les pages, est mise en cache.
          const c = await this.openai.chat.completions.create({
            ...reglagesIA('redaction'),
            response_format: { type: 'json_object' },
            messages: prefixeEnCache(messages, 0),
          });
          const brut = c.choices[0]?.message?.content || '{}';
          try {
            spec = JSON.parse(brut);
            messages.push({ role: 'assistant', content: brut });
          } catch {
            console.warn(`[SchemaService] ${page.key} : réponse IA non JSON, nouvel appel.`);
          }
        } catch (e: any) {
          const attente = (e?.status === 429 ? 15_000 : 5_000) * appel;
          console.warn(`[SchemaService] ${page.key} : appel IA en échec (${e?.status || ''} ${e?.message || e}), nouvel essai dans ${attente / 1000} s.`);
          await new Promise((r) => setTimeout(r, attente));
        }
      }
      if (spec === null) return null;
      let r: Resultat | undefined;
      try {
        [r] = await appelMoteur(this.python, {
          mode: 'rendre',
          format,
          schemas: [{ id: page.key, gabarit: spec?.gabarit, params: spec?.params, source: page.text, titre_section: page.sectionTitle }],
        }, theme);
      } catch (e: any) {
        console.error(`[SchemaService] ${page.key} : moteur de schémas en échec (${e?.message || e}).`);
        return null;
      }
      if (r?.ok && r.svg) {
        console.log(`[SchemaService] ${page.key} (${spec.gabarit}, essai ${essai}) : ${String(spec?.sujet || '').slice(0, 100)}`);
        return { svg: r.svg, gabarit: String(spec.gabarit) };
      }
      const erreurs = r?.erreurs || ['Spécification refusée.'];
      console.warn(`[SchemaService] ${page.key} essai ${essai} refusé : ${erreurs.slice(0, 3).join(' | ')}`);
      messages.push({ role: 'user', content: `Ce schéma est refusé :\n- ${erreurs.join('\n- ')}\nCorrige-le (ou change de gabarit) et renvoie l'objet JSON complet.` });
    }
    return null;
  }
}

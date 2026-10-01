// ════════════════════════════════════════════════════════════════════════════════════════
// MODÈLES OPENAI — choix centralisé (coût / qualité)
// ════════════════════════════════════════════════════════════════════════════════════════
// Un seul endroit pour le modèle et l'effort de raisonnement de chaque usage. Les valeurs par défaut
// sont dans le code ; chaque réglage peut être surchargé, FACULTATIVEMENT, par une variable
// d'environnement (aucune n'est obligatoire, le .env n'a pas à être modifié) :
//   GSS_IA_MODELE            modèle de tous les usages                                (défaut : gpt-6-luna)
//   GSS_IA_EFFORT            effort de tous les usages                                (défaut : effort par usage)
//   GSS_IA_EFFORT_REDACTION  rédaction, adaptation, contrôles, cadre, schémas, assistant (défaut : low)
//   GSS_IA_EFFORT_ANALYSE    analyse du DCE, exigences, format imposé, propositions    (défaut : medium)
//   GSS_IA_EFFORT_MECANIQUE  OCR, description de photo, évaluation d'une réponse courte (défaut : none)
//   GSS_IA_CACHE             « implicite » : cache de prompt implicite d'OpenAI, sans point d'arrêt
//                            (défaut : explicite sur GPT-5.6 et suivants)
//   GSS_IA_SERVICE_TIER      niveau de service OpenAI (défaut : « flex » pour gpt-6-luna, −50 % sur tous les jetons,
//                            réponses plus lentes ; « standard » pour le désactiver)
// L'effort propre à un usage (GSS_IA_EFFORT_<USAGE>) l'emporte sur GSS_IA_EFFORT.
//
// Retour à l'état antérieur (gpt-5.6-luna, effort par défaut « medium », cache implicite) :
//   GSS_IA_MODELE=gpt-5.6-luna GSS_IA_EFFORT=medium GSS_IA_CACHE=implicite
//
// Température : jamais envoyée à un modèle à raisonnement (gpt-5*, gpt-6*, o*), qui ne l'accepte pas ;
// la température d'origine de chaque appel est réappliquée si l'on revient à un modèle sans
// raisonnement (gpt-4.1, gpt-4o…).
// Cache (GPT-5.6 et suivants) : en mode implicite, OpenAI écrit TOUT le prompt en cache à 1,25 × le prix
// d'entrée, alors que les prompts GSS ne sont presque jamais relus. Le mode explicite n'écrit que les
// préfixes stables marqués par prefixeEnCache() (relus ensuite à 0,1 ×) ; le reste est facturé 1 ×.
import './config'; // charge le .env avant toute lecture de process.env
import OpenAI from 'openai';

export type UsageIA = 'redaction' | 'analyse' | 'mecanique';
type Effort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const MODELE_PAR_DEFAUT = 'gpt-6-luna';
const EFFORT_PAR_DEFAUT: Record<UsageIA, Effort> = { redaction: 'low', analyse: 'medium', mecanique: 'none' };
const EFFORTS: Effort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

const env = (nom: string) => (process.env[nom] || '').trim();

const signales = new Set<string>();
/** Avertit une seule fois d'une valeur de variable d'environnement non reconnue. */
function signaler(nom: string, valeur: string, repli: string) {
  const cle = `${nom}=${valeur}`;
  if (signales.has(cle)) return;
  signales.add(cle);
  console.warn(`[ModelesIA] ${nom}="${valeur}" non reconnu : « ${repli} » utilisé.`);
}

/** Modèle OpenAI de rédaction et d'analyse (un seul modèle pour tous les usages). */
export function modeleIA(): string {
  return env('GSS_IA_MODELE') || MODELE_PAR_DEFAUT;
}

function effortIA(usage: UsageIA): Effort {
  for (const nom of [`GSS_IA_EFFORT_${usage.toUpperCase()}`, 'GSS_IA_EFFORT']) {
    const v = env(nom).toLowerCase();
    if (!v) continue;
    if ((EFFORTS as string[]).includes(v)) return v as Effort;
    signaler(nom, v, EFFORT_PAR_DEFAUT[usage]);
  }
  return EFFORT_PAR_DEFAUT[usage];
}

/** Modèle à raisonnement (température non réglable, reasoning_effort accepté) : gpt-5*, gpt-6*, o1/o3/o4… */
const raisonne = (m: string) => /^(gpt-5|gpt-6|o\d)/i.test(m) && !/-chat/i.test(m);

/** GPT-5.6 et suivants : prompt_cache_options et prompt_cache_breakpoint disponibles. */
const cacheDisponible = (m: string) => /^gpt-(5\.([6-9]|\d\d)|[6-9]|\d\d)/i.test(m);

/** Vrai si les appels utilisent le cache explicite (modèle compatible et pas de retour au mode implicite). */
function cacheExplicite(): boolean {
  if (!cacheDisponible(modeleIA())) return false;
  const v = env('GSS_IA_CACHE').toLowerCase();
  if (v === 'implicite' || v === 'implicit') return false;
  if (v && v !== 'explicite' && v !== 'explicit') signaler('GSS_IA_CACHE', v, 'explicite');
  return true;
}

/** Effort accepté par la famille du modèle (évite une erreur 400 si l'on change de modèle par l'environnement). */
function effortCompatible(m: string, e: Effort): Effort {
  if (/^o\d/i.test(m)) return e === 'none' || e === 'minimal' ? 'low' : e === 'xhigh' || e === 'max' ? 'high' : e;
  if (/^gpt-5(-mini|-nano)?(-\d{4}-\d{2}-\d{2})?$/i.test(m)) return e === 'none' ? 'minimal' : e === 'xhigh' || e === 'max' ? 'high' : e;
  if (e === 'minimal') return 'low';   // gpt-5.1 et suivants, gpt-6 : « minimal » n'est pas accepté
  if (e === 'none' && /^gpt-6-astra|^gpt-6\.1-sol/i.test(m)) return 'low';
  if (e === 'max' && /^gpt-5\.[1-5](?!\d)/i.test(m)) return 'xhigh';
  return e;
}

export interface ReglagesIA { model: string; [parametre: string]: any }

/**
 * Paramètres à étaler dans chat.completions.create({ ...reglagesIA(usage), messages, … }) :
 * - modèle à raisonnement : reasoning_effort de l'usage, aucune température ;
 * - autre modèle (gpt-4.1, gpt-4o) : la température d'origine de l'appel (opts.temperature) ;
 * - GPT-5.6 et suivants : cache en mode explicite (seuls les préfixes marqués par prefixeEnCache sont écrits).
 */
export function reglagesIA(usage: UsageIA, opts: { temperature?: number } = {}): ReglagesIA {
  const model = modeleIA();
  const r: ReglagesIA = { model };
  if (raisonne(model)) r.reasoning_effort = effortCompatible(model, effortIA(usage));
  else if (opts.temperature !== undefined) r.temperature = opts.temperature;
  if (cacheExplicite()) r.prompt_cache_options = { mode: 'explicit' };
  const tier = niveauService(model);
  if (tier) r.service_tier = tier;
  return r;
}

/**
 * Niveau de service : « flex » par défaut pour gpt-6-luna (même modèle, même qualité, prix divisé par 2,
 * réponses plus lentes et mises en file d'attente). GSS_IA_SERVICE_TIER=standard le désactive ; toute autre
 * valeur est transmise telle quelle à l'API.
 */
function niveauService(model: string): string {
  const v = env('GSS_IA_SERVICE_TIER').toLowerCase();
  if (v === 'standard' || v === 'aucun' || v === 'non') return '';
  if (v) return v;
  return /^gpt-6-luna/i.test(model) ? 'flex' : '';
}

// ── Repli automatique du niveau Flex ─────────────────────────────────────────────────────────
// En Flex, OpenAI peut répondre « ressource indisponible » (429) ou laisser la requête en file d'attente :
// l'appel est alors refait une fois en niveau standard (coût normal pour CET appel seulement), avec un délai
// d'attente allongé à 15 minutes en Flex. Un crédit épuisé (insufficient_quota) n'est jamais réessayé.
// Le repli est posé une seule fois sur le SDK : il vaut pour tous les clients OpenAI du serveur.
const FLEX_DELAI_MS = 15 * 60 * 1000;
{
  const proto: any = Object.getPrototypeOf(new OpenAI({ apiKey: 'sans-cle' }).chat.completions);
  if (!proto.__repliFlexGss) {
    const creer = proto.create;
    proto.create = function (corps: any, options?: any) {
      if (!corps || corps.service_tier !== 'flex' || corps.stream) return creer.call(this, corps, options);
      const opts = { ...(options || {}), timeout: Math.max(options?.timeout || 0, FLEX_DELAI_MS) };
      const appel = creer.call(this, corps, opts);
      const repli = async () => {
        try {
          return await appel;
        } catch (e: any) {
          const code = e?.code || e?.error?.code || '';
          const quota = /insufficient_quota|credit_balance/i.test(`${code} ${e?.message || ''}`);
          const flexIndisponible = (e?.status === 429 && !quota) || /timed? ?out|timeout/i.test(`${e?.name || ''} ${e?.message || ''}`);
          if (!flexIndisponible) throw e;
          console.warn(`[ModelesIA] Flex indisponible (${e?.status || e?.name || 'délai dépassé'}) : appel refait en niveau standard.`);
          const { service_tier: _niveau, ...standard } = corps;
          return creer.call(this, standard, options);
        }
      };
      // L'objet renvoyé par le SDK est une promesse enrichie (withResponse, asResponse) : on garde l'usage courant (await).
      return repli();
    };
    proto.__repliFlexGss = true;
  }
}

/**
 * Marque la fin du message n° i comme préfixe réutilisable (cache explicite) : son texte est écrit en
 * cache au premier appel puis relu à 0,1 × par les appels suivants qui commencent par le même préfixe
 * (30 minutes, 1 024 jetons au moins). Le texte envoyé est inchangé (même chaîne, sous forme de partie
 * de contenu). Sans effet en cache implicite, pour un modèle sans cache explicite, ou si le contenu
 * n'est pas une chaîne. Renvoie une copie : le tableau d'origine n'est pas modifié.
 */
export function prefixeEnCache<T extends { content?: any }>(messages: T[], i: number): T[] {
  if (!cacheExplicite() || typeof messages[i]?.content !== 'string') return messages;
  const copie = messages.slice();
  copie[i] = { ...messages[i], content: [{ type: 'text', text: messages[i].content, prompt_cache_breakpoint: { mode: 'explicit' } }] } as T;
  return copie;
}

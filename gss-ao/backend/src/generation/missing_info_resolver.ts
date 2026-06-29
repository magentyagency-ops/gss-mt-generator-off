// ════════════════════════════════════════════════════════════════════════════════════════
// RÉSOLUTION DES INFORMATIONS MANQUANTES — Brief §3 « Que faire s'il manque une information ? »
// ════════════════════════════════════════════════════════════════════════════════════════
// PISTE D'AMÉLIORATION — STUBS NON IMPLÉMENTÉS (présents pour figurer la feature, cf. cahier des
// charges « Outil Mémoire Technique », juin 2026).
//
// Principe (brief) : quand un champ ressort « [À COMPLÉTER] », l'outil NE DOIT PAS se bloquer. Selon
// la nature de l'information manquante :
//   🌐  PUBLIQUE  (ex. SIRET / adresse / forme juridique du CLIENT)  → la CHERCHER sur Internet et
//       l'insérer automatiquement dans le mémoire.
//   ✉️  INTERNE   (ex. nom du dirigeant GSS, n° d'agrément dirigeant) → la DEMANDER à l'équipe par
//       email ; dès que la personne répond, la réponse s'intègre au mémoire.
//
// État actuel : aucune des deux voies n'est branchée (pas de dépendance recherche web ni SMTP). Ces
// fonctions sont des points d'entrée typés + TODO, à implémenter lors d'une itération ultérieure.
// Désactivé par défaut côté pipeline (env RESOLVE_MISSING_INFO=true pour activer la passe — qui reste
// un no-op tant que les TODO ci-dessous ne sont pas implémentés).

/** Nature d'une information manquante (oriente vers web public ou demande interne). */
export type MissingInfoKind = 'public' | 'internal' | 'unknown';

/** Un champ resté « [À COMPLÉTER] » à l'issue de la génération. */
export interface MissingField {
  id: number;
  label: string;     // libellé/question du champ (ce qui est demandé)
  context: string;   // contexte complet du champ (section, tableau, etc.)
}

/** Résultat de résolution d'un champ manquant. */
export interface ResolvedInfo {
  id: number;
  value: string | null;                 // valeur trouvée (sinon null → reste [À COMPLÉTER])
  source: 'web' | 'team' | 'none';      // d'où vient la valeur
  pending?: boolean;                     // true si une demande équipe a été envoyée, en attente de réponse
}

/**
 * Classe une info manquante : PUBLIQUE (cherchable sur le web — identité du CLIENT/acheteur) vs
 * INTERNE (connue seulement d'un membre GSS — dirigeant, n° d'agrément dirigeant, coordonnées).
 * Heuristique de départ (affinable) ; sert à aiguiller vers searchPublicInfo ou requestInfoFromTeam.
 */
export function classifyMissingInfo(label: string, context = ''): MissingInfoKind {
  const n = `${label} ${context}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Identité d'une personne GSS / donnée interne → demande à l'équipe.
  if (/dirigeant|gerant|representant legal|agrement dirigeant|nom du signataire/.test(n)) return 'internal';
  // Identité administrative du CLIENT/acheteur → potentiellement publique (registre des entreprises).
  if (/(acheteur|client|donneur d.ordre).*(siret|siren|adresse|forme juridique|naf|ape)|siret|siren|kbis|forme juridique/.test(n)) return 'public';
  return 'unknown';
}

/**
 * [STUB] Recherche d'une information PUBLIQUE sur Internet (ex. SIRET/adresse du client via un registre
 * d'entreprises) et renvoie la valeur vérifiée, ou null si introuvable.
 * TODO: brancher une API de recherche (annuaire-entreprises / INSEE Sirene / moteur web) + extraction
 * et VÉRIFICATION de la valeur (pas d'insertion non vérifiée — cohérent avec la règle « 0 inventé »).
 */
export async function searchPublicInfo(_query: string): Promise<string | null> {
  // Non implémenté : aucune source web branchée pour l'instant.
  return null;
}

/**
 * [STUB] Envoie un email à l'équipe GSS pour obtenir une information INTERNE (ex. nom du dirigeant),
 * et crée un suivi ; à la réponse, la valeur devra être réinjectée dans le mémoire.
 * TODO: brancher un envoi SMTP (nodemailer) + un magasin de tickets (id de suivi) + un webhook/relance
 * pour intégrer la réponse au document une fois reçue.
 */
export async function requestInfoFromTeam(_field: MissingField, _dossierId: string): Promise<{ sent: boolean; ticketId?: string }> {
  // Non implémenté : pas d'envoi d'email branché pour l'instant.
  return { sent: false };
}

/**
 * Orchestrateur (brief §3) : pour chaque champ manquant, CLASSE l'info puis tente la résolution —
 * web (public) ou email équipe (interne). Tant que les voies ne sont pas implémentées, renvoie une
 * résolution vide (le champ reste « [À COMPLÉTER] ») : NON BLOQUANT, conforme au brief.
 */
export async function resolveMissingInfo(fields: MissingField[], dossierId: string): Promise<ResolvedInfo[]> {
  const out: ResolvedInfo[] = [];
  for (const f of fields) {
    const kind = classifyMissingInfo(f.label, f.context);
    if (kind === 'public') {
      const value = await searchPublicInfo(`${f.label}`);
      out.push({ id: f.id, value, source: value ? 'web' : 'none' });
    } else if (kind === 'internal') {
      const { sent } = await requestInfoFromTeam(f, dossierId);
      out.push({ id: f.id, value: null, source: 'none', pending: sent });
    } else {
      out.push({ id: f.id, value: null, source: 'none' });
    }
  }
  return out;
}

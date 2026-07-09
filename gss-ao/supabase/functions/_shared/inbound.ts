// ════════════════════════════════════════════════════════════════════════════════════════
// Réception e-mail entrant : vérification + extraction du question_id — Ticket #3 (§15)
// ════════════════════════════════════════════════════════════════════════════════════════
// Fonctions PURES (testables sans réseau ni Deno.serve) — le cœur du risque §15.
// Le rattachement doit être INFAILLIBLE : si le question_id est absent / inconnu / ambigu,
// on ne rattache RIEN. Ici on se limite à l'EXTRACTION robuste ; la décision de rattacher
// (lookup DB, unicité) est faite par la fonction inbound-email.

// question_id = 'q' + 16 hex (cf. migration generate_question_id).
export const QUESTION_ID_RE = /q[0-9a-f]{16}/i;

/**
 * Vérifie l'authenticité de la requête entrante (refuse tout non signé — §Sécurité).
 * Provider-agnostique pour ce spike : secret partagé attendu, transmis par le fournisseur
 * soit en HTTP Basic Auth (recommandé Postmark : URL https://user:pass@…), soit via l'en-tête
 * `x-inbound-secret`. Le secret vient de l'env INBOUND_WEBHOOK_SECRET (jamais en dur).
 *   → Mailgun/SendGrid signent en HMAC : brancher ici la vérif HMAC quand le fournisseur
 *     sera tranché (voir README, section « étapes manuelles »).
 */
export function verifyInboundAuth(headers: Headers, expectedSecret: string | undefined): boolean {
  if (!expectedSecret) return false; // pas de secret configuré → on refuse (fail-closed)

  const headerSecret = headers.get('x-inbound-secret');
  if (headerSecret && timingSafeEqual(headerSecret, expectedSecret)) return true;

  const auth = headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('basic ')) {
    try {
      const decoded = atob(auth.slice(6).trim());
      const pass = decoded.includes(':') ? decoded.slice(decoded.indexOf(':') + 1) : decoded;
      if (timingSafeEqual(pass, expectedSecret)) return true;
    } catch { /* ignore */ }
  }
  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export interface ParsedInbound {
  questionId: string | null;
  fromEmail: string | null;
  text: string;       // corps complet (sert à l'extraction du question_id / fallback référence)
  replyText: string;  // réponse NETTE à stocker (sans la citation) — StrippedTextReply ou fallback
  source: 'mailbox_hash' | 'plus_address' | 'body_reference' | 'ambiguous' | 'none';
}

// Extrait le premier question_id valide d'une chaîne (ou null).
function extractId(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /q[0-9a-f]{16}/i.exec(s);
  return m ? m[0].toLowerCase() : null;
}

// Fallback : coupe le corps à la 1re ligne de citation pour ne garder que la nouvelle réponse.
// Déclencheurs : ligne commençant par « > », ou en-tête de citation (« Le … a écrit : »,
// « On … wrote: », « -----Original Message----- », « De : … »).
function stripQuote(t: string): string {
  if (!t) return '';
  const attribution = /^\s*(le\s.+a\s*[ée]crit\s*:|on\s.+\bwrote:|-{2,}\s*original message|_{5,}|de\s*:\s.*<.+@)/i;
  const out: string[] = [];
  for (const line of t.split(/\r?\n/)) {
    if (/^\s*>/.test(line) || attribution.test(line)) break;
    out.push(line);
  }
  return out.join('\n').trim();
}

/**
 * Extrait le question_id d'un payload entrant — logique à DEUX NIVEAUX (règle §15 : « absent,
 * inconnu, ou ambigu → NE rattache RIEN »).
 *
 *  A. Identifiants AUTORITATIFS = l'adresse de LIVRAISON, non falsifiable par le corps :
 *       1. MailboxHash (Postmark découpe ao+<hash>@ → hash) ;
 *       2. plus-address ao+<question_id>@ dans To / ToFull / OriginalRecipient.
 *     • ≥ 2 id autoritatifs DISTINCTS  → AMBIGU → on ne rattache RIEN.
 *     • exactement 1 → on rattache (le corps ne peut PAS le contredire : un fil de discussion
 *       cité contenant d'autres id n'invalide pas une adresse de livraison sans équivoque).
 *
 *  B. Aucun id autoritatif → fallback sur le CORPS (« Référence de suivi » puis tout id isolé) :
 *     • ≥ 2 id distincts dans le corps → AMBIGU → rien ;
 *     • exactement 1 → on rattache (source body_reference) ;
 *     • aucun → source 'none'.
 *
 * `payload` est volontairement `any` : forme dépendante du fournisseur (schéma Postmark Inbound).
 */
export function parseInbound(payload: any): ParsedInbound {
  // Coercition défensive : un corps de type inattendu (e-mail malformé) est traité comme vide.
  const rawText = payload?.TextBody ?? payload?.StrippedTextReply ?? payload?.HtmlBody ?? '';
  const text: string = typeof rawText === 'string' ? rawText : '';
  const rawFrom = payload?.FromFull?.Email ?? payload?.From ?? null;
  const fromEmail: string | null = typeof rawFrom === 'string' ? rawFrom : null;
  // Réponse nette : privilégier StrippedTextReply de Postmark ; sinon couper la citation du corps.
  const stripped = payload?.StrippedTextReply;
  const replyText = (typeof stripped === 'string' && stripped.trim())
    ? stripped.trim()
    : stripQuote(text);
  const base = { fromEmail, text, replyText };

  // ── A. Sources autoritatives (adresse de livraison) ────────────────────────────
  const authoritative: { id: string; source: 'mailbox_hash' | 'plus_address' }[] = [];

  const hashId = extractId((payload?.MailboxHash ?? '').trim());
  if (hashId) authoritative.push({ id: hashId, source: 'mailbox_hash' });

  const recipients: string[] = [];
  if (Array.isArray(payload?.ToFull)) for (const r of payload.ToFull) if (r?.Email) recipients.push(r.Email);
  if (typeof payload?.To === 'string') recipients.push(payload.To);
  if (typeof payload?.OriginalRecipient === 'string') recipients.push(payload.OriginalRecipient);
  for (const addr of recipients) {
    const plus = /(?:^|<|[,;\s])ao\+([^@>\s]+)@/i.exec(addr);
    const id = plus ? extractId(plus[1]) : null;
    if (id) authoritative.push({ id, source: 'plus_address' });
  }

  const authDistinct = [...new Set(authoritative.map((c) => c.id))];
  if (authDistinct.length > 1) {
    return { questionId: null, source: 'ambiguous', ...base }; // conflit d'adresses → rien
  }
  if (authDistinct.length === 1) {
    const id = authDistinct[0];
    const src = authoritative.some((c) => c.source === 'mailbox_hash') ? 'mailbox_hash' : 'plus_address';
    return { questionId: id, source: src, ...base };
  }

  // ── B. Fallback corps (aucune adresse exploitable) ─────────────────────────────
  const bodyIds = new Set<string>();
  const refLine = /R[ée]f[ée]rence de suivi\s*:\s*.*?(q[0-9a-f]{16})/i.exec(text);
  if (refLine) bodyIds.add(refLine[1].toLowerCase());
  for (const m of text.matchAll(/q[0-9a-f]{16}/gi)) bodyIds.add(m[0].toLowerCase());

  const bodyDistinct = [...bodyIds];
  if (bodyDistinct.length > 1) return { questionId: null, source: 'ambiguous', ...base };
  if (bodyDistinct.length === 1) return { questionId: bodyDistinct[0], source: 'body_reference', ...base };

  return { questionId: null, source: 'none', ...base };
}

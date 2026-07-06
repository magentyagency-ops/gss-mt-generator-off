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
  text: string;
  source: 'mailbox_hash' | 'plus_address' | 'body_reference' | 'none';
}

/**
 * Extrait le question_id d'un payload entrant, par ordre de fiabilité :
 *   1. MailboxHash (Postmark découpe déjà ao+<hash>@… → hash = question_id) — le plus fiable.
 *   2. Adresse plus-addressée ao+<question_id>@… dans To / ToFull / OriginalRecipient.
 *   3. Fallback lisible : « Référence de suivi : … / <question_id> » dans le corps.
 * Renvoie questionId=null si rien d'exploitable (→ l'appelant ne rattache RIEN).
 *
 * `payload` est volontairement `any` : forme dépendante du fournisseur (ici schéma Postmark
 * Inbound ; les autres fournisseurs seront adaptés au branchement).
 */
export function parseInbound(payload: any): ParsedInbound {
  const text: string = payload?.TextBody ?? payload?.StrippedTextReply ?? payload?.HtmlBody ?? '';
  const fromEmail: string | null = payload?.FromFull?.Email ?? payload?.From ?? null;

  // 1. MailboxHash (Postmark)
  const hash = (payload?.MailboxHash ?? '').trim();
  if (hash && QUESTION_ID_RE.test(hash)) {
    const m = hash.match(QUESTION_ID_RE)!;
    return { questionId: m[0].toLowerCase(), fromEmail, text, source: 'mailbox_hash' };
  }

  // 2. Adresse plus-addressée dans les destinataires
  const recipients: string[] = [];
  if (Array.isArray(payload?.ToFull)) for (const r of payload.ToFull) if (r?.Email) recipients.push(r.Email);
  if (typeof payload?.To === 'string') recipients.push(payload.To);
  if (typeof payload?.OriginalRecipient === 'string') recipients.push(payload.OriginalRecipient);
  for (const addr of recipients) {
    const plus = /(?:^|<|[,;\s])ao\+([^@>\s]+)@/i.exec(addr);
    if (plus && QUESTION_ID_RE.test(plus[1])) {
      return { questionId: plus[1].match(QUESTION_ID_RE)![0].toLowerCase(), fromEmail, text, source: 'plus_address' };
    }
  }

  // 3. Fallback : « Référence de suivi » dans le corps
  const refLine = /R[ée]f[ée]rence de suivi\s*:\s*.*?(q[0-9a-f]{16})/i.exec(text);
  if (refLine) {
    return { questionId: refLine[1].toLowerCase(), fromEmail, text, source: 'body_reference' };
  }
  // Dernier recours : un question_id isolé quelque part dans le corps.
  const anywhere = QUESTION_ID_RE.exec(text);
  if (anywhere) {
    return { questionId: anywhere[0].toLowerCase(), fromEmail, text, source: 'body_reference' };
  }

  return { questionId: null, fromEmail, text, source: 'none' };
}

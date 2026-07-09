// ════════════════════════════════════════════════════════════════════════════════════════
// Abstraction fournisseur d'e-mail + gabarit §11 — Ticket #3
// ════════════════════════════════════════════════════════════════════════════════════════
// Le fournisseur réel n'est PAS encore tranché (dépendance §16 : Clarence fournit les clés).
// On code donc de façon AGNOSTIQUE et DÉBRANCHABLE : `EMAIL_PROVIDER` sélectionne l'impl.
//   • 'postmark' → implémentation de référence (sortant via l'API Postmark)
//   • absent / 'none' → DRY-RUN : rien n'est envoyé, on log le message composé (spike démontrable
//     sans clé). L'insertion en base + le passage de statut se font quand même.
// Aucune clé en dur : tout vient des secrets d'environnement (§14).

export interface OutgoingEmail {
  to: string;
  toName?: string;
  subject: string;
  textBody: string;
  replyTo: string; // ao+<question_id>@<domaine> — clé du rattachement
}

export interface SendResult {
  sent: boolean;
  provider: string;
  providerMessageId?: string;
  dryRun?: boolean;
  error?: string;
}

// ── Gabarit §11 (objet + corps EXACTEMENT selon le brief) ─────────────────────────────────
export interface TemplateInput {
  referenceAO: string;   // « Référence » de l'appel d'offres (objet)
  nomMarche: string;     // « Nom du marché » (corps)
  critereConcerne: string;
  question: string;
  dateLimite: string | null; // ISO date ; formatée FR pour l'affichage
  aoId: string;          // référence AO lisible pour la « Référence de suivi »
  questionId: string;    // identifiant unique de suivi/rattachement
  domaine: string;       // domaine entrant, pour Reply-To
}

const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function formatDateFR(iso: string | null): string {
  if (!iso) return '—';
  // iso attendu 'YYYY-MM-DD' ; format long FR « 12 juillet 2026 » sans dépendance externe.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const jour = parseInt(m[3], 10);
  const mois = MOIS_FR[parseInt(m[2], 10) - 1] ?? m[2];
  return `${jour} ${mois} ${m[1]}`;
}

export function composeQuestionEmail(t: TemplateInput): OutgoingEmail {
  // Date d'échéance : null/absente si pas de date_limite → on n'affiche pas « avant le … ».
  const dateFR = t.dateLimite ? formatDateFR(t.dateLimite) : null;

  // Objet — gabarit §11 (mention « — réponse avant le … » seulement si une date est fournie)
  const subject = dateFR
    ? `Information requise pour l'appel d'offres ${t.referenceAO} — réponse avant le ${dateFR}`
    : `Information requise pour l'appel d'offres ${t.referenceAO}`;

  // Corps — gabarit §11 (ton et structure du brief respectés)
  const textBody =
`Bonjour,

Nous préparons actuellement la réponse de GSS à l'appel d'offres ${t.nomMarche}. Une information interne est nécessaire pour compléter le critère ${t.critereConcerne}.

Question : ${t.question}

Merci de répondre directement à ce message${dateFR ? ` avant le ${dateFR}` : ''}. Votre réponse sera automatiquement intégrée au dossier puis validée par le responsable de l'appel d'offres.

Référence de suivi : ${t.aoId} / ${t.questionId}
`;

  return {
    to: '', // renseigné par l'appelant
    subject,
    textBody,
    replyTo: `ao+${t.questionId}@${t.domaine}`,
  };
}

// ── Envoi (dispatch selon EMAIL_PROVIDER) ─────────────────────────────────────────────────
export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const provider = (Deno.env.get('EMAIL_PROVIDER') || 'none').toLowerCase();

  if (provider === 'postmark') {
    return await sendViaPostmark(email);
  }

  // DRY-RUN par défaut : aucun fournisseur configuré → on log, on n'envoie pas.
  console.log('[email:dry-run] Aucun EMAIL_PROVIDER configuré — message NON envoyé (spike).');
  console.log('[email:dry-run] Reply-To =', email.replyTo);
  console.log('[email:dry-run] To =', email.to, '| Subject =', email.subject);
  console.log('[email:dry-run] Body:\n' + email.textBody);
  return { sent: false, provider: 'none', dryRun: true };
}

// ── Implémentation de référence : Postmark (débranchable) ─────────────────────────────────
async function sendViaPostmark(email: OutgoingEmail): Promise<SendResult> {
  const token = Deno.env.get('POSTMARK_SERVER_TOKEN');
  const from = Deno.env.get('EMAIL_FROM'); // ex. 'GSS Appels d'offres <ao@ao.gss-domaine.fr>'
  if (!token || !from) {
    return { sent: false, provider: 'postmark', error: 'POSTMARK_SERVER_TOKEN ou EMAIL_FROM manquant' };
  }
  try {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': token,
      },
      body: JSON.stringify({
        From: from,
        To: email.toName ? `${email.toName} <${email.to}>` : email.to,
        ReplyTo: email.replyTo,
        Subject: email.subject,
        TextBody: email.textBody,
        MessageStream: Deno.env.get('POSTMARK_MESSAGE_STREAM') || 'outbound',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { sent: false, provider: 'postmark', error: `HTTP ${res.status}: ${JSON.stringify(data)}` };
    }
    return { sent: true, provider: 'postmark', providerMessageId: data.MessageID };
  } catch (e) {
    return { sent: false, provider: 'postmark', error: String(e) };
  }
}

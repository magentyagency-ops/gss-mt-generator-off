#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════════════════
# Test d'intégration inbound-email sur des payloads simulés (Ticket #3, Phase 3).
# À lancer contre la fonction déployée (ou `supabase functions serve` en local).
#
# Usage :
#   BASE_URL="https://<ref>.functions.supabase.co" \
#   INBOUND_SECRET="<le secret>" \
#   QUESTION_ID="q0123456789abcdef" \
#   ./inbound_integration.sh
#
# Prérequis : avoir une question réelle avec ce QUESTION_ID (créée via send-question) pour
# voir le cas « attached ». Les autres cas ne dépendent d'aucune donnée.
# ════════════════════════════════════════════════════════════════════════════════════════
set -uo pipefail

BASE_URL="${BASE_URL:?BASE_URL requis}"
INBOUND_SECRET="${INBOUND_SECRET:?INBOUND_SECRET requis}"
QUESTION_ID="${QUESTION_ID:-q0123456789abcdef}"
URL="$BASE_URL/inbound-email"

post() { # $1 = description, $2 = extra curl args (secret ou non), $3 = json body
  echo "── $1"
  code=$(curl -s -o /tmp/inbound_resp.json -w "%{http_code}" -X POST "$URL" \
    -H "Content-Type: application/json" $2 -d "$3")
  echo "   HTTP $code — $(cat /tmp/inbound_resp.json)"
  echo
}

SECRET_HEADER="-H x-inbound-secret:$INBOUND_SECRET"

# 1. Réponse valide (MailboxHash) → doit rattacher (status: attached) si la question existe
post "1. Réponse valide (MailboxHash = $QUESTION_ID)" "$SECRET_HEADER" \
  "{\"MailboxHash\":\"$QUESTION_ID\",\"FromFull\":{\"Email\":\"jean@gss.fr\"},\"TextBody\":\"Voici ma reponse de test.\"}"

# 2. Sans secret → 401 (refus)
post "2. Sans secret → doit être refusé (401)" "" \
  "{\"MailboxHash\":\"$QUESTION_ID\",\"TextBody\":\"tentative sans secret\"}"

# 3. question_id inconnu → ignored / unknown_question_id
post "3. question_id inconnu → ignored" "$SECRET_HEADER" \
  "{\"MailboxHash\":\"qffffffffffffffff\",\"TextBody\":\"inconnu\"}"

# 4. Aucune référence → ignored / no_question_id
post "4. Aucune référence → ignored" "$SECRET_HEADER" \
  "{\"To\":\"ao@ao.gss.fr\",\"TextBody\":\"reponse sans reference\"}"

# 5. Doublon (rejouer le cas 1) → ignored / duplicate
post "5. Doublon (rejoue le cas 1) → ignored/duplicate" "$SECRET_HEADER" \
  "{\"MailboxHash\":\"$QUESTION_ID\",\"TextBody\":\"deuxieme envoi\"}"

# 6. JSON malformé → 400
echo "── 6. JSON malformé → 400"
code=$(curl -s -o /tmp/inbound_resp.json -w "%{http_code}" -X POST "$URL" \
  -H "Content-Type: application/json" $SECRET_HEADER -d "{ ceci n'est pas du json")
echo "   HTTP $code — $(cat /tmp/inbound_resp.json)"

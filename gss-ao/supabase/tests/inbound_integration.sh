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
QUESTION_ID="${QUESTION_ID:-q0123456789abcdef}"   # 1re question réelle (attach + doublon)
QUESTION_ID2="${QUESTION_ID2:-}"                   # 2e question réelle FRAÎCHE (attach via corps)
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
echo

# 7. AMBIGU : deux adresses de livraison distinctes → ignored/ambiguous_question_id
post "7. Ambigu (2 plus-address distinctes) → ignored/ambiguous" "$SECRET_HEADER" \
  "{\"ToFull\":[{\"Email\":\"ao+${QUESTION_ID}@ao.gss.fr\"},{\"Email\":\"ao+qffffffffffffffff@ao.gss.fr\"}],\"TextBody\":\"reponse\"}"

# 8. Id seulement dans le corps (pas d'adresse) → attaché via body_reference.
#    Nécessite une 2e question FRAÎCHE (QUESTION_ID2) : la 1re est déjà consommée par le cas 1.
if [ -n "$QUESTION_ID2" ]; then
  post "8. Id dans le corps uniquement (QUESTION_ID2) → attached (body_reference)" "$SECRET_HEADER" \
    "{\"To\":\"ao@ao.gss.fr\",\"TextBody\":\"Référence de suivi : AO / ${QUESTION_ID2}\"}"
else
  echo "── 8. (ignoré) définir QUESTION_ID2=<2e question fraîche> pour tester l'attache via corps"
fi

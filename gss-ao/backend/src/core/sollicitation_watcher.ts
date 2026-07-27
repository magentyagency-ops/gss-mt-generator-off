// ════════════════════════════════════════════════════════════════════════════════════════
// BALAYAGE PÉRIODIQUE DES RÉPONSES DE SOLLICITATION → RAG
// ════════════════════════════════════════════════════════════════════════════════════════
// L'Edge Function inbound-email se contente d'écrire question_interne.reponse_contenu quand un
// e-mail de réponse arrive. L'affinage IA + l'indexation dans rag_chunk étaient déclenchés
// UNIQUEMENT par l'app (page Boîte de réception) : une réponse reçue alors que personne n'ouvrait
// l'app n'entrait jamais dans la base de connaissance.
//
// Ce watcher relit périodiquement question_interne et rattrape tout ce qui n'est pas encore
// indexé. Idempotent (extra.reply_hash) : repasser sur une réponse déjà apprise ne coûte qu'une
// lecture. Il rend l'apprentissage indépendant de l'interface — tant que le backend tourne.
//
// Réglages (.env) :
//   SOLLICITATION_LEARN_INTERVAL_MIN  intervalle en minutes (défaut 5 ; 0 = désactivé)

import { learnPendingSollicitations } from '../generation/learn_sollicitation';

const INTERVAL_MIN = Number(process.env.SOLLICITATION_LEARN_INTERVAL_MIN ?? 5);

let timer: NodeJS.Timeout | null = null;
let enCours = false;   // évite le chevauchement si un balayage dépasse l'intervalle

async function balayer(): Promise<void> {
  if (enCours) return;
  enCours = true;
  try {
    const r = await learnPendingSollicitations();
    if (r.reason) console.warn(`[sollicitationWatcher] balayage impossible : ${r.reason}`);
  } catch (e) {
    // Ne doit JAMAIS faire tomber le serveur : le watcher est un confort, pas un chemin critique.
    console.warn('[sollicitationWatcher] échec du balayage :', (e as Error)?.message);
  } finally {
    enCours = false;
  }
}

/** Démarre le balayage (immédiat puis périodique). Sans effet si l'intervalle est à 0. */
export function startSollicitationWatcher(): void {
  if (!Number.isFinite(INTERVAL_MIN) || INTERVAL_MIN <= 0) {
    console.log('[sollicitationWatcher] désactivé (SOLLICITATION_LEARN_INTERVAL_MIN = 0).');
    return;
  }
  console.log(`[sollicitationWatcher] actif — balayage des réponses toutes les ${INTERVAL_MIN} min.`);
  void balayer();   // rattrapage immédiat au démarrage
  timer = setInterval(() => void balayer(), INTERVAL_MIN * 60_000);
  timer.unref?.();  // ne maintient pas le process en vie à lui seul
}

/** Arrêt propre (tests, extinction). */
export function stopSollicitationWatcher(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

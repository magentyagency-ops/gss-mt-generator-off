// ════════════════════════════════════════════════════════════════════════════════════════
// Persistance du .docx TEMPORAIRE (cadre avec marqueurs [CHAMP_<id>]) — Supabase Storage privé
// ════════════════════════════════════════════════════════════════════════════════════════
// Ticket #4 phase 3 (injection). Le temp local (response/temp_${dossierId}.docx) est éphémère et
// LIÉ À LA MACHINE qui a généré (ex. poste Windows d'arayzendev → injoignable ailleurs). On le
// pousse donc dans un bucket privé pour le rendre récupérable CROSS-POSTE / CROSS-SESSION, seule
// cible fiable de l'injection ultérieure.
//
// Écrit/lu par le service_role (backend de confiance, contourne la RLS). Bucket privé : aucun accès
// anonyme. Clé déterministe par dossier → un upsert écrase la version précédente (idempotent).

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSettings } from './config';

export const TEMP_BUCKET = 'memoire-temp';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Clé de l'objet pour un dossier (déterministe → upsert idempotent). */
export function tempObjectKey(dossierId: string): string {
  return `temp/${dossierId}.docx`;
}

/** Client Storage service_role, ou null si la config Supabase est absente. */
function storageAdmin(): SupabaseClient | null {
  const { supabaseUrl, supabaseServiceRoleKey } = getSettings();
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
}

/**
 * Uploade le buffer du temp .docx dans le bucket privé et renvoie la clé de l'objet (à stocker dans
 * memoire_cadre_state). Lève si l'upload échoue (l'appelant décide si c'est bloquant) ; renvoie null
 * si le Storage n'est pas configuré (dégradation propre, pas de crash).
 */
export async function uploadTempDocx(dossierId: string, buffer: Buffer): Promise<string | null> {
  const admin = storageAdmin();
  if (!admin) {
    console.info('[tempStorage] Storage désactivé (SUPABASE_URL/SERVICE_ROLE_KEY absents) → pas d\'upload.');
    return null;
  }
  const key = tempObjectKey(dossierId);
  const { error } = await admin.storage.from(TEMP_BUCKET).upload(key, buffer, {
    contentType: DOCX_MIME,
    upsert: true, // clé déterministe : on écrase la version précédente du même dossier
  });
  if (error) throw error;
  return key;
}

/** Télécharge le temp .docx par sa clé. Lève si absent/erreur. Renvoie un Buffer Node. */
export async function downloadTempDocx(key: string): Promise<Buffer> {
  const admin = storageAdmin();
  if (!admin) throw new Error('[tempStorage] Storage non configuré : download impossible.');
  const { data, error } = await admin.storage.from(TEMP_BUCKET).download(key);
  if (error) throw error;
  if (!data) throw new Error(`[tempStorage] Objet introuvable: ${key}`);
  const arrayBuf = await data.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/** Supprime le temp .docx du bucket (après finalisation/injection). Non bloquant côté appelant. */
export async function deleteTempDocx(key: string): Promise<void> {
  const admin = storageAdmin();
  if (!admin) return;
  const { error } = await admin.storage.from(TEMP_BUCKET).remove([key]);
  if (error) throw error;
}

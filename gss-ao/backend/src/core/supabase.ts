import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AsyncLocalStorage } from 'async_hooks';
import { getSettings } from './config';

const settings = getSettings();

if (!settings.supabaseUrl || !settings.supabaseAnonKey) {
  console.warn(
    '[supabase] SUPABASE_URL / SUPABASE_ANON_KEY manquants dans .env — ' +
      "les routes protégées renverront 500 tant qu'ils ne sont pas renseignés.",
  );
}

/**
 * Contexte propagé par requête (le JWT de l'utilisateur authentifié).
 * Permet à la couche DB (classe statique) de construire un client Supabase
 * scoppé au token SANS modifier toutes les signatures de méthodes.
 */
interface RequestContext {
  accessToken: string;
  userId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Client "anonyme" servant uniquement à vérifier un JWT (auth.getUser).
 * Aucune persistance de session côté serveur.
 */
const authClient: SupabaseClient = createClient(
  settings.supabaseUrl,
  settings.supabaseAnonKey,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/**
 * Vérifie un access token Supabase et renvoie l'utilisateur (ou null).
 */
export async function verifyAccessToken(token: string) {
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

/**
 * Client Supabase scoppé à l'utilisateur de la requête courante.
 * Toutes les requêtes passent avec le JWT dans l'en-tête Authorization
 * → la RLS s'applique exactement comme côté frontend.
 */
export function getScopedClient(): SupabaseClient {
  const ctx = requestContext.getStore();
  if (!ctx) {
    throw new Error(
      'getScopedClient() appelé hors contexte de requête authentifiée.',
    );
  }
  return createClient(settings.supabaseUrl, settings.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${ctx.accessToken}` } },
  });
}

/** Id de l'utilisateur de la requête courante (utile pour insert user_id). */
export function getCurrentUserId(): string {
  const ctx = requestContext.getStore();
  if (!ctx) throw new Error('getCurrentUserId() hors contexte de requête.');
  return ctx.userId;
}

/**
 * Client Supabase "Admin" (utilise la clé Service Role).
 * À n'utiliser QUE pour les tâches de fond (génération longue) où le JWT de 
 * l'utilisateur risque d'expirer avant la fin de la tâche.
 */
export function getAdminClient(): SupabaseClient {
  if (!settings.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY manquante, impossible de créer le client Admin.');
  }
  return createClient(settings.supabaseUrl, settings.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

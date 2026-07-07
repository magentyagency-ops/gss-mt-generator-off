import { createClient } from "@/lib/supabase/client";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "http://localhost:8000";

/**
 * fetch() authentifié vers le backend Express.
 * - Préfixe automatiquement l'URL de base (NEXT_PUBLIC_API_BASE).
 * - Ajoute l'en-tête `Authorization: Bearer <access_token>` de la session Supabase.
 *
 * Usage : apiFetch("/api/dossiers"), apiFetch(`/api/dossiers/${id}`, { method: "DELETE" }).
 * Accepte aussi une URL absolue (http…) — le préfixe n'est alors pas appliqué.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const url = /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`;
  return fetch(url, { ...init, headers });
}

/** Base URL du backend (pour les liens directs : <iframe>, <a download>…). */
export const apiBase = API_BASE;

import { Request, Response, NextFunction } from 'express';
import { requestContext, verifyAccessToken } from '../core/supabase';

/**
 * Middleware d'authentification.
 * - Extrait le Bearer token de l'en-tête Authorization.
 * - Le vérifie auprès de Supabase (auth.getUser).
 * - Exécute la suite du traitement DANS le contexte AsyncLocalStorage
 *   (token + userId) → la couche DB peut créer un client Supabase scoppé
 *   à cet utilisateur, avec RLS.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  const token = match[1];

  const user = await verifyAccessToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }

  (req as any).userId = user.id;
  requestContext.run({ accessToken: token, userId: user.id }, () => next());
}

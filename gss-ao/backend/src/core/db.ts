import { getScopedClient, getCurrentUserId } from './supabase';

// Champs portés par des colonnes dédiées de public.dossiers.
// Tout le reste du dossier "riche" est stocké dans la colonne jsonb `contenu`.
const COLUMN_FIELDS = ['id', 'user_id', 'created_at', 'updated_at', 'nom'] as const;

export interface DossierRecord {
  id: string;
  acheteur: string;
  objet: string;
  lots: any[];
  dateLimite: string;
  statut: string;
  responsable: string;
  ccag?: string;
  cpv?: string[];
  reference?: string;
  procedure?: string;
  plateforme?: string;
  dateVisite?: string;
  visiteObligatoire?: boolean;
  lieuVisite?: string;
  duree?: string;
  criteres?: any;
  pieces_candidature?: any[];
  pieces_offre?: any[];
  memoire_sections?: any[];
  dce_files?: any[];
  [key: string]: any;
}

interface DossierRow {
  id: string;
  user_id: string;
  nom: string;
  contenu: Record<string, any> | null;
  created_at?: string;
  updated_at?: string;
}

/** Ligne Supabase → enregistrement applicatif "à plat". */
function rowToRecord(row: DossierRow): DossierRecord {
  const contenu = row.contenu || {};
  return {
    ...contenu,
    id: row.id,
    user_id: row.user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  } as unknown as DossierRecord;
}

/** Calcule un `nom` d'affichage (colonne NOT NULL, 1..500 caractères). */
function computeNom(data: Record<string, any>, fallback?: string): string {
  const raw =
    data.acheteur || data.objet || data.nom || fallback || 'Nouveau dossier';
  return String(raw).slice(0, 500) || 'Nouveau dossier';
}

/**
 * Couche d'accès aux dossiers, adossée à Supabase (table public.dossiers).
 * Chaque appel s'exécute avec le JWT de l'utilisateur courant (RLS active) —
 * cf. requestContext dans core/supabase.ts.
 */
export class DB {
  static async getDossiers(): Promise<DossierRecord[]> {
    const supabase = getScopedClient();
    const { data, error } = await supabase
      .from('dossiers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as DossierRow[]).map(rowToRecord);
  }

  static async getDossier(id: string): Promise<DossierRecord | null> {
    const supabase = getScopedClient();
    const { data, error } = await supabase
      .from('dossiers')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? rowToRecord(data as DossierRow) : null;
  }

  static async saveDossier(
    id: string,
    data: Partial<DossierRecord>,
  ): Promise<void> {
    const supabase = getScopedClient();

    // Fusion avec l'existant (mêmes sémantiques que l'ancien stockage fichier).
    const existing = await DB.getDossier(id);
    const existingContenu: Record<string, any> = {};
    if (existing) {
      for (const [k, v] of Object.entries(existing)) {
        if (!COLUMN_FIELDS.includes(k as any) && k !== 'user_id') {
          existingContenu[k] = v;
        }
      }
    }

    const merged: Record<string, any> = { ...existingContenu, ...data };
    // On ne stocke jamais les champs "colonne" dans le jsonb.
    for (const f of COLUMN_FIELDS) delete merged[f];
    delete merged.user_id;

    const row = {
      id,
      user_id: getCurrentUserId(),
      nom: computeNom({ ...existing, ...data }, existing?.nom),
      contenu: merged,
    };

    const { error } = await supabase
      .from('dossiers')
      .upsert(row, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }

  static async deleteDossier(id: string): Promise<void> {
    const supabase = getScopedClient();
    const { error } = await supabase.from('dossiers').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
}

/** Une pièce jointe d'un dossier (fichier DCE), stockée dans Supabase Storage. */
export interface FichierRow {
  id: string;
  dossier_id: string;
  nom: string;
  storage_path: string | null;
  mime_type: string | null;
  taille_octets: number | null;
  created_at?: string;
}

/**
 * Couche d'accès aux pièces d'un dossier (table public.fichiers). Les octets vivent dans
 * Supabase Storage (bucket user-files) ; cette table n'en garde que les métadonnées + le chemin.
 * Chaque appel s'exécute avec le JWT de l'utilisateur (RLS active).
 */
export class FichiersDB {
  static async listByDossier(dossierId: string): Promise<FichierRow[]> {
    const supabase = getScopedClient();
    const { data, error } = await supabase
      .from('fichiers')
      .select('id, dossier_id, nom, storage_path, mime_type, taille_octets, created_at')
      .eq('dossier_id', dossierId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data as FichierRow[]) || [];
  }

  /** Insère la métadonnée d'une pièce ; remplace une éventuelle ligne au même storage_path. */
  static async upsert(
    dossierId: string,
    f: { nom: string; storagePath: string; mimeType?: string | null; tailleOctets?: number | null },
  ): Promise<string> {
    const supabase = getScopedClient();
    // Ré-upload du même fichier → on évite les doublons (pas de contrainte unique sur le chemin).
    await supabase.from('fichiers').delete().eq('dossier_id', dossierId).eq('storage_path', f.storagePath);
    const { data, error } = await supabase
      .from('fichiers')
      .insert({
        dossier_id: dossierId,
        user_id: getCurrentUserId(),
        nom: f.nom,
        storage_path: f.storagePath,
        mime_type: f.mimeType ?? null,
        taille_octets: f.tailleOctets ?? null,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  }
}

/** Quota de génération atteint (ou email non confirmé) — levé par le trigger BDD. */
export class QuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaError';
  }
}

/**
 * Crédits de génération restants pour l'utilisateur courant (RPC BDD).
 * -1 si indéterminable (profil introuvable).
 */
export async function remainingGenerations(): Promise<number> {
  const supabase = getScopedClient();
  const { data, error } = await supabase.rpc('remaining_generations');
  if (error || data === null || data === undefined) return -1;
  return Number(data);
}

/** Contenu applicatif d'un mémoire technique généré (stocké en jsonb). */
export interface MemoireContenu {
  generatedData?: Record<string, string>; // texte IA par section
  filePath?: string; // chemin du .docx/.pdf généré
  mode?: string; // 'cadre' | 'sections' | 'finalise' …
  generatedAt?: string;
  [key: string]: any;
}

export interface MemoireRecord {
  id: string;
  dossier_id: string | null;
  user_id: string;
  titre?: string | null;
  contenu: MemoireContenu | null;
  statut?: string;
  ai_model?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Couche d'accès aux mémoires techniques (table public.memoires_techniques).
 * Un mémoire "courant" par dossier : on met à jour la ligne existante si
 * présente, sinon on l'insère. RLS active (client scoppé au JWT).
 */
export class MemoiresDB {
  /**
   * Crée une NOUVELLE ligne mémoire (statut 'generating') À CHAQUE génération.
   * C'est cet INSERT qui consomme 1 crédit (trigger enforce_generation_quota),
   * de façon fiable (opération courte, contexte JWT garanti). Renvoie l'id créé.
   * → 1 crédit consommé par génération lancée (même dossier = crédits séparés).
   * Lève QuotaError si le quota est atteint / l'email n'est pas confirmé.
   */
  static async createGenerating(dossierId: string): Promise<string> {
    const supabase = getScopedClient();
    const { data, error } = await supabase
      .from('memoires_techniques')
      .insert({
        dossier_id: dossierId,
        user_id: getCurrentUserId(),
        statut: 'generating',
        contenu: {},
      })
      .select('id')
      .single();
    if (error) {
      if (/quota|email non confirm/i.test(error.message)) {
        throw new QuotaError(error.message);
      }
      throw new Error(error.message);
    }
    return data.id;
  }

  /** Renseigne le contenu final d'une mémoire (par id) et la passe en 'completed'. */
  static async finish(
    memoireId: string,
    contenu: MemoireContenu,
    meta: { titre?: string; aiModel?: string } = {},
  ): Promise<void> {
    const supabase = getScopedClient();
    const { error } = await supabase
      .from('memoires_techniques')
      .update({
        contenu: {
          ...contenu,
          generatedAt: contenu.generatedAt || new Date().toISOString(),
        },
        statut: 'completed',
        titre: meta.titre ?? null,
        ai_model: meta.aiModel ?? null,
      })
      .eq('id', memoireId);
    if (error) throw new Error(error.message);
  }

  static async save(
    dossierId: string,
    contenu: MemoireContenu,
    meta: { titre?: string; aiModel?: string } = {},
  ): Promise<string> {
    const supabase = getScopedClient();
    const payload: MemoireContenu = {
      ...contenu,
      generatedAt: contenu.generatedAt || new Date().toISOString(),
    };

    // Titre lisible : celui fourni, sinon le nom du dossier.
    let titre = meta.titre;
    if (!titre) {
      const { data: dossier } = await supabase
        .from('dossiers')
        .select('nom')
        .eq('id', dossierId)
        .maybeSingle();
      titre = dossier?.nom || 'Mémoire technique';
    }

    const { data: existing, error: selErr } = await supabase
      .from('memoires_techniques')
      .select('id')
      .eq('dossier_id', dossierId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);

    // Régénération : on met à jour (pas de nouveau crédit consommé — le trigger
    // quota n'agit qu'à l'INSERT).
    if (existing) {
      const { error } = await supabase
        .from('memoires_techniques')
        .update({
          contenu: payload,
          titre,
          statut: 'completed',
          ai_model: meta.aiModel ?? null,
        })
        .eq('id', existing.id);
      if (error) throw new Error(error.message);
      return existing.id;
    }

    // 1ʳᵉ création : le trigger enforce_generation_quota vérifie l'email confirmé
    // + le quota et consomme 1 crédit. On traduit ses erreurs pour l'UI.
    const { data, error } = await supabase
      .from('memoires_techniques')
      .insert({
        dossier_id: dossierId,
        user_id: getCurrentUserId(),
        titre,
        statut: 'completed',
        ai_model: meta.aiModel ?? null,
        contenu: payload,
      })
      .select('id')
      .single();
    if (error) {
      if (/quota/i.test(error.message)) {
        throw new QuotaError(error.message);
      }
      throw new Error(error.message);
    }
    return data.id;
  }

  /** Dernier mémoire enregistré pour un dossier (ou null). */
  static async getByDossier(dossierId: string): Promise<MemoireRecord | null> {
    const supabase = getScopedClient();
    const { data, error } = await supabase
      .from('memoires_techniques')
      .select('*')
      .eq('dossier_id', dossierId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as MemoireRecord) || null;
  }
}

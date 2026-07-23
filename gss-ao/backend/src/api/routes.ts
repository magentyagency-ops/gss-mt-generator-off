import { Router, Request, Response } from 'express';
import { MemoireGenerator } from '../generation/memoire_generator';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { DB, DossierRecord, MemoiresDB, FichiersDB, remainingGenerations, QuotaError } from '../core/db';
import { initProgress, finishProgress } from '../core/progress';
import { extractRcWithLLM, extractCctpWithLLM } from '../analysis/llmExtractor';
import { requireAuth } from './authMiddleware';
import { getScopedClient, requestContext } from '../core/supabase';

// Bucket privé où sont archivées les pièces des dossiers (DCE). Chemin : <userId>/dce/<dossierId>/<nom>
// (le préfixe <userId> est imposé par la RLS Storage, cf. infra/supabase/001_schema.sql).
const USER_FILES_BUCKET = 'user-files';

const uploadDir = path.resolve(__dirname, '../../../data/output/temp');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

const router = Router();

// Authentification obligatoire sur toutes les routes /api, SAUF :
//  - /health   : sonde de disponibilité
//  - /download : servi dans des <iframe>/<a download> qui ne peuvent pas
//                porter d'en-tête Authorization (aperçu/téléchargement fichiers).
router.use((req: Request, res: Response, next) => {
  if (req.path === '/health' || req.path === '/download') return next();
  return requireAuth(req, res, next);
});

interface ProgressInfo {
  status: string;
  progress: number;
  message: string;
  logs: string[];
  /** Informations que GSS ne possède pas et qui doivent être obtenues (notif « consultation requise »). */
  consultations?: string[];
}

export const progressStore: Record<string, ProgressInfo> = {};

export function setDossierProgress(id: string, update: Partial<ProgressInfo>) {
  if (!progressStore[id]) {
    progressStore[id] = { status: 'idle', progress: 0, message: '', logs: [] };
  }
  if (update.status !== undefined) progressStore[id].status = update.status;
  if (update.progress !== undefined) progressStore[id].progress = update.progress;
  if (update.message !== undefined) {
    progressStore[id].message = update.message;
    progressStore[id].logs.push(`[${new Date().toLocaleTimeString('fr-FR')}] ${update.message}`);
  }
  if (update.logs !== undefined) {
    progressStore[id].logs.push(...update.logs);
  }
  if (update.consultations !== undefined) progressStore[id].consultations = update.consultations;
}

// Bloque la génération si le quota est épuisé (chaque génération coûte 1 crédit).
// Renvoie true et répond 429 si bloqué.
async function quotaBlocked(res: Response): Promise<boolean> {
  const remaining = await remainingGenerations();
  if (remaining === 0) {
    res.status(429).json({
      error:
        'Quota de génération atteint. Contactez un administrateur pour augmenter votre limite.',
    });
    return true;
  }
  return false;
}

// Probe / healthcheck
router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

router.get('/dossiers/:id/progress', (req: Request, res: Response) => {
  const { id } = req.params;
  const progress = progressStore[id] || { status: 'idle', progress: 0, message: 'Non démarré', logs: [] };
  res.json(progress);
});

// Download a generated file.
// Par défaut, on sert le fichier en INLINE (Content-Disposition: inline) pour que la
// prévisualisation PDF fonctionne dans une <iframe> ; res.download() forçait « attachment »,
// ce qui faisait télécharger le fichier au lieu de l'afficher → aperçu vide.
// Le bouton « Télécharger » du front passe ?download=1 pour forcer la pièce jointe.
router.get('/download', (req: Request, res: Response) => {
  const filePath = req.query.file as string;
  if (!filePath) {
    return res.status(400).send('File path missing');
  }
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    return res.status(404).send('File not found');
  }
  if (req.query.download) {
    return res.download(absPath);
  }
  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(absPath);
});

// --- Dossiers Endpoints ---

router.get('/dossiers', async (req: Request, res: Response) => {
  try {
    const dossiers = await DB.getDossiers();
    res.json(dossiers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dossiers/:id', async (req: Request, res: Response) => {
  try {
    const dossier = await DB.getDossier(req.params.id);
    if (!dossier) return res.status(404).json({ error: 'Dossier not found' });
    res.json(dossier);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/dossiers', async (req: Request, res: Response) => {
  try {
    const id = req.body.id || `dossier-${Date.now()}`;
    const data = { ...req.body, id };
    await DB.saveDossier(id, data);
    res.json({ id, message: 'Dossier créé' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/dossiers/:id', async (req: Request, res: Response) => {
  try {
    await DB.deleteDossier(req.params.id);
    res.json({ message: 'Dossier supprimé' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Module A — upload ZIP/multi-fichiers + classification des pièces.
router.post('/dce/upload', upload.array('files'), async (req: Request, res: Response) => {
  // multer parse le multipart de façon ASYNCHRONE : quand ce handler s'exécute, le contexte
  // AsyncLocalStorage posé par requireAuth (run(() => next())) est déjà refermé → getScopedClient()
  // / getCurrentUserId() / FichiersDB lèveraient « hors contexte de requête ». On le RÉTABLIT ici
  // depuis les infos portées par la requête (token d'en-tête + userId posé par requireAuth).
  const authToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const authUserId = (req as any).userId as string | undefined;
  if (!authToken || !authUserId) { res.status(401).json({ error: "Authentification requise" }); return; }

  await requestContext.run({ accessToken: authToken, userId: authUserId }, async () => {
  try {
    const dossierId = req.body.id;
    if (!dossierId) throw new Error("ID du dossier manquant");

    const userId = authUserId;
    const supabase = getScopedClient();

    let rcData: any = null;
    let cctpData: any = null;

    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        // Nom d'origine (corrige l'encodage latin1 par défaut de multer). Peut contenir un CHEMIN
        // RELATIF quand l'utilisateur uploade un dossier (« DCE/annexes/plan.pdf ») → on préserve
        // les sous-dossiers pour éviter les collisions de noms entre sous-dossiers.
        const utf8Name = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const relPath = utf8Name.replace(/\\/g, '/').replace(/^\/+/, '');  // sépas Windows → '/', pas de '/' initial
        const finalName = relPath;                                          // chemin relatif complet (colonne `nom`)

        // Le fichier temporaire multer sert UNIQUEMENT à l'upload + l'extraction, puis est supprimé :
        // aucune pièce ne reste sur le disque de l'app. La source durable = Supabase Storage.
        const tmpPath = file.path;
        try {
          const buffer = fs.readFileSync(tmpPath);
          // Clé Storage SÛRE : Supabase rejette les clés avec accents/espaces/caractères spéciaux.
          // On sanitise CHAQUE segment du chemin et on conserve l'arborescence (séparateur '/').
          // Le nom D'ORIGINE (avec accents/sous-dossiers) reste dans la colonne `nom`, utilisé tel
          // quel à la génération pour recréer l'arborescence et classer les pièces.
          const safeRel = relPath
            .split('/')
            .map((seg) =>
              seg
                .normalize('NFD').replace(/[̀-ͯ]/g, '')
                .replace(/[^a-zA-Z0-9._-]+/g, '_')
                .replace(/_+/g, '_').replace(/^_|_$/g, ''),
            )
            .filter(Boolean)
            .join('/') || 'fichier';
          // Storage : <userId>/dce/<dossierId>/<chemin sûr> (préfixe userId imposé par la RLS Storage).
          const storagePath = `${userId}/dce/${dossierId}/${safeRel}`;
          const { error: upErr } = await supabase.storage
            .from(USER_FILES_BUCKET)
            .upload(storagePath, buffer, {
              contentType: file.mimetype || 'application/octet-stream',
              upsert: true,
            });
          if (upErr) throw new Error(`upload Storage échoué (${finalName}): ${upErr.message}`);

          await FichiersDB.upsert(dossierId, {
            nom: finalName,          // chemin relatif d'origine — pour recréer l'arborescence + extraction
            storagePath,
            mimeType: file.mimetype || null,
            tailleOctets: buffer.length,
          });

          const lowerName = path.basename(finalName).toLowerCase();
          // Le nom de fichier n'est qu'un indice de classification : l'extraction est pilotée par LLM.
          const looksLikeRc = lowerName.includes('rc') || lowerName.includes('reglement') || lowerName.includes('règlement') || lowerName.includes('consultation');
          const looksLikeCctp = lowerName.includes('cctp') || lowerName.includes('technique') || lowerName.includes('cahier');
          if (looksLikeRc && !rcData) {
            try { rcData = await extractRcWithLLM(tmpPath); } catch (e) { console.warn("Erreur extraction RC:", e); }
          }
          if (looksLikeCctp && !cctpData) {
            try { cctpData = await extractCctpWithLLM(tmpPath); } catch (e) { console.warn("Erreur extraction CCTP:", e); }
          }
        } finally {
          try { fs.unlinkSync(tmpPath); } catch { /* déjà supprimé */ }
        }
      }
    }

    // Merge data from parsers
    const dossierUpdate: Partial<DossierRecord> = {};
    if (rcData) {
      if (rcData.acheteur) dossierUpdate.acheteur = rcData.acheteur;
      if (rcData.objet) dossierUpdate.objet = rcData.objet;
      if (rcData.allotissement) dossierUpdate.lots = rcData.allotissement;
      if (rcData.criteres) dossierUpdate.criteres = rcData.criteres;
      if (rcData.pieces_candidature) dossierUpdate.pieces_candidature = rcData.pieces_candidature;
      if (rcData.pieces_offre) dossierUpdate.pieces_offre = rcData.pieces_offre;
      if (rcData.modalites_remise?.date_limite?.valeur) {
        dossierUpdate.dateLimite = new Date(rcData.modalites_remise.date_limite.valeur).toISOString();
      }
    }
    if (cctpData) {
      if (cctpData.objet && !dossierUpdate.objet) dossierUpdate.objet = cctpData.objet;
    }

    dossierUpdate.statut = "En cours";
    await DB.saveDossier(dossierId, dossierUpdate);

    res.json({ message: "Fichiers uploadés et parsés avec succès", dossierId, rcData, cctpData });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
  });
});

// Module B — fiche de synthèse DCE.
router.get('/dce/:dossier_id/synthese', (req: Request, res: Response) => {
  res.status(501).json({ error: 'Endpoint synthèse — itération ultérieure' });
});

// Module E — check-list de conformité.
router.get('/dce/:dossier_id/checklist', (req: Request, res: Response) => {
  res.status(501).json({ error: 'Endpoint check-list — itération ultérieure' });
});

// Récupère le dernier mémoire technique enregistré en base pour un dossier.
router.get('/dossiers/:id/memoire', async (req: Request, res: Response) => {
  try {
    const memoire = await MemoiresDB.getByDossier(req.params.id);
    if (!memoire) return res.status(404).json({ error: 'Aucun mémoire enregistré' });
    res.json(memoire);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Module C — génération mémoire technique.
router.post('/dce/:dossier_id/memoire', async (req: Request, res: Response) => {
  const dossierId = req.params.dossier_id;
  let memoireId: string | null = null;
  try {
    if (await quotaBlocked(res)) return;
    // Consomme 1 crédit dès le lancement (nouvelle ligne mémoire 'generating').
    try {
      memoireId = await MemoiresDB.createGenerating(dossierId);
    } catch (e: any) {
      if (e instanceof QuotaError) {
        return res.status(429).json({
          error: 'Quota de génération atteint (ou email non confirmé).',
        });
      }
      console.error('Initialisation du mémoire en base échouée:', e.message || e);
    }
    setDossierProgress(dossierId, { status: 'running', progress: 5, message: 'Démarrage de la génération du mémoire...' });
    const generator = new MemoireGenerator();
    const result = await generator.generate(dossierId, (progress, message) => {
      setDossierProgress(dossierId, { status: 'running', progress, message });
    });

    if (result.status === 'incomplete') {
      setDossierProgress(dossierId, { status: 'incomplete', progress: 95, message: 'En attente d\'informations complémentaires.' });
      return res.json({
        status: 'incomplete',
        message: 'Des informations sont manquantes.',
        missingFields: result.missingFields
      });
    }

    if (memoireId) {
      try {
        await MemoiresDB.finish(memoireId, {
          generatedData: result.generatedData,
          filePath: result.filePath,
          mode: 'cadre',
        });
      } catch (e: any) {
        console.error('Sauvegarde du contenu du mémoire échouée:', e.message || e);
      }
    }

    const consultations = result.consultations || [];
    const doneMessage = consultations.length
      ? `Génération terminée. ⚠ ${consultations.length} information(s) à compléter.`
      : 'Génération terminée avec succès !';
    setDossierProgress(dossierId, { status: 'completed', progress: 100, message: doneMessage, consultations });
    res.json({
      status: 'completed',
      message: 'Mémoire technique traité',
      file_path: result.filePath,
      data_generee_par_ia: result.generatedData,
      consultations,
    });
  } catch (error: any) {
    console.error('Erreur lors de la génération du mémoire:', error);
    setDossierProgress(dossierId, { status: 'error', message: `Erreur: ${error.message || error}` });
    res.status(500).json({ error: error.message || 'Erreur interne du serveur' });
  }
});

// Endpoint pour finaliser la génération après intervention de l'utilisateur (Chatbot)
router.post('/dce/:dossier_id/memoire/fill-missing', async (req: Request, res: Response) => {
  const dossierId = req.params.dossier_id;
  const { userAnswers } = req.body;
  try {
    if (await quotaBlocked(res)) return;
    setDossierProgress(dossierId, { status: 'running', progress: 98, message: 'Intégration des réponses de l\'utilisateur...' });
    const generator = new MemoireGenerator();
    const result = await generator.finalizeMemoire(dossierId, userAnswers);

    try {
      await MemoiresDB.save(dossierId, {
        generatedData: result.generatedData,
        filePath: result.filePath,
        mode: 'finalise',
      });
    } catch (e: any) {
      console.error('Sauvegarde du mémoire en base échouée:', e.message || e);
    }

    setDossierProgress(dossierId, { status: 'completed', progress: 100, message: 'Génération terminée avec succès !' });
    res.json({ status: 'completed', message: 'Mémoire finalisé', file_path: result.filePath, data_generee_par_ia: result.generatedData });
  } catch (error: any) {
    console.error('Erreur lors de la finalisation du mémoire:', error);
    setDossierProgress(dossierId, { status: 'error', message: `Erreur: ${error.message || error}` });
    res.status(500).json({ error: error.message || 'Erreur interne du serveur' });
  }
});

// Endpoint pour évaluer la réponse d'un utilisateur aux infos manquantes (via LLM)
router.post('/dce/:dossier_id/memoire/chat-missing-eval', async (req: Request, res: Response) => {
  const dossierId = req.params.dossier_id;
  const { context, chatHistory } = req.body;
  try {
    const generator = new MemoireGenerator();
    const evaluation = await generator.evaluateMissingInfoChat(context, chatHistory);
    res.json(evaluation);
  } catch (error: any) {
    console.error('Erreur lors de evaluateMissingInfoChat:', error);
    res.status(500).json({ error: error.message || 'Erreur interne' });
  }
});

// Assemble un .docx à partir des sections déjà générées (cas sans cadre imposé) :
// remplace le contenu de chaque chapitre du mémoire de référence GSS par le texte IA.
router.post('/dossiers/:id/memoire-from-sections', async (req: Request, res: Response) => {
  try {
    const { chapters } = req.body;
    if (!Array.isArray(chapters) || chapters.length === 0) {
      return res.status(400).json({ error: 'Aucune section fournie.' });
    }
    if (await quotaBlocked(res)) return;
    let memoireId: string | null = null;
    try {
      memoireId = await MemoiresDB.createGenerating(req.params.id);
    } catch (e: any) {
      if (e instanceof QuotaError) {
        return res.status(429).json({
          error: 'Quota de génération atteint (ou email non confirmé).',
        });
      }
      console.error('Initialisation du mémoire en base échouée:', e.message || e);
    }
    const generator = new MemoireGenerator();
    const result = await generator.assembleFromSections(req.params.id, chapters);

    if (memoireId) {
      try {
        await MemoiresDB.finish(memoireId, {
          generatedData: result.generatedData,
          filePath: result.filePath,
          mode: 'sections',
        });
      } catch (e: any) {
        console.error('Sauvegarde du contenu du mémoire échouée:', e.message || e);
      }
    }

    res.json({
      message: 'Mémoire technique assemblé',
      file_path: result.filePath,
      data_generee_par_ia: result.generatedData,
    });
  } catch (error: any) {
    console.error('Erreur assemblage mémoire:', error);
    res.status(500).json({ error: error.message || 'Erreur interne du serveur' });
  }
});

router.post('/generate-section', async (req: Request, res: Response) => {
  try {
    const { api_key, cctp_extract, rag_chunks, template_question, mode, selected_slides } = req.body;

    if (!api_key) {
      return res.status(400).json({ error: "Clé API OpenAI manquante." });
    }

    const openai = new OpenAI({ apiKey: api_key });

    let prompt = `Tu es un expert en réponse aux appels d'offres pour l'entreprise de sécurité privée GSS.\n`;
    prompt += `Ton objectif est de rédiger une section claire, professionnelle et convaincante pour le mémoire technique.\n\n`;

    if (cctp_extract) {
      prompt += `--- EXTRAIT DU CCTP (Attentes du client) ---\n${cctp_extract}\n\n`;
    }

    const chunks = mode === 'A' ? rag_chunks : selected_slides;
    if (chunks && chunks.length > 0) {
      prompt += `--- RESSOURCES GSS (À mobiliser dans la réponse) ---\n`;
      chunks.forEach((c: any, i: number) => {
        prompt += `Source ${i + 1} [${c.categorie}]: ${c.texte}\n`;
      });
      prompt += `\n`;
    }

    if (mode === 'B' && template_question) {
      prompt += `La question ou thématique à traiter est : "${template_question}"\n\n`;
    }

    prompt += `Rédige la section de manière formelle et synthétique. N'inclus pas de salutations.\n`;
    prompt += `Mets impérativement en forme les titres et sous-titres en gras ET souligné (par exemple : **<u>Titre de ma partie</u>**).\n`;
    prompt += `Ajoute TOUJOURS un saut de ligne (ligne vide) entre chaque titre/sous-titre et le paragraphe qui suit.\n`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      messages: [{ role: "system", content: prompt }],
      temperature: 0.7,
    });

    const generated_text = completion.choices[0].message.content || "";
    const tokens_used = completion.usage?.total_tokens || 0;

    res.json({
      generated_text,
      model: "gpt-5.4-mini",
      tokens_used
    });
  } catch (error: any) {
    console.error('Erreur generate-section:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export DOCX (cas sans cadre imposé / Mode B) — comme GSS-MT-Generator :
// reçoit la map des sections générées, assemble le mémoire de référence GSS
// et renvoie le .docx en téléchargement direct (blob).
router.post('/export-docx', async (req: Request, res: Response) => {
  try {
    const { sections } = req.body;
    if (!sections || typeof sections !== 'object' || Object.keys(sections).length === 0) {
      return res.status(400).json({ error: 'Aucune section à exporter.' });
    }
    const generator = new MemoireGenerator();
    const result = await generator.exportFromSectionsMap(sections as Record<string, string>);
    return res.download(result.filePath, 'Memoire_Technique_GSS.pdf');
  } catch (error: any) {
    console.error('Erreur export-docx:', error);
    res.status(500).json({ error: error.message || 'Erreur interne du serveur' });
  }
});

// Import par email d'alerte Nukema
import { getSettings } from '../core/config';

router.post('/ingest-email', async (req: Request, res: Response) => {
  try {
    const { emailText, api_key } = req.body;
    if (!emailText || typeof emailText !== 'string' || emailText.trim() === '') {
      return res.status(400).json({ error: "Le texte de l'email est vide ou manquant." });
    }

    const apiKey = api_key || getSettings().openaiApiKey;
    if (!apiKey) {
      return res.status(400).json({ error: "Clé API OpenAI manquante." });
    }

    const openai = new OpenAI({ apiKey });

    const prompt = `Tu es un assistant de traitement d'appels d'offres pour l'entreprise de sécurité GSS.
Tu as reçu un e-mail d'alerte de Nukema décrivant un nouvel appel d'offres.
Analyse cet e-mail pour extraire les informations suivantes et réponds exclusivement sous la forme d'un objet JSON valide.

L'objet JSON doit avoir les champs suivants exacts :
{
  "acheteur": "Nom de l'acheteur (ex: Ville de Rouen, Conseil Départemental, etc.) ou 'Non spécifié' s'il n'est pas présent",
  "objet": "Objet du marché (ex: Prestations de sécurité et de gardiennage) ou 'Non spécifié'",
  "dateLimite": "Date limite de dépôt au format ISO AAAA-MM-JJ (ex: 2026-07-15) ou la date la plus probable trouvée, ou 'Non spécifié'",
  "departement": "Le département français sous forme de numéro de 2 ou 3 chiffres (ex: 76, 75, 974) ou 'Non spécifié'",
  "description": "Un résumé synthétique de l'appel d'offres en 3 ou 4 phrases détaillant la nature des prestations demandées (ex: gardiennage physique, rondes de nuit, sécurité incendie) et le contexte général",
  "suggestionSections": [
    "Une liste de 3 à 5 sections clés ou thématiques que GSS devra aborder dans son mémoire technique pour ce marché (ex: 'Présentation de l'équipe et des agents affectés', 'Plan de surveillance et rondes de nuit', 'Gestion des alarmes et interventions')"
  ],
  "lienUnique": "L'URL de l'appel d'offres s'il y en a un présent dans l'e-mail, sinon ''"
}

Texte de l'e-mail d'alerte :
\"\"\"
${emailText}
\"\"\"`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      messages: [{ role: "system", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    const parsedData = JSON.parse(completion.choices[0].message.content || "{}");

    // Save as a new dossier in database (with status "Brouillon")
    const id = `dossier-${Date.now()}`;
    const dossierData: DossierRecord = {
      id,
      acheteur: parsedData.acheteur || "Acheteur inconnu",
      objet: parsedData.objet || "Objet non spécifié",
      lots: [],
      dateLimite: parsedData.dateLimite || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      statut: "Brouillon",
      responsable: "Sacha",
      importedFromEmail: true,
      emailSummary: parsedData.description,
      suggestionSections: parsedData.suggestionSections || [],
      lienUnique: parsedData.lienUnique || "",
      departement: parsedData.departement || "",
      dce_files: [],
      pieces_candidature: [],
      pieces_offre: [],
      memoire_sections: []
    };

    await DB.saveDossier(id, dossierData);

    res.json({
      success: true,
      dossierId: id,
      dossier: dossierData
    });
  } catch (error: any) {
    console.error("Erreur ingestion email:", error);
    res.status(500).json({ error: error.message || "Erreur interne" });
  }
});

export default router;

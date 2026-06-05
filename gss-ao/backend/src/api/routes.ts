import { Router, Request, Response } from 'express';
import { MemoireGenerator } from '../generation/memoire_generator';

const router = Router();

// Probe / healthcheck
router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Module A — upload ZIP/multi-fichiers + classification des pièces.
router.post('/dce/upload', (req: Request, res: Response) => {
  res.status(501).json({ error: 'Endpoint upload DCE — itération ultérieure' });
});

// Module B — fiche de synthèse DCE.
router.get('/dce/:dossier_id/synthese', (req: Request, res: Response) => {
  res.status(501).json({ error: 'Endpoint synthèse — itération ultérieure' });
});

// Module E — check-list de conformité.
router.get('/dce/:dossier_id/checklist', (req: Request, res: Response) => {
  res.status(501).json({ error: 'Endpoint check-list — itération ultérieure' });
});

// Module C — génération mémoire technique.
router.post('/dce/:dossier_id/memoire', async (req: Request, res: Response) => {
  try {
    const generator = new MemoireGenerator();
    const result = await generator.generate(req.params.dossier_id);
    res.json({ message: 'Mémoire technique traité', file_path: result.filePath, data_generee_par_ia: result.generatedData });
  } catch (error: any) {
    console.error('Erreur lors de la génération du mémoire:', error);
    res.status(500).json({ error: error.message || 'Erreur interne du serveur' });
  }
});

export default router;

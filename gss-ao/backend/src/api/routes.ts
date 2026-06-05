import { Router, Request, Response } from 'express';

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
router.post('/dce/:dossier_id/memoire', (req: Request, res: Response) => {
  res.status(501).json({ error: 'Endpoint génération mémoire — itération ultérieure' });
});

export default router;

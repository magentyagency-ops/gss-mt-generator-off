import WebSocket from 'ws';
(global as any).WebSocket = WebSocket;

import express from 'express';
import cors from 'cors';
import routes from './api/routes';

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Prefix all routes with /api
app.use('/api', routes);

// Fallback to direct routes prefix for compatibility if needed (FastAPI router had prefix /api)
// So /api/health was under router with prefix /api, meaning the full path is /api/health.
// App.use('/api', routes) maps routes like router.get('/health') to /api/health. Perfect!

const server = app.listen(port, () => {
  console.log(`GSS-AO Backend server listening at http://localhost:${port}`);
});

// La génération d'un mémoire (téléchargement des images de la bibliothèque +
// rendu Marp/Chromium de dizaines de pages illustrées) dépasse largement les
// 5 min du `requestTimeout` par défaut de Node : au-delà, Node ferme le socket
// et le front voit « Failed to fetch ». On alloue 15 min au traitement complet.
const GENERATION_MAX_MS = 15 * 60 * 1000;
server.requestTimeout = GENERATION_MAX_MS; // durée max de traitement d'une requête
server.headersTimeout = GENERATION_MAX_MS + 5_000; // doit rester > requestTimeout
server.timeout = 0; // pas de coupure sur inactivité socket pendant un long rendu
server.keepAliveTimeout = 65_000;

export default app;

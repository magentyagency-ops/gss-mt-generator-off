import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { handleScan, handleAnalyze, handleGenerate, handleAnalyzeSlides } from './vite-api'

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true
  },
  plugins: [
    react(),
    {
      name: 'api-middleware',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && req.url.startsWith('/api/')) {
            res.setHeader('Content-Type', 'application/json');
            
            // Helper to parse POST request JSON body
            const getBody = (): Promise<any> => new Promise((resolve) => {
              let body = '';
              req.on('data', chunk => body += chunk);
              req.on('end', () => {
                try {
                  resolve(body ? JSON.parse(body) : {});
                } catch {
                  resolve({});
                }
              });
            });

            try {
              if (req.url === '/api/scan' && req.method === 'GET') {
                const result = await handleScan();
                res.end(JSON.stringify(result));
                return;
              }
              
              if (req.url === '/api/analyze' && req.method === 'POST') {
                const body = await getBody();
                const result = await handleAnalyze(body.apiKey);
                res.end(JSON.stringify(result));
                return;
              }

              if (req.url === '/api/analyze-slides' && req.method === 'POST') {
                const body = await getBody();
                const result = await handleAnalyzeSlides(body.apiKey, body.analysisData);
                res.end(JSON.stringify(result));
                return;
              }
              
              if (req.url === '/api/generate' && req.method === 'POST') {
                const body = await getBody();
                const result = await handleGenerate(body.apiKey, body.analysisData, body.customReportName, body.selectedPages);
                res.end(JSON.stringify(result));
                return;
              }

              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Endpoint non trouvé' }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message || 'Erreur Interne du Serveur' }));
            }
          } else {
            next();
          }
        });
      }
    }
  ],
})



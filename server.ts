import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './server/routes.js';
import { securityHeaders, rateLimiter, corsHandler, errorHandler } from './server/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  // Port resolution: CLI flag --port, DEFAULT_APP_PORT, or fallback to 3000 (avoid nginx port 8080)
  const portArgIndex = process.argv.indexOf('--port');
  const cliPort = portArgIndex !== -1 ? parseInt(process.argv[portArgIndex + 1], 10) : null;
  const envPort = process.env.DEFAULT_APP_PORT || (process.env.PORT && process.env.PORT !== '8080' ? process.env.PORT : null);
  const port = cliPort || (envPort ? parseInt(envPort, 10) : 3000);
  const isProd = process.env.NODE_ENV === 'production';

  app.use(securityHeaders);
  app.use(corsHandler);
  app.use(express.json({ limit: '5mb' }));

  // Health-check endpoints for load balancers, orchestrators and uptime monitoring
  const healthCheck = (_req: express.Request, res: express.Response) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
    });
  };
  app.get('/health', healthCheck);
  app.get('/api/health', healthCheck);

  app.use('/api', rateLimiter({ maxRequests: 300, windowMs: 60_000 }));

  // Mount API routes
  app.use('/api', apiRouter);

  // Central error handling for API
  app.use('/api', errorHandler);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[Server] Running at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});

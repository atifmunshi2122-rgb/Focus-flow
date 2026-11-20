import express from 'express';
import { apiRouter } from '../server/routes.ts';
import { securityHeaders, corsHandler, errorHandler, configureTrustProxy } from '../server/security.ts';

const app = express();
configureTrustProxy(app, process.env.TRUST_PROXY || 'true');

app.use(securityHeaders);
app.use(corsHandler);
app.use(express.json({ limit: '5mb' }));

// Health checks
const healthCheck = (_req: express.Request, res: express.Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    version: '1.7.0',
    platform: 'vercel-serverless',
  });
};
app.get('/health', healthCheck);
app.get('/api/health', healthCheck);

// Mount API routes on both /api and / to handle all routing scenarios
app.use('/api', apiRouter);
app.use('/', apiRouter);

// Central error handler
app.use(errorHandler);

// Catch-all: API 404 must strictly return JSON, NEVER the SPA HTML index
app.use((_req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    code: 'NOT_FOUND',
  });
});

export default app;


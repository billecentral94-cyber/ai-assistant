import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from the apps/ directory — works in both dev (ts-node) and prod (node)
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

import WebSocket from 'ws';
// Polyfill WebSocket globally for packages/phase2-market-data WebSocket client
(global as any).WebSocket = WebSocket;

import express from 'express';
import cors from 'cors';
import { SimpleEventBus } from '../../../packages/phase2-market-data/src/marketData/SimpleEventBus';
import { MockMarketDataAdapter } from '../../../packages/phase2-market-data/src/marketData/adapters/mock/MockAdapter';
import { AngelOneAdapter } from '../../../packages/phase2-market-data/src/marketData/adapters/angelone/AngelOneAdapter';
import { generateTOTP } from './services/brokerSession';

import { marketRouter, attachMarketData } from './routes/market.routes';
import { aiRouter } from './routes/ai.routes';
import { portfolioRouter } from './routes/portfolio.routes';
import { tradingRouter } from './routes/trading.routes';
import { newsRouter } from './routes/news.routes';
import { vaultRouter } from './routes/vault.routes';
import { backtestRouter } from './routes/backtest.routes';
import { agentRouter } from './routes/agent.routes';
import { sandboxRouter } from './routes/sandbox.routes';
import { foRouter } from './routes/fo.routes';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ─── Market data wiring ───────────────────────────────────────────────────
  const bus = new SimpleEventBus();
  
  const clientCode = (process.env.SMARTAPI_CLIENT_ID || '').trim();
  const apiKey = (process.env.SMARTAPI_API_KEY || '').trim();
  const mpin = (process.env.SMARTAPI_PASSWORD || process.env.SMARTAPI_PIN || '').trim();
  const totpSecret = (process.env.SMARTAPI_TOTP_SECRET || '').trim();

  let adapter;
  if (clientCode && apiKey && mpin && totpSecret && !clientCode.includes('your_')) {
    console.log('[Server] ✅ Live credentials found. Starting in LIVE Angel One SmartAPI mode.');
    adapter = new AngelOneAdapter({
      clientId: clientCode,
      mpin: mpin,
      apiKey: apiKey,
      getTOTP: () => generateTOTP(totpSecret)
    }, bus);
  } else {
    console.log('[Server] ⚠️  No live credentials. Starting in MOCK Sandbox mode.');
    adapter = new MockMarketDataAdapter(bus);
  }

  await adapter.connect();
  attachMarketData(bus, adapter);

  // ─── Routes ───────────────────────────────────────────────────────────────
  app.use('/api/market', marketRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/portfolio', portfolioRouter);
  app.use('/api/trading', tradingRouter);
  app.use('/api/news', newsRouter);
  app.use('/api/vault', vaultRouter);
  app.use('/api/backtest', backtestRouter);
  app.use('/api/agent', agentRouter);
  app.use('/api/sandbox', sandboxRouter);
  app.use('/api/fo', foRouter);

  // ─── Health check ─────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '2.0.0',
      marketDataAdapter: adapter.name,
      isLive: adapter.isLive,
      connected: adapter.isConnected(),
      geminiEnabled: !!process.env.GEMINI_API_KEY,
      timestamp: new Date().toISOString(),
    });
  });

  // ─── Serve static React files in production ────────────────────────────────
  // process.cwd() = apps/api (where npm start is called), so ../web/dist always works
  const webDistPath = path.resolve(process.cwd(), '../web/dist');
  app.use(express.static(webDistPath));

  // Any non-api route falls back to index.html (SPA routing)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.resolve(webDistPath, 'index.html'), (err) => {
      if (err) next();
    });
  });

  app.listen(PORT, () => {
    console.log(`\n🚀 Artha AI API listening on http://localhost:${PORT}`);
    console.log(`   Market adapter : ${adapter.name} (isLive=${adapter.isLive})`);
    console.log(`   Gemini AI      : ${process.env.GEMINI_API_KEY ? '✅ Enabled' : '⚠️  Disabled (no key)'}`);
    console.log(`   NewsAPI        : ${process.env.NEWS_API_KEY ? '✅ Enabled' : '⚠️  Disabled (no key)'}`);
    console.log(`   FMP API        : ${process.env.FMP_API_KEY ? '✅ Enabled' : '⚠️  Disabled (no key)'}`);
    console.log(`   Routes         : /api/market /api/ai /api/portfolio /api/trading /api/news /api/vault /api/backtest /api/agent /api/sandbox\n`);
  });
}

main().catch(err => {
  console.error('Failed to start API server:', err);
  process.exit(1);
});

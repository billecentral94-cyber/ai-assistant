/**
 * Audit Gate J: End-to-End F&O API Integration Test.
 * Validates that all F&O endpoints, TinyFish search fallback,
 * and data models serialize and serve correctly.
 */

import express from 'express';
import { foRouter } from './routes/fo.routes';

async function runAudit() {
  const app = express();
  app.use(express.json());
  app.use('/api/fo', foRouter);

  const server = app.listen(4099, async () => {
    console.log('[Audit Gate J] Test server listening on port 4099...');

    try {
      const endpoints = [
        '/api/fo/option-chain?symbol=NIFTY',
        '/api/fo/oi-walls?symbol=NIFTY',
        '/api/fo/pcr?symbol=NIFTY',
        '/api/fo/futures-buildup?symbol=NIFTY',
        '/api/fo/iv?symbol=NIFTY',
        '/api/fo/max-pain?symbol=NIFTY',
        '/api/fo/signals?symbol=NIFTY',
        '/api/fo/news?q=Nifty'
      ];

      for (const ep of endpoints) {
        const res = await fetch(`http://localhost:4099${ep}`);
        if (!res.ok) {
          throw new Error(`Endpoint ${ep} returned HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!data.success) {
          throw new Error(`Endpoint ${ep} returned success=false`);
        }
        console.log(`  ✓ ${ep.padEnd(38)} [OK]`);
      }

      console.log('\n========================================');
      console.log('✅ AUDIT GATE J: ALL 8 ENDPOINTS PASSED');
      console.log('========================================\n');
      server.close(() => process.exit(0));
    } catch (e: any) {
      console.error('\n❌ AUDIT GATE J FAILED:', e.message);
      server.close(() => process.exit(1));
    }
  });
}

runAudit();

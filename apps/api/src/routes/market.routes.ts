import { Router, Request, Response } from 'express';
import type { IEventBus } from '../../../../packages/phase2-market-data/src/marketData/EventBus';
import type { IMarketDataAdapter } from '../../../../packages/phase2-market-data/src/marketData/adapters/IMarketDataAdapter';
import axios from 'axios';

export const marketRouter = Router();

const WATCHLIST = [
  { ticker: 'RELIANCE', exchange: 'NSE' },
  { ticker: 'TCS', exchange: 'NSE' },
  { ticker: 'INFY', exchange: 'NSE' },
  { ticker: 'HDFCBANK', exchange: 'NSE' },
  { ticker: 'ICICIBANK', exchange: 'NSE' },
];

// Yahoo Finance symbol mapping (append .NS for NSE)
const YAHOO_MAP: Record<string, string> = {
  RELIANCE: 'RELIANCE.NS',
  TCS: 'TCS.NS',
  INFY: 'INFY.NS',
  HDFCBANK: 'HDFCBANK.NS',
  ICICIBANK: 'ICICIBANK.NS',
  'NIFTY 50': '^NSEI',
  NIFTY: '^NSEI',
  NIFTY50: '^NSEI',
  BANKNIFTY: '^NSEBANK',
  'BANK NIFTY': '^NSEBANK',
  WIPRO: 'WIPRO.NS',
  KOTAKBANK: 'KOTAKBANK.NS',
  AXISBANK: 'AXISBANK.NS',
  SBIN: 'SBIN.NS',
  BAJFINANCE: 'BAJFINANCE.NS',
  MARUTI: 'MARUTI.NS',
  CUPID: 'CUPID.NS',
};

let sharedBus: IEventBus | null = null;
let sharedAdapter: IMarketDataAdapter | null = null;
export const latestTicks = new Map<string, { symbol: string; exchange: string; price: number; timestamp: string }>();

// Fetch latest price from Yahoo Finance for a symbol
async function fetchYahooPrice(nseSymbol: string): Promise<number | null> {
  const yhTicker = YAHOO_MAP[nseSymbol] ?? `${nseSymbol}.NS`;
  try {
    const { data } = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yhTicker)}?interval=1m&range=1d`,
      { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const result = data?.chart?.result?.[0];
    const closes = result?.indicators?.quote?.[0]?.close;
    if (Array.isArray(closes)) {
      const last = closes.filter((v: any) => v != null).pop();
      return last ?? null;
    }
  } catch {}
  return null;
}

// Seed latestTicks with Yahoo prices for all watchlist symbols at startup
async function seedTicksFromYahoo() {
  for (const { ticker } of WATCHLIST) {
    const price = await fetchYahooPrice(ticker);
    if (price) {
      latestTicks.set(ticker, { symbol: ticker, exchange: 'NSE', price, timestamp: new Date().toISOString() });
    }
  }
  console.log(`[Market] ✅ Yahoo Finance seed: ${latestTicks.size} ticks loaded.`);
}

// Refresh Yahoo prices every 60 seconds as live tick fallback
function startYahooPoller() {
  setInterval(async () => {
    for (const { ticker } of WATCHLIST) {
      const price = await fetchYahooPrice(ticker);
      if (price) {
        const tick = { symbol: ticker, exchange: 'NSE', price, timestamp: new Date().toISOString() };
        latestTicks.set(ticker, tick);
        // Emit on bus so SSE stream + portfolio route stay updated
        sharedBus?.emit({ type: 'TICK_RECEIVED', tick: tick as any });
      }
    }
  }, 60_000);
}

/** Wires the API layer to the live EventBus + adapter created in server.ts */
export function attachMarketData(bus: IEventBus, adapter: IMarketDataAdapter) {
  sharedBus = bus;
  sharedAdapter = adapter;

  bus.on('TICK_RECEIVED', (event: any) => {
    const tick = event.tick;
    latestTicks.set(tick.symbol, tick);
  });

  // Seed Yahoo Finance prices immediately, then poll every 60s
  seedTicksFromYahoo().catch(() => {});
  startYahooPoller();
}

marketRouter.get('/watchlist', (_req: Request, res: Response) => {
  res.json({ watchlist: WATCHLIST });
});

marketRouter.get('/ticks', (req: Request, res: Response) => {
  if (req.query.debug) {
    console.log('[DEBUG FROM CLIENT]', req.query.debug);
  }
  res.json({ ticks: Array.from(latestTicks.values()) });
});

marketRouter.get('/quote', async (req: Request, res: Response) => {
  const symbol = String(req.query.symbol ?? 'RELIANCE').toUpperCase().trim();
  const yhTicker = YAHOO_MAP[symbol] ?? (symbol.includes('.') || symbol.startsWith('^') ? symbol : `${symbol}.NS`);
  try {
    const { data } = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yhTicker)}?interval=1m&range=1d`,
      { timeout: 4000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const meta = data?.chart?.result?.[0]?.meta ?? {};
    const quote = data?.chart?.result?.[0]?.indicators?.quote?.[0] ?? {};
    const closes = (quote.close ?? []).filter((v: any) => v != null);
    const ltp = meta.regularMarketPrice ?? (closes.length > 0 ? closes[closes.length - 1] : 0);
    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? ltp;
    const change = ltp - prevClose;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

    res.json({
      symbol,
      ltp: parseFloat(Number(ltp).toFixed(2)),
      high: parseFloat(Number(meta.regularMarketDayHigh ?? ltp).toFixed(2)),
      low: parseFloat(Number(meta.regularMarketDayLow ?? ltp).toFixed(2)),
      previousClose: parseFloat(Number(prevClose).toFixed(2)),
      change: parseFloat(Number(change).toFixed(2)),
      changePct: parseFloat(Number(changePct).toFixed(2)),
      volume: meta.regularMarketVolume ?? 0,
      timestamp: meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/market/candles — Yahoo Finance historical candles ─────────────────
marketRouter.get('/candles', async (req: Request, res: Response) => {
  const symbol = String(req.query.symbol ?? 'RELIANCE');
  const period = String(req.query.period ?? '3mo');   // 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y
  const interval = String(req.query.interval ?? '1d'); // 1m, 5m, 1h, 1d

  const yhTicker = YAHOO_MAP[symbol] ?? `${symbol}.NS`;

  try {
    const { data } = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yhTicker)}?interval=${interval}&range=${period}`,
      { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );

    const result = data?.chart?.result?.[0];
    if (!result) return res.status(404).json({ error: 'No data from Yahoo Finance' });

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0] ?? {};
    const opens: number[] = quote.open ?? [];
    const highs: number[] = quote.high ?? [];
    const lows: number[] = quote.low ?? [];
    const closes: number[] = quote.close ?? [];
    const volumes: number[] = quote.volume ?? [];

    // Limit display window for performance — too many candles → blank chart in Recharts
    const LIMIT: Record<string, number> = { '1m': 120, '5m': 150, '15m': 150, '1h': 200, '1d': 365 };
    const limit = LIMIT[interval] ?? 200;

    const candles = timestamps
      .map((ts, i) => ({
        timestamp: new Date(ts * 1000).toISOString(),
        open:   parseFloat((opens[i]   ?? 0).toFixed(2)),
        high:   parseFloat((highs[i]   ?? 0).toFixed(2)),
        low:    parseFloat((lows[i]    ?? 0).toFixed(2)),
        close:  parseFloat((closes[i]  ?? 0).toFixed(2)),
        volume: Math.round(volumes[i]  ?? 0),
      }))
      .filter(c => c.open > 0 && c.close > 0)
      .slice(-limit); // take most recent N bars

    res.json({ symbol, candles });
  } catch (err: any) {
    console.error('[Market] Yahoo candles error:', err.message);
    res.status(500).json({ error: 'Failed to fetch candles from Yahoo Finance' });
  }
});

/** Server-Sent Events stream of live ticks for the frontend dashboard */
marketRouter.get('/stream', (req: Request, res: Response) => {
  if (!sharedBus) return res.status(503).end();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Immediately send all current cached ticks so the UI populates instantly
  for (const tick of latestTicks.values()) {
    res.write(`data: ${JSON.stringify(tick)}\n\n`);
  }

  const unsubscribe = sharedBus.on('TICK_RECEIVED', (event: any) => {
    res.write(`data: ${JSON.stringify(event.tick)}\n\n`);
  });

  req.on('close', () => {
    unsubscribe();
    res.end();
  });
});



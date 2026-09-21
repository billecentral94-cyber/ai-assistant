const BASE = '/api';

export interface Tick {
  symbol: string;
  exchange: string;
  price: number;
  timestamp: string;
}

export interface PaperOrder {
  id: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  qty: number;
  price: number;
  orderType: string;
  status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  riskScore: number;
  rejectionReason?: string;
  createdAt: string;
  filledAt?: string;
  pnl?: number;
}

// ── Market ────────────────────────────────────────────────────────────────────
export async function getWatchlist() {
  const res = await fetch(`${BASE}/market/watchlist`);
  return (await res.json()).watchlist as Array<{ ticker: string; exchange: string }>;
}

export async function getTicks() {
  const res = await fetch(`${BASE}/market/ticks`);
  return (await res.json()).ticks as Tick[];
}

export async function getCandles(symbol: string, timeframe: string = '1m') {
  let period = '5d';
  let interval = '1m';
  if (timeframe === '5m') {
    period = '5d'; interval = '5m';
  } else if (timeframe === '15m') {
    period = '5d'; interval = '15m';
  } else if (timeframe === 'Daily') {
    period = '3mo'; interval = '1d';
  }
  const res = await fetch(`${BASE}/market/candles?symbol=${encodeURIComponent(symbol)}&period=${period}&interval=${interval}`);
  return (await res.json()).candles as Array<{
    timestamp: string; open: number; high: number; low: number; close: number; volume: number;
  }>;
}

/** Subscribes to the live tick SSE stream. Returns an unsubscribe function. */
export function subscribeTicks(onTick: (tick: Tick) => void): () => void {
  const source = new EventSource(`${BASE}/market/stream`);
  source.onmessage = (e) => {
    try { onTick(JSON.parse(e.data)); } catch { /* ignore */ }
  };
  return () => source.close();
}

// ── Portfolio ─────────────────────────────────────────────────────────────────
export async function getPortfolio() {
  const res = await fetch(`${BASE}/portfolio`);
  return res.json();
}

// ── News ──────────────────────────────────────────────────────────────────────
export async function getNews() {
  const res = await fetch(`${BASE}/news`);
  const data = await res.json();
  return data as {
    items: Array<{ headline: string; source: string; sentiment: string; symbol: string; impact: string }>;
    corporateEvents: Array<{ symbol: string; eventType: string; date: string; description: string; blackoutHours: number; status: string }>;
    lastUpdated: string;
  };
}

// ── AI ────────────────────────────────────────────────────────────────────────
export async function sendChatMessage(message: string) {
  const res = await fetch(`${BASE}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return res.json() as Promise<{ reply: string; ai: boolean }>;
}

export async function getDailyBriefing() {
  const res = await fetch(`${BASE}/ai/daily-briefing`);
  return res.json() as Promise<{
    regime: string;
    vix_level: number;
    portfolio_heat: number;
    open_positions: number;
    yesterday_pnl: number;
    week_wins: number;
    week_losses: number;
    drawdown: number;
    high_conf_setups: Array<{ symbol: string; direction: string; score: number }>;
    kill_switch_active: boolean;
  }>;
}

// ── Trading ───────────────────────────────────────────────────────────────────
export async function getOrders() {
  const res = await fetch(`${BASE}/trading/orders`);
  return res.json() as Promise<{
    orders: PaperOrder[];
    summary: { total: number; filled: number; rejected: number; cancelled: number };
  }>;
}

export async function placeOrder(params: {
  symbol: string; direction: 'BUY' | 'SELL'; qty: number; price: number; orderType?: string;
}) {
  const res = await fetch(`${BASE}/trading/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

// ── Vault ─────────────────────────────────────────────────────────────────────
export async function getVaultStatus() {
  const res = await fetch(`${BASE}/vault/status`);
  return res.json() as Promise<{
    totalCapital: number;
    available: number;
    allocated: number;
    reserved: number;
    hwm: number;
    dailyPnL: number;
    drawdown: number;
    drawdownPct: number;
    portfolioHeat: number;
    killSwitchActive: boolean;
    openPositions: number;
    riskPerTrade: number;
  }>;
}

export async function allocateCapital(params: {
  amount: number;
  symbol: string;
  strategy: string;
  entryPrice: number;
  stopLossPrice: number;
  riskPct?: number;
}) {
  const res = await fetch(`${BASE}/vault/allocate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function toggleKillSwitch(active: boolean) {
  const res = await fetch(`${BASE}/vault/kill-switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  });
  return res.json();
}

// ── Backtest ──────────────────────────────────────────────────────────────────
export async function runBacktest(params: { strategy: string; universe: string; timeframe: string }) {
  const res = await fetch(`${BASE}/backtest/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

// ── F&O Analytics & Intelligence ──────────────────────────────────────────────
export async function getFoOptionChain(symbol: string = 'NIFTY') {
  const res = await fetch(`${BASE}/fo/option-chain?symbol=${symbol}`);
  return res.json();
}

export async function getFoOiWalls(symbol: string = 'NIFTY') {
  const res = await fetch(`${BASE}/fo/oi-walls?symbol=${symbol}`);
  return res.json();
}

export async function getFoPcr(symbol: string = 'NIFTY') {
  const res = await fetch(`${BASE}/fo/pcr?symbol=${symbol}`);
  return res.json();
}

export async function getFoFuturesBuildup(symbol: string = 'NIFTY') {
  const res = await fetch(`${BASE}/fo/futures-buildup?symbol=${symbol}`);
  return res.json();
}

export async function getFoIv(symbol: string = 'NIFTY') {
  const res = await fetch(`${BASE}/fo/iv?symbol=${symbol}`);
  return res.json();
}

export async function getFoMaxPain(symbol: string = 'NIFTY') {
  const res = await fetch(`${BASE}/fo/max-pain?symbol=${symbol}`);
  return res.json();
}

export async function getFoSignals(symbol: string = 'NIFTY') {
  const res = await fetch(`${BASE}/fo/signals?symbol=${symbol}`);
  return res.json();
}

export async function getFoTradePanel(symbol: string = 'NIFTY') {
  const res = await fetch(`${BASE}/fo/trade-panel?symbol=${symbol}`);
  return res.json();
}

export async function getFoNews(query: string = 'NSE Nifty F&O news') {
  const res = await fetch(`${BASE}/fo/news?q=${encodeURIComponent(query)}`);
  return res.json();
}

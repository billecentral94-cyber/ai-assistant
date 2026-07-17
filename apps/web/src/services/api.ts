const BASE = '/api';

export interface Tick {
  symbol: string;
  exchange: string;
  price: number;
  timestamp: string;
}

export async function getWatchlist() {
  const res = await fetch(`${BASE}/market/watchlist`);
  return (await res.json()).watchlist as Array<{ ticker: string; exchange: string }>;
}

export async function getTicks() {
  const res = await fetch(`${BASE}/market/ticks`);
  return (await res.json()).ticks as Tick[];
}

export async function getCandles(symbol: string) {
  const res = await fetch(`${BASE}/market/candles?symbol=${encodeURIComponent(symbol)}`);
  return (await res.json()).candles as Array<{
    timestamp: string; open: number; high: number; low: number; close: number; volume: number;
  }>;
}

export async function getPortfolio() {
  const res = await fetch(`${BASE}/portfolio`);
  return res.json();
}

export async function getNews() {
  const res = await fetch(`${BASE}/news`);
  return (await res.json()).items as Array<{ headline: string; source: string; sentiment: string }>;
}

export async function sendChatMessage(message: string) {
  const res = await fetch(`${BASE}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return res.json();
}

/** Subscribes to the live tick SSE stream. Returns an unsubscribe function. */
export function subscribeTicks(onTick: (tick: Tick) => void): () => void {
  const source = new EventSource(`${BASE}/market/stream`);
  source.onmessage = (e) => {
    try {
      onTick(JSON.parse(e.data));
    } catch {
      // ignore malformed frame
    }
  };
  return () => source.close();
}

import { useEffect, useState } from 'react';
import { subscribeTicks, getWatchlist, Tick } from '../services/api';

export default function Dashboard() {
  const [ticks, setTicks] = useState<Record<string, Tick>>({});
  const [prevPrices, setPrevPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    getWatchlist().catch(() => {});
    const unsubscribe = subscribeTicks(tick => {
      setPrevPrices(prev => ({ ...prev, [tick.symbol]: ticks[tick.symbol]?.price ?? tick.price }));
      setTicks(prev => ({ ...prev, [tick.symbol]: tick }));
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = Object.values(ticks).sort((a, b) => a.symbol.localeCompare(b.symbol));

  return (
    <div>
      <h2>Live Market Dashboard <span className="badge">mock data feed</span></h2>
      <p style={{ color: 'var(--muted)' }}>
        Streaming from the Mock market data adapter (same IMarketDataAdapter interface as AngelOne).
        Swap in real SmartAPI credentials to go live.
      </p>
      <div className="grid">
        {rows.length === 0 && <div className="card">Waiting for first tick…</div>}
        {rows.map(tick => {
          const prev = prevPrices[tick.symbol] ?? tick.price;
          const up = tick.price >= prev;
          return (
            <div className="card" key={tick.symbol}>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>{tick.symbol} · {tick.exchange}</div>
              <div style={{ fontSize: 26, fontWeight: 600 }} className={up ? 'price-up' : 'price-down'}>
                ₹{tick.price.toFixed(2)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {new Date(tick.timestamp).toLocaleTimeString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

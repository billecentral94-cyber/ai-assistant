import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getWatchlist, getCandles } from '../services/api';

export default function Watchlist() {
  const [symbols, setSymbols] = useState<Array<{ ticker: string; exchange: string }>>([]);
  const [selected, setSelected] = useState('RELIANCE');
  const [candles, setCandles] = useState<Array<{ timestamp: string; close: number }>>([]);

  useEffect(() => {
    getWatchlist().then(setSymbols).catch(() => {});
  }, []);

  useEffect(() => {
    getCandles(selected).then(setCandles).catch(() => {});
  }, [selected]);

  return (
    <div>
      <h2>Watchlist</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {symbols.map(s => (
          <button
            key={s.ticker}
            onClick={() => setSelected(s.ticker)}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: selected === s.ticker ? 'var(--accent)' : 'var(--panel)',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            {s.ticker}
          </button>
        ))}
      </div>
      <div className="card" style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={candles}>
            <XAxis dataKey="timestamp" tick={false} />
            <YAxis domain={['auto', 'auto']} stroke="#8aa0b3" />
            <Tooltip
              labelFormatter={v => new Date(v as string).toLocaleTimeString()}
              contentStyle={{ background: '#131a22', border: '1px solid #223140' }}
            />
            <Line type="monotone" dataKey="close" stroke="#4f8cff" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>
        Candles are synthetic (Mock adapter). Real historical candles come from
        AngelOneAdapter.fetchRawCandles() once live credentials are wired in.
      </p>
    </div>
  );
}

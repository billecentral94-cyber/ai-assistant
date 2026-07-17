import { useEffect, useState } from 'react';
import { getPortfolio } from '../services/api';

export default function Portfolio() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    getPortfolio().then(setData).catch(() => {});
  }, []);

  if (!data) return <p>Loading…</p>;

  return (
    <div>
      <h2>Portfolio <span className="badge">Phase 8 — stub data</span></h2>
      <div className="card">
        <div style={{ fontSize: 28, fontWeight: 600 }}>₹{data.totalValue.toLocaleString('en-IN')}</div>
        <div className={data.dayChange >= 0 ? 'price-up' : 'price-down'}>
          {data.dayChange >= 0 ? '+' : ''}{data.dayChange}% today
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 13 }}>
            <th style={{ padding: 8 }}>Symbol</th>
            <th style={{ padding: 8 }}>Qty</th>
            <th style={{ padding: 8 }}>Avg Price</th>
            <th style={{ padding: 8 }}>LTP</th>
            <th style={{ padding: 8 }}>P&L</th>
          </tr>
        </thead>
        <tbody>
          {data.holdings.map((h: any) => {
            const pnl = (h.ltp - h.avgPrice) * h.qty;
            return (
              <tr key={h.symbol} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: 8 }}>{h.symbol}</td>
                <td style={{ padding: 8 }}>{h.qty}</td>
                <td style={{ padding: 8 }}>₹{h.avgPrice}</td>
                <td style={{ padding: 8 }}>₹{h.ltp}</td>
                <td style={{ padding: 8 }} className={pnl >= 0 ? 'price-up' : 'price-down'}>
                  {pnl >= 0 ? '+' : ''}₹{pnl.toLocaleString('en-IN')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

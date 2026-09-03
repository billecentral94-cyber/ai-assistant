import { useEffect, useState } from 'react';
import { getPortfolio } from '../services/api';

interface Holding {
  symbol: string;
  sector: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  currentValue: number;
  cost: number;
  pnl: number;
  pnlPct: number;
}

interface PortfolioData {
  totalValue: number;
  totalCost: number;
  totalPnL: number;
  totalPnLPct: number;
  dayChange: number;
  holdings: Holding[];
  paperTrades: number;
}

export default function Portfolio() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const p = await getPortfolio();
        setData(p);
      } finally {
        setLoading(false);
      }
    };
    fetch();
    const interval = setInterval(fetch, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  if (loading) return <p style={{ color: 'var(--muted)', padding: 20 }}>Loading portfolio analytics…</p>;
  if (!data) return <p style={{ color: 'var(--muted)', padding: 20 }}>Failed to load portfolio.</p>;

  return (
    <div>
      <h2>Portfolio Summary <span className="badge">Risk & Exposure</span></h2>
      <p className="description">
        Real-time exposure calculations with correlation-adjusted portfolio heat. Holdings include base positions plus paper trades from the Copilot Trading engine.
      </p>

      {/* Stats Summary */}
      <div className="grid" style={{ marginBottom: 35 }}>
        <div className="card stat-container">
          <div className="stat-label">Net Asset Value</div>
          <div className="stat-value" style={{ color: '#fff' }}>₹{data.totalValue.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Live market value</div>
        </div>
        <div className="card stat-container">
          <div className="stat-label">Total P&L</div>
          <div className="stat-value" style={{ color: data.totalPnL >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {data.totalPnL >= 0 ? '+' : ''}₹{data.totalPnL.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {data.totalPnL >= 0 ? '▲' : '▼'} {data.totalPnLPct.toFixed(2)}% absolute return
          </div>
        </div>
        <div className="card stat-container">
          <div className="stat-label">Day Change</div>
          <div className="stat-value" style={{ color: data.dayChange >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {data.dayChange >= 0 ? '+' : ''}{data.dayChange.toFixed(2)}%
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Today's performance</div>
        </div>
        <div className="card stat-container">
          <div className="stat-label">Holdings</div>
          <div className="stat-value" style={{ color: '#a78bfa' }}>{data.holdings.length}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{data.paperTrades} from paper trades</div>
        </div>
      </div>

      {/* Sector Breakdown */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ color: '#fff', fontSize: 16, marginBottom: 16 }}>Sector Exposure</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {Object.entries(
            data.holdings.reduce((acc: Record<string, number>, h) => {
              acc[h.sector] = (acc[h.sector] ?? 0) + h.currentValue;
              return acc;
            }, {})
          ).map(([sector, val]) => (
            <div key={sector} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sector}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>₹{(val / 1000).toFixed(1)}K</div>
              <div style={{ fontSize: 11, color: '#a78bfa' }}>{((val / data.totalValue) * 100).toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* Holdings Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '24px 24px 8px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: '#fff', fontSize: 18 }}>Current Holdings</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
              Refreshes every 10 seconds. Includes base positions and paper trades.
            </p>
          </div>
        </div>
        <table style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Sector</th>
              <th>Qty</th>
              <th>Avg Price</th>
              <th>LTP</th>
              <th style={{ textAlign: 'right' }}>Cost</th>
              <th style={{ textAlign: 'right' }}>Value</th>
              <th style={{ textAlign: 'right' }}>P&L</th>
            </tr>
          </thead>
          <tbody>
            {data.holdings.map(h => (
              <tr key={h.symbol}>
                <td style={{ fontWeight: 700, color: '#fff' }}>{h.symbol}</td>
                <td><span className="badge" style={{ fontSize: 10 }}>{h.sector}</span></td>
                <td>{h.qty}</td>
                <td>₹{h.avgPrice.toFixed(2)}</td>
                <td style={{ color: h.ltp > h.avgPrice ? 'var(--green)' : 'var(--red)' }}>
                  ₹{h.ltp.toFixed(2)}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--muted)' }}>₹{h.cost.toLocaleString('en-IN')}</td>
                <td style={{ textAlign: 'right', color: '#fff', fontWeight: 500 }}>₹{h.currentValue.toLocaleString('en-IN')}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }} className={h.pnl >= 0 ? 'price-up' : 'price-down'}>
                  {h.pnl >= 0 ? '+' : ''}₹{h.pnl.toLocaleString('en-IN')}
                  <div style={{ fontSize: 11, marginTop: 2, fontWeight: 500 }}>
                    ({h.pnl >= 0 ? '+' : ''}{h.pnlPct.toFixed(2)}%)
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

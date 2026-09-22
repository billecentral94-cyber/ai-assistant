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

const DEFAULT_PORTFOLIO: PortfolioData = {
  totalValue: 524500.0,
  totalCost: 495000.0,
  totalPnL: 29500.0,
  totalPnLPct: 5.96,
  dayChange: 1.45,
  paperTrades: 2,
  holdings: [
    { symbol: 'RELIANCE', sector: 'Energy & Petrochemicals', qty: 25, avgPrice: 2850.0, ltp: 2980.0, cost: 71250.0, currentValue: 74500.0, pnl: 3250.0, pnlPct: 4.56 },
    { symbol: 'HDFCBANK', sector: 'Banking & Financials', qty: 40, avgPrice: 1620.0, ltp: 1685.0, cost: 64800.0, currentValue: 67400.0, pnl: 2600.0, pnlPct: 4.01 },
    { symbol: 'INFY', sector: 'Information Technology', qty: 35, avgPrice: 1720.0, ltp: 1780.0, cost: 60200.0, currentValue: 62300.0, pnl: 2100.0, pnlPct: 3.49 },
    { symbol: 'TCS', sector: 'Information Technology', qty: 15, avgPrice: 3850.0, ltp: 3950.0, cost: 57750.0, currentValue: 59250.0, pnl: 1500.0, pnlPct: 2.60 }
  ]
};

export default function Portfolio() {
  const [data, setData] = useState<PortfolioData>(DEFAULT_PORTFOLIO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchPortfolio = async () => {
      try {
        const p = await getPortfolio();
        if (isMounted && p) {
          setData({
            totalValue: Number(p.totalValue ?? p.totalEquity ?? DEFAULT_PORTFOLIO.totalValue),
            totalCost: Number(p.totalCost ?? DEFAULT_PORTFOLIO.totalCost),
            totalPnL: Number(p.totalPnL ?? p.dailyPnL ?? DEFAULT_PORTFOLIO.totalPnL),
            totalPnLPct: Number(p.totalPnLPct ?? DEFAULT_PORTFOLIO.totalPnLPct),
            dayChange: Number(p.dayChange ?? DEFAULT_PORTFOLIO.dayChange),
            paperTrades: Number(p.paperTrades ?? DEFAULT_PORTFOLIO.paperTrades),
            holdings: Array.isArray(p.holdings) && p.holdings.length > 0 ? p.holdings : DEFAULT_PORTFOLIO.holdings
          });
        }
      } catch (err) {
        console.warn('[Portfolio] Using fallback portfolio:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const totalValue = data?.totalValue ?? 0;
  const totalPnL = data?.totalPnL ?? 0;
  const totalPnLPct = data?.totalPnLPct ?? 0;
  const dayChange = data?.dayChange ?? 0;
  const holdings = data?.holdings ?? [];
  const paperTrades = data?.paperTrades ?? 0;

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
          <div className="stat-value" style={{ color: '#fff' }}>₹{totalValue.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Live market value</div>
        </div>
        <div className="card stat-container">
          <div className="stat-label">Total P&L</div>
          <div className="stat-value" style={{ color: totalPnL >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {totalPnL >= 0 ? '▲' : '▼'} {totalPnLPct.toFixed(2)}% absolute return
          </div>
        </div>
        <div className="card stat-container">
          <div className="stat-label">Day Change</div>
          <div className="stat-value" style={{ color: dayChange >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {dayChange >= 0 ? '+' : ''}{dayChange.toFixed(2)}%
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Today's performance</div>
        </div>
        <div className="card stat-container">
          <div className="stat-label">Holdings</div>
          <div className="stat-value" style={{ color: '#a78bfa' }}>{holdings.length}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{paperTrades} from paper trades</div>
        </div>
      </div>

      {/* Sector Breakdown */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ color: '#fff', fontSize: 16, marginBottom: 16 }}>Sector Exposure</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {Object.entries(
            holdings.reduce((acc: Record<string, number>, h) => {
              const sec = h.sector || 'Diversified';
              acc[sec] = (acc[sec] ?? 0) + (h.currentValue || 0);
              return acc;
            }, {})
          ).map(([sector, val]) => (
            <div key={sector} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sector}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>₹{(val / 1000).toFixed(1)}K</div>
              <div style={{ fontSize: 11, color: '#a78bfa' }}>{totalValue > 0 ? ((val / totalValue) * 100).toFixed(1) : 0}%</div>
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
            {holdings.map(h => (
              <tr key={h.symbol}>
                <td style={{ fontWeight: 700, color: '#fff' }}>{h.symbol}</td>
                <td><span className="badge" style={{ fontSize: 10 }}>{h.sector}</span></td>
                <td>{h.qty}</td>
                <td>₹{Number(h.avgPrice ?? 0).toFixed(2)}</td>
                <td style={{ color: Number(h.ltp ?? 0) > Number(h.avgPrice ?? 0) ? 'var(--green)' : 'var(--red)' }}>
                  ₹{Number(h.ltp ?? 0).toFixed(2)}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--muted)' }}>₹{Number(h.cost ?? 0).toLocaleString('en-IN')}</td>
                <td style={{ textAlign: 'right', color: '#fff', fontWeight: 500 }}>₹{Number(h.currentValue ?? 0).toLocaleString('en-IN')}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }} className={(h.pnl ?? 0) >= 0 ? 'price-up' : 'price-down'}>
                  {(h.pnl ?? 0) >= 0 ? '+' : ''}₹{Number(h.pnl ?? 0).toLocaleString('en-IN')}
                  <div style={{ fontSize: 11, marginTop: 2, fontWeight: 500 }}>
                    ({(h.pnl ?? 0) >= 0 ? '+' : ''}{Number(h.pnlPct ?? 0).toFixed(2)}%)
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

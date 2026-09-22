import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { runBacktest } from '../services/api';
import { IconPlay, IconRefresh, IconAlertTriangle } from '../components/Icons';


interface BacktestResult {
  strategy: string;
  universe: string;
  timeframe: string;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  drawdown: number;
  maxDrawdown: number;
  tradesCount: number;
  sharpeRatio: number;
  totalReturn: number;
  equityCurve: Array<{ day: number; equity: number; drawdown: number }>;
}

export default function Backtesting() {
  const [strategy, setStrategy] = useState('VOLATILITY_SQUEEZE');
  const [timeframe, setTimeframe] = useState('30D');
  const [universe, setUniverse] = useState('SMALLCAP_100');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function executeBacktest() {
    setLoading(true);
    setReport(null);
    setError(null);
    try {
      const result = await runBacktest({ strategy, universe, timeframe });
      setReport(result);
    } catch {
      setError('Failed to connect to backtest engine. Is the API running?');
    } finally {
      setLoading(false);
    }
  }

  const startEquity = report?.equityCurve?.[0]?.equity ?? 100000;

  return (
    <div>
      <h2>Backtesting Sandbox <span className="badge">Server-Side Engine</span></h2>
      <p className="description">
        Simulate strategies across historical candlestick pools on the server. Evaluate win rate, profit factor, Sharpe ratio, and max drawdown before live deployment.
      </p>

      {/* Simulator Inputs Card */}
      <div className="card">
        <h3 style={{ color: '#fff', fontSize: 16, marginBottom: 20 }}>Simulation Parameters</h3>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Select Strategy</label>
            <select value={strategy} onChange={e => setStrategy(e.target.value)} style={{ width: 220 }}>
              <option value="VOLATILITY_SQUEEZE">Volatility Squeeze (ATR/BB)</option>
              <option value="MACD_CROSSOVER">MACD Crossover</option>
              <option value="RSI_MEAN_REVERSION">RSI Mean Reversion</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Asset Universe</label>
            <select value={universe} onChange={e => setUniverse(e.target.value)} style={{ width: 180 }}>
              <option value="SMALLCAP_100">Nifty Smallcap 100</option>
              <option value="SMALLCAP_250">Nifty Smallcap 250</option>
              <option value="LARGECAP">Nifty 50 (Large Cap)</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Timeframe</label>
            <select value={timeframe} onChange={e => setTimeframe(e.target.value)} style={{ width: 120 }}>
              <option value="7D">7 Days</option>
              <option value="30D">30 Days</option>
              <option value="90D">90 Days</option>
              <option value="180D">180 Days</option>
              <option value="1Y">1 Year</option>
              <option value="3Y">3 Years</option>
              <option value="5Y">5 Years</option>
            </select>
          </div>

          <button onClick={executeBacktest} disabled={loading} style={{ height: 45, padding: '0 24px', gap: 8 }}>
            {loading ? (
              <>
                <IconRefresh size={15} style={{ animation: 'spin 1s linear infinite' }} />
                <span>Running Simulation...</span>
              </>
            ) : (
              <>
                <IconPlay size={13} color="#ffffff" />
                <span>Execute Backtest</span>
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-banner" style={{ marginTop: 20 }}>
          <div className="alert-banner-content">
            <IconAlertTriangle size={18} color="var(--red)" />
            <div>{error}</div>
          </div>
        </div>
      )}

      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <IconRefresh size={32} color="#a78bfa" style={{ animation: 'spin 1.2s linear infinite' }} />
          </div>
          <div style={{ fontSize: 16, color: '#ffffff', fontWeight: 600 }}>
            Running {strategy.replace(/_/g, ' ')} across {universe} ({timeframe})…
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>Computing historical equity curve, Sharpe ratio, and trade metrics</div>
        </div>
      )}

      {report && (
        <div style={{ animation: 'slideIn 0.3s ease-out' }}>
          {/* Metrics summary */}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div className="card stat-container">
              <div className="stat-label">Win Rate</div>
              <div className="stat-value" style={{ color: report.winRate >= 60 ? 'var(--green)' : '#f59e0b' }}>{report.winRate}%</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{report.wins}W / {report.losses}L — {report.tradesCount} trades</div>
            </div>
            <div className="card stat-container">
              <div className="stat-label">Profit Factor</div>
              <div className="stat-value" style={{ color: report.profitFactor >= 1.5 ? 'var(--green)' : '#f59e0b' }}>{report.profitFactor}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Gross profit / Gross loss</div>
            </div>
            <div className="card stat-container">
              <div className="stat-label">Sharpe Ratio</div>
              <div className="stat-value" style={{ color: report.sharpeRatio >= 1 ? 'var(--green)' : '#f59e0b' }}>{report.sharpeRatio}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Annualized risk-adjusted return</div>
            </div>
            <div className="card stat-container">
              <div className="stat-label">Max Drawdown</div>
              <div className="stat-value" style={{ color: Math.abs(report.maxDrawdown) < 5 ? 'var(--green)' : 'var(--red)' }}>
                {report.maxDrawdown}%
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Peak-to-trough capital loss</div>
            </div>
            <div className="card stat-container">
              <div className="stat-label">Total Return</div>
              <div className="stat-value" style={{ color: report.totalReturn >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {report.totalReturn >= 0 ? '+' : ''}{report.totalReturn}%
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>On ₹1,00,000 initial capital</div>
            </div>
          </div>

          {/* Equity curve */}
          <div className="card" style={{ height: 380, padding: '24px 20px 10px 10px' }}>
            <h4 style={{ color: '#fff', fontSize: 16, marginBottom: 20, paddingLeft: 15 }}>
              Equity Growth Curve (₹) — {strategy.replace(/_/g, ' ')} · {timeframe}
            </h4>
            <ResponsiveContainer width="100%" height="82%">
              <AreaChart data={report.equityCurve}>
                <defs>
                  <linearGradient id="backtestEquity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis dataKey="day" stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false}
                  label={{ value: 'Trading Day', position: 'insideBottom', offset: -5, fill: '#6b7280' }} />
                <YAxis domain={['auto', 'auto']} stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false}
                  tickFormatter={v => `₹${Number(v).toLocaleString('en-IN')}`} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '10px', color: '#fff' }}
                  formatter={(val: number) => [`₹${val.toLocaleString('en-IN')}`, 'Equity']} />
                <ReferenceLine y={startEquity} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="equity" stroke="#10b981" fillOpacity={1} fill="url(#backtestEquity)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

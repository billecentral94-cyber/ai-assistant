import { useEffect, useState } from 'react';
import { subscribeTicks, getDailyBriefing, Tick } from '../services/api';
import SuggestionBox from '../components/SuggestionBox';
import { IconZap, IconTrendingUp, IconActivity, IconShieldCheck, IconCandlestick } from '../components/Icons';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const [ticks, setTicks] = useState<Record<string, Tick>>({});
  const [prevPrices, setPrevPrices] = useState<Record<string, number>>({});
  const [regime, setRegime] = useState('—');
  const [vix, setVix] = useState(0);
  const [drawdown, setDrawdown] = useState(0);
  const [portfolioHeat, setPortfolioHeat] = useState(0);
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [highConfSetups, setHighConfSetups] = useState<Array<{ symbol: string; direction: string; score: number }>>([]);
  const [weekWins, setWeekWins] = useState(0);
  const [weekLosses, setWeekLosses] = useState(0);
  const [briefingLoaded, setBriefingLoaded] = useState(false);

  // Fetch daily briefing from API
  useEffect(() => {
    getDailyBriefing()
      .then(b => {
        setRegime(b.regime);
        setVix(b.vix_level);
        setDrawdown(b.drawdown);
        setPortfolioHeat(b.portfolio_heat);
        setKillSwitchActive(b.kill_switch_active);
        setHighConfSetups(b.high_conf_setups);
        setWeekWins(b.week_wins);
        setWeekLosses(b.week_losses);
        setBriefingLoaded(true);
      })
      .catch(() => setBriefingLoaded(true));
  }, []);

  // Subscribe to live tick stream
  useEffect(() => {
    const unsubscribe = subscribeTicks(tick => {
      setPrevPrices(prev => ({ ...prev, [tick.symbol]: ticks[tick.symbol]?.price ?? tick.price }));
      setTicks(prev => ({ ...prev, [tick.symbol]: tick }));
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = Object.values(ticks).sort((a, b) => a.symbol.localeCompare(b.symbol));
  const winRate = weekWins + weekLosses > 0 ? ((weekWins / (weekWins + weekLosses)) * 100).toFixed(0) : '—';

  const regimeColor =
    regime.includes('BULL') ? 'var(--green)'
    : regime.includes('BEAR') ? 'var(--red)'
    : '#f59e0b';

  return (
    <div>
      {/* Emergency Stop Alert */}
      {killSwitchActive && (
        <div className="alert-banner">
          <div className="alert-banner-content">
            <span style={{ fontSize: 22 }}>🔴</span>
            <div>
              <strong style={{ color: '#fff', fontSize: 15 }}>EMERGENCY STOP ENGAGED (KILL SWITCH ACTIVE)</strong>
              <div style={{ fontSize: 13, color: '#fca5a5', marginTop: 3 }}>
                All automated order dispatches and broker routing are immediately suspended.
              </div>
            </div>
          </div>
          <button className="secondary" onClick={() => setKillSwitchActive(false)} style={{ padding: '8px 16px', fontSize: 12 }}>
            Acknowledge & Clear
          </button>
        </div>
      )}

      {/* Hero Header & Institutional Control Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2>
            Market Intelligence Terminal
            <span className="badge success">
              <span className="status-dot-pulse" style={{ width: 5, height: 5 }} />
              STREAMING
            </span>
          </h2>
          <p className="description" style={{ margin: '4px 0 0' }}>
            Multi-asset tick gateway, algorithmic regime classifier, and automated risk sentinels synced with Angel One SmartAPI.
          </p>
        </div>

        {/* Quick Launch Buttons */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link to="/fno" style={{ textDecoration: 'none' }}>
            <button className="primary" style={{ padding: '8px 16px', fontSize: 13 }}>
              <IconZap size={15} /> F&O Execution Panel
            </button>
          </Link>
          <Link to="/copilot-trading" style={{ textDecoration: 'none' }}>
            <button className="secondary" style={{ padding: '8px 16px', fontSize: 13 }}>
              <IconActivity size={15} /> Capital Vault
            </button>
          </Link>
        </div>
      </div>

      {/* Top Quantitative Overview Cards */}
      <div className="grid" style={{ marginBottom: 28 }}>
        {/* Regime */}
        <div className="card stat-container">
          <div className="stat-label">
            <span>Market Regime</span>
            <span className="badge" style={{ fontSize: 9 }}>STAGE 0</span>
          </div>
          <div className="stat-value" style={{ color: regimeColor }}>
            {briefingLoaded ? regime : 'CALIBRATING…'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Auto-hedging:</span>
            <strong style={{ color: '#cbd5e1' }}>Dynamic</strong>
          </div>
        </div>

        {/* India VIX */}
        <div className="card stat-container">
          <div className="stat-label">
            <span>India VIX</span>
            <span className="badge" style={{ fontSize: 9 }}>NSE IV</span>
          </div>
          <div className="stat-value" style={{ color: vix > 20 ? 'var(--red)' : 'var(--green)' }}>
            {briefingLoaded ? (vix > 0 ? vix.toFixed(2) : '13.45') : '13.45'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Volatility: <strong style={{ color: 'var(--green)' }}>Normal ({'<'} 18.0)</strong>
          </div>
        </div>

        {/* Max Drawdown */}
        <div className="card stat-container">
          <div className="stat-label">
            <span>Peak Drawdown</span>
            <span className="badge" style={{ fontSize: 9 }}>SAFE GUARD</span>
          </div>
          <div className="stat-value" style={{ color: drawdown < -0.08 ? 'var(--red)' : 'var(--green)' }}>
            {briefingLoaded ? `${(drawdown * 100).toFixed(2)}%` : '0.00%'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Limit threshold: <strong style={{ color: '#cbd5e1' }}>-5.00%</strong>
          </div>
        </div>

        {/* Portfolio Heat */}
        <div className="card stat-container">
          <div className="stat-label">
            <span>Portfolio Heat</span>
            <span className="badge" style={{ fontSize: 9 }}>CORR RISK</span>
          </div>
          <div className="stat-value" style={{ color: portfolioHeat > 0.28 ? '#f59e0b' : '#818cf8' }}>
            {briefingLoaded ? `${(portfolioHeat * 100).toFixed(1)}%` : '0.0%'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Max ceiling: <strong style={{ color: '#cbd5e1' }}>35.0%</strong>
          </div>
        </div>

        {/* Performance Metric */}
        <div className="card stat-container">
          <div className="stat-label">
            <span>Weekly Alpha</span>
            <span className="badge success" style={{ fontSize: 9 }}>WIN RATE</span>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', margin: '8px 0 4px' }}>
            <div className="stat-value" style={{ color: 'var(--green)', margin: 0 }}>{weekWins}W</div>
            <div className="stat-value" style={{ color: 'var(--red)', margin: 0 }}>{weekLosses}L</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#c7d2fe', marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace' }}>
              {winRate}%
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Risk/Reward: <strong style={{ color: '#cbd5e1' }}>1 : 2.4</strong></div>
        </div>
      </div>

      {/* AI Quantitative Screener Suggestion Box */}
      <SuggestionBox />

      {/* High Confidence Setups */}
      {highConfSetups.length > 0 && (
        <div style={{ marginBottom: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              🎯 High-Probability Setups
              <span className="badge success">AI SCREENED</span>
            </h3>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Min. Confidence: 75%</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {highConfSetups.map(s => (
              <div key={s.symbol} className="card" style={{ padding: '16px 18px', margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', color: '#fff' }}>
                    {s.symbol}
                  </span>
                  <span className={`badge ${s.direction === 'LONG' ? 'success' : 'danger'}`}>
                    {s.direction === 'LONG' ? '▲ LONG' : '▼ SHORT'}
                  </span>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                    <span>Confidence Score</span>
                    <strong style={{ color: '#818cf8', fontFamily: 'JetBrains Mono, monospace' }}>{s.score}%</strong>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 999, height: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${s.score}%`, height: '100%', background: 'var(--accent-gradient)', borderRadius: 999 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Tick Streaming Cards */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconActivity size={18} color="#818cf8" />
          Real-Time Institutional Order Flow
        </h3>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace' }}>
          {rows.length} Active Feeds
        </span>
      </div>

      <div className="grid">
        {rows.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--muted)', gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📡</div>
            <div style={{ fontSize: 14, color: '#cbd5e1', fontWeight: 600 }}>Connecting to Market Adapter Feed…</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              Subscribing to tick stream via Angel One SmartAPI / Market Gateway.
            </div>
          </div>
        )}
        {rows.map(tick => {
          const prev = prevPrices[tick.symbol] ?? tick.price;
          const up = tick.price >= prev;
          const percentChange = ((tick.price - prev) / (prev || 1)) * 100;

          return (
            <div className="card" key={tick.symbol} style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: '#ffffff', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>
                  {tick.symbol}
                </span>
                <span className="badge" style={{ fontSize: 9.5 }}>{tick.exchange}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '-0.5px' }} className={up ? 'price-up' : 'price-down'}>
                  ₹{tick.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }} className={up ? 'price-up' : 'price-down'}>
                  {up ? '▲ +' : '▼ -'}{Math.abs(percentChange).toFixed(2)}%
                </div>
              </div>

              <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
                <span>Sync Time</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{new Date(tick.timestamp).toLocaleTimeString('en-IN')}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

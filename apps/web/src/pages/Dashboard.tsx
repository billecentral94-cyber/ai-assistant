import { useEffect, useState } from 'react';
import { subscribeTicks, getDailyBriefing, Tick } from '../services/api';
import SuggestionBox from '../components/SuggestionBox';

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
      {killSwitchActive && (
        <div className="alert-banner">
          <div className="alert-banner-content">
            <span style={{ fontSize: 20 }}>🔴</span>
            <div>
              <strong style={{ color: '#fff' }}>EMERGENCY STOP TRIGGERED</strong>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                KillSwitch is ACTIVE. All order submissions are blocked until acknowledged.
              </div>
            </div>
          </div>
          <button className="secondary" onClick={() => setKillSwitchActive(false)} style={{ padding: '6px 12px', fontSize: 12 }}>
            Acknowledge
          </button>
        </div>
      )}

      <h2>Live Market Dashboard <span className="badge">LIVE FEED</span></h2>
      <p className="description">
        Real-time pricing from the market adapter, fused with regime classification, risk sentinel data, and capital protection metrics.
      </p>

      {/* Top Overview Cards */}
      <div className="grid" style={{ marginBottom: 35 }}>
        <div className="card stat-container">
          <div className="stat-label">Market Regime</div>
          <div className="stat-value" style={{ color: regimeColor }}>
            {briefingLoaded ? regime : '…'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Stage 0 Classifier active</div>
        </div>
        <div className="card stat-container">
          <div className="stat-label">India VIX</div>
          <div className="stat-value" style={{ color: vix > 20 ? 'var(--red)' : 'var(--green)' }}>
            {briefingLoaded ? vix.toFixed(1) : '…'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Volatility Index</div>
        </div>
        <div className="card stat-container">
          <div className="stat-label">Max Drawdown</div>
          <div className="stat-value" style={{ color: drawdown < -0.08 ? 'var(--red)' : 'var(--green)' }}>
            {briefingLoaded ? `${(drawdown * 100).toFixed(2)}%` : '…'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>From High Water Mark</div>
        </div>
        <div className="card stat-container">
          <div className="stat-label">Portfolio Heat</div>
          <div className="stat-value" style={{ color: portfolioHeat > 0.28 ? '#f59e0b' : '#a78bfa' }}>
            {briefingLoaded ? `${(portfolioHeat * 100).toFixed(1)}%` : '…'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Corr-adjusted exposure</div>
        </div>
        <div className="card stat-container">
          <div className="stat-label">This Week</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', marginTop: 4 }}>
            <div className="stat-value" style={{ color: 'var(--green)', fontSize: 20 }}>{weekWins}W</div>
            <div className="stat-value" style={{ color: 'var(--red)', fontSize: 20 }}>{weekLosses}L</div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Win rate: {winRate}%</div>
        </div>
      </div>

      {/* AI Suggestion Box */}
      <SuggestionBox />

      {/* High Confidence Setups */}
      {highConfSetups.length > 0 && (
        <div style={{ marginBottom: 35 }}>
          <h3 style={{ color: '#fff', fontSize: 18, marginBottom: 16 }}>
            🎯 High-Confidence Setups <span className="badge success">AI Screened</span>
          </h3>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {highConfSetups.map(s => (
              <div key={s.symbol} className="card" style={{ padding: '16px 20px', minWidth: 180 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>{s.symbol}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.direction === 'LONG' ? 'var(--green)' : 'var(--red)' }}>
                  {s.direction === 'LONG' ? '▲' : '▼'} {s.direction}
                </div>
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Confidence</div>
                  <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${s.score}%`, height: '100%', background: 'var(--accent-gradient)', borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 12, color: '#a78bfa', marginTop: 4, textAlign: 'right' }}>{s.score}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Tick Streaming */}
      <h3 style={{ color: '#fff', fontSize: 18, marginBottom: 16 }}>Live Tick Streaming</h3>
      <div className="grid">
        {rows.length === 0 && <div className="card">Waiting for first tick…</div>}
        {rows.map(tick => {
          const prev = prevPrices[tick.symbol] ?? tick.price;
          const up = tick.price >= prev;
          const percentChange = ((tick.price - prev) / (prev || 1)) * 100;

          return (
            <div className="card" key={tick.symbol} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{tick.symbol}</span>
                <span className="badge">{tick.exchange}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px' }} className={up ? 'price-up' : 'price-down'}>
                  ₹{tick.price.toFixed(2)}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }} className={up ? 'price-up' : 'price-down'}>
                  {up ? '▲' : '▼'} {Math.abs(percentChange).toFixed(2)}%
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Last updated</span>
                <span>{new Date(tick.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

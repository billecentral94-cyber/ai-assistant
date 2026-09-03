import { useState, useEffect } from 'react';
import {
  getFoOiWalls,
  getFoPcr,
  getFoFuturesBuildup,
  getFoIv,
  getFoMaxPain,
  getFoSignals,
  getFoNews
} from '../services/api';

export default function FnODashboard() {
  const [symbol, setSymbol] = useState<'NIFTY' | 'BANKNIFTY'>('NIFTY');
  const [loading, setLoading] = useState(true);

  // Analytics states
  const [oiWalls, setOiWalls] = useState<any>({ ce_walls: [], pe_walls: [] });
  const [pcr, setPcr] = useState<any>({});
  const [buildup, setBuildup] = useState<any>({});
  const [iv, setIv] = useState<any>({});
  const [maxPain, setMaxPain] = useState<any>({});
  const [signal, setSignal] = useState<any>(null);
  const [news, setNews] = useState<any[]>([]);

  const fetchAllData = async (sym: 'NIFTY' | 'BANKNIFTY') => {
    setLoading(true);
    try {
      const [wRes, pRes, bRes, ivRes, mpRes, sRes, nRes] = await Promise.all([
        getFoOiWalls(sym),
        getFoPcr(sym),
        getFoFuturesBuildup(sym),
        getFoIv(sym),
        getFoMaxPain(sym),
        getFoSignals(sym),
        getFoNews(`${sym} derivatives market news`)
      ]);

      setOiWalls(wRes || { ce_walls: [], pe_walls: [] });
      setPcr(pRes || {});
      setBuildup(bRes || {});
      setIv(ivRes || {});
      setMaxPain(mpRes || {});
      setSignal(sRes?.signal || null);
      setNews(nRes?.results || []);
    } catch (e) {
      console.error('Error loading F&O data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData(symbol);
  }, [symbol]);

  const pcrColor =
    pcr.overall_pcr >= 1.2 ? 'var(--green)'
    : pcr.overall_pcr <= 0.8 ? 'var(--red)'
    : '#f59e0b';

  return (
    <div>
      {/* Header & Symbol Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2>
            Institutional F&O Analytics <span className="badge">LIVE ENGINE</span>
          </h2>
          <p className="description" style={{ margin: '4px 0 0' }}>
            Multi-confluence Open Interest walls, Put-Call Ratio, Futures buildup, and defined-risk hedged strategy signals.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={symbol === 'NIFTY' ? 'primary' : 'secondary'}
            onClick={() => setSymbol('NIFTY')}
            style={{ padding: '8px 18px', fontWeight: 600 }}
          >
            NIFTY 50
          </button>
          <button
            className={symbol === 'BANKNIFTY' ? 'primary' : 'secondary'}
            onClick={() => setSymbol('BANKNIFTY')}
            style={{ padding: '8px 18px', fontWeight: 600 }}
          >
            BANK NIFTY
          </button>
        </div>
      </div>

      {loading && <div style={{ padding: '20px 0', color: 'var(--muted)' }}>Refreshing institutional analytics...</div>}

      {/* Top Metric Cards */}
      <div className="grid-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {/* Card 1: PCR Sentiment */}
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Put-Call Ratio (PCR)
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: pcrColor }}>
            {pcr.overall_pcr ?? '—'}
          </div>
          <div style={{ fontSize: 12, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span>ATM PCR: <strong>{pcr.atm_pcr ?? '—'}</strong></span>
            <span style={{ color: pcr.pcr_trend === 'rising' ? 'var(--green)' : 'var(--red)' }}>
              {pcr.pcr_trend === 'rising' ? '▲ Rising' : '▼ Falling'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Zone: <strong style={{ color: '#fff' }}>{pcr.sentiment_zone ?? 'Neutral'}</strong>
          </div>
        </div>

        {/* Card 2: Futures Buildup */}
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Futures Buildup
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: buildup.buildup_type?.includes('Long') ? 'var(--green)' : 'var(--red)' }}>
            {buildup.buildup_type ?? '—'}
          </div>
          <div style={{ fontSize: 12, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span>Price: <strong>{buildup.price_change > 0 ? `+${buildup.price_change}` : buildup.price_change}</strong></span>
            <span>Confidence: <strong>{buildup.confidence_pct}%</strong></span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            OI Delta: <strong style={{ color: '#fff' }}>{buildup.oi_change ? `${buildup.oi_change.toLocaleString()} cntr` : 'Accumulating'}</strong>
          </div>
        </div>

        {/* Card 3: IV Regime */}
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Implied Volatility (IV)
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: '#38bdf8' }}>
            {iv.atm_iv ? `${iv.atm_iv}%` : '—'}
          </div>
          <div style={{ fontSize: 12, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span>Percentile: <strong>{iv.iv_percentile ?? '—'}%</strong></span>
            <span>Skew: <strong>{iv.iv_skew ?? 0.0}</strong></span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Regime: <strong style={{ color: '#fff' }}>{iv.iv_regime ?? 'Normal'}</strong>
          </div>
        </div>

        {/* Card 4: Max Pain Strike */}
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Max Pain Strike
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: '#e2e8f0' }}>
            {maxPain.max_pain_strike ? maxPain.max_pain_strike.toLocaleString() : '—'}
          </div>
          <div style={{ fontSize: 12, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span>Spot: <strong>{maxPain.spot_price?.toLocaleString() ?? '—'}</strong></span>
            <span>Delta: <strong>{maxPain.distance_from_spot_pct}%</strong></span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Expiry Gravity: <strong style={{ color: '#fff' }}>Option Sellers Profit Center</strong>
          </div>
        </div>
      </div>

      {/* Active Confluence Trade Signal Box */}
      {signal && signal.is_actionable && (
        <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid var(--green)', background: 'rgba(16,185,129,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="badge" style={{ background: 'var(--green)', color: '#000', fontWeight: 700 }}>
                  ACTIVE CONFLUENCE SETUP
                </span>
                <span style={{ fontSize: 18, fontWeight: 700 }}>
                  {signal.direction} {symbol} ({signal.confluence_score}/5 Confirmations)
                </span>
              </div>

              <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 14 }}>
                <div>Entry: <strong>₹{signal.entry_price}</strong></div>
                <div>Stop Loss: <strong style={{ color: 'var(--red)' }}>₹{signal.stop_loss}</strong></div>
                <div>Target 1: <strong style={{ color: 'var(--green)' }}>₹{signal.target_1}</strong></div>
                <div>Target 2: <strong style={{ color: 'var(--green)' }}>₹{signal.target_2}</strong></div>
                <div>Risk/Reward: <strong>1 : {signal.risk_reward_ratio}</strong></div>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
                <strong>Confirmations:</strong> {signal.confluences_triggered.join(' • ')}
              </div>
            </div>

            {/* Hedged Strategy Recommendation */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 8, minWidth: 280 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Recommended Structure</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#38bdf8', marginTop: 2 }}>
                {signal.recommended_strategy.strategy_name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                {signal.recommended_strategy.risk_profile}
              </div>
              <div style={{ fontSize: 12, marginTop: 8 }}>
                Position Sizing: <strong>{signal.position_size.lots} Lots ({signal.position_size.quantity} qty)</strong>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(16,185,129,0.8)', marginTop: 2 }}>
                ✓ Max capital risk strictly capped to {signal.position_size.risk_pct}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Open Interest Support & Resistance Walls Heatmap */}
      <div className="grid-2" style={{ gap: 20, marginBottom: 24 }}>
        {/* Put Walls (Support Floors) */}
        <div className="card">
          <h3 style={{ margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green)' }}>
            <span>🟢</span> Institutional Put Walls (Support Floors)
          </h3>
          <table style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                <th>Rank</th>
                <th>Strike</th>
                <th>Open Interest (PE)</th>
                <th>Shift Trend</th>
              </tr>
            </thead>
            <tbody>
              {oiWalls.pe_walls?.map((w: any) => (
                <tr key={w.strike}>
                  <td><span className="badge" style={{ padding: '2px 8px' }}>#{w.wall_rank}</span></td>
                  <td style={{ fontWeight: 700 }}>₹{w.strike?.toLocaleString()}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          height: 6,
                          width: `${Math.min(100, (w.oi / 180000) * 100)}%`,
                          background: 'var(--green)',
                          borderRadius: 3
                        }}
                      />
                      <span>{w.oi?.toLocaleString()}</span>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, color: w.wall_shift_direction === 'up' ? 'var(--green)' : 'var(--muted)' }}>
                      {w.wall_shift_direction === 'up' ? '▲ Higher' : w.wall_shift_direction === 'down' ? '▼ Lower' : '● Solid'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Call Walls (Resistance Ceilings) */}
        <div className="card">
          <h3 style={{ margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)' }}>
            <span>🔴</span> Institutional Call Walls (Resistance Ceilings)
          </h3>
          <table style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                <th>Rank</th>
                <th>Strike</th>
                <th>Open Interest (CE)</th>
                <th>Shift Trend</th>
              </tr>
            </thead>
            <tbody>
              {oiWalls.ce_walls?.map((w: any) => (
                <tr key={w.strike}>
                  <td><span className="badge" style={{ padding: '2px 8px' }}>#{w.wall_rank}</span></td>
                  <td style={{ fontWeight: 700 }}>₹{w.strike?.toLocaleString()}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          height: 6,
                          width: `${Math.min(100, (w.oi / 180000) * 100)}%`,
                          background: 'var(--red)',
                          borderRadius: 3
                        }}
                      />
                      <span>{w.oi?.toLocaleString()}</span>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, color: w.wall_shift_direction === 'down' ? 'var(--red)' : 'var(--muted)' }}>
                      {w.wall_shift_direction === 'up' ? '▲ Rising' : w.wall_shift_direction === 'down' ? '▼ Lowering' : '● Solid'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Market News & Sentiment (TinyFish AI) */}
      <div className="card">
        <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🐟</span> Live Market Intelligence & Macro Sentiment (TinyFish AI)
        </h3>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>
          Autonomous web agent news grounding: Scanning live disclosures, institutional flows, and derivatives commentary.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {news.map((item: any, idx: number) => (
            <div
              key={idx}
              style={{
                padding: '12px 16px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.05)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontWeight: 600, color: '#38bdf8', textDecoration: 'none' }}
                >
                  {item.title}
                </a>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.source}</span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                {item.snippet}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

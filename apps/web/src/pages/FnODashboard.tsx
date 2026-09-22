import { useState, useEffect, useCallback } from 'react';
import {
  getFoOiWalls,
  getFoPcr,
  getFoFuturesBuildup,
  getFoIv,
  getFoMaxPain,
  getFoSignals,
  getFoTradePanel,
  getFoNews
} from '../services/api';
import { IconClock, IconPause, IconNews } from '../components/Icons';


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
  const [tradePanel, setTradePanel] = useState<any>(null);
  const [news, setNews] = useState<any[]>([]);

  const fetchAllData = useCallback(async (sym: 'NIFTY' | 'BANKNIFTY') => {
    setLoading(true);
    try {
      const [wRes, pRes, bRes, ivRes, mpRes, sRes, tpRes, nRes] = await Promise.all([
        getFoOiWalls(sym),
        getFoPcr(sym),
        getFoFuturesBuildup(sym),
        getFoIv(sym),
        getFoMaxPain(sym),
        getFoSignals(sym),
        getFoTradePanel(sym),
        getFoNews(`${sym} derivatives market news`)
      ]);

      setOiWalls(wRes || { ce_walls: [], pe_walls: [] });
      setPcr(pRes || {});
      setBuildup(bRes || {});
      setIv(ivRes || {});
      setMaxPain(mpRes || {});
      setSignal(sRes?.signal || null);
      setTradePanel(tpRes || null);
      setNews(nRes?.results || []);
    } catch (e) {
      console.error('Error loading F&O data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData(symbol);
    // Auto-refresh every 60s during market hours
    const interval = setInterval(() => fetchAllData(symbol), 60000);
    return () => clearInterval(interval);
  }, [symbol, fetchAllData]);

  const pcrColor =
    pcr.overall_pcr >= 1.2 ? 'var(--green)'
    : pcr.overall_pcr <= 0.8 ? 'var(--red)'
    : '#f59e0b';

  const ms = tradePanel?.market_status;
  const ts = tradePanel?.trade_setup;
  const posAction = tradePanel?.position_action;

  const statusBg = ms?.status_color === 'green' ? 'rgba(16,185,129,0.12)' :
    ms?.status_color === 'orange' ? 'rgba(251,146,60,0.12)' : 'rgba(100,116,139,0.12)';
  const statusBorder = ms?.status_color === 'green' ? '#10b981' :
    ms?.status_color === 'orange' ? '#fb923c' : '#64748b';

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

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TRADE EXECUTION PANEL — The main IN/OUT position panel              */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {tradePanel && (
        <div style={{
          marginBottom: 28,
          border: `2px solid ${statusBorder}`,
          borderRadius: 12,
          overflow: 'hidden'
        }}>
          {/* Market Status Bar */}
          <div style={{
            background: statusBg,
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: `1px solid ${statusBorder}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 14, height: 14, borderRadius: '50%',
                background: statusBorder,
                boxShadow: ms?.is_open ? `0 0 8px ${statusBorder}` : 'none',
                animation: ms?.is_open ? 'pulse 2s infinite' : 'none'
              }} />
              <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.5 }}>
                {ms?.status_label}
              </span>
            </div>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {ms?.current_time_ist} • Auto-refreshes every 60s
            </span>
          </div>

          {/* ── POSITION ACTION: ENTER ── */}
          {posAction === 'ENTER' && ts && (
            <div style={{ padding: 20 }}>
              {/* Direction + Strategy Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    fontSize: 28, fontWeight: 900,
                    color: ts.direction === 'BULLISH' ? '#10b981' : '#ef4444'
                  }}>
                    {ts.direction === 'BULLISH' ? '▲' : '▼'} {ts.direction}
                  </span>
                  <span className="badge" style={{
                    background: ts.direction === 'BULLISH' ? '#10b981' : '#ef4444',
                    color: '#000', fontWeight: 700, fontSize: 13, padding: '4px 12px'
                  }}>
                    {ts.strategy_name}
                  </span>
                  <span style={{ fontSize: 14, color: 'var(--muted)' }}>
                    Confluence: {ts.confluence_score} • Spot: ₹{ts.spot_price?.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Two Column: ENTRY (Left) + EXIT (Right) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* ── LEFT: ENTRY POSITION ── */}
                <div style={{
                  background: 'rgba(16,185,129,0.06)',
                  border: '1px solid rgba(16,185,129,0.25)',
                  borderRadius: 10,
                  padding: 18
                }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#10b981', marginBottom: 14 }}>
                    {ts.entry?.heading}
                  </div>

                  {ts.entry?.legs?.map((leg: any) => (
                    <div key={leg.leg} style={{
                      background: leg.action === 'BUY' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      border: `1px solid ${leg.action === 'BUY' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      borderRadius: 8,
                      padding: '12px 16px',
                      marginBottom: 10
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 10px',
                            borderRadius: 4,
                            fontWeight: 800,
                            fontSize: 13,
                            background: leg.action === 'BUY' ? '#10b981' : '#ef4444',
                            color: '#000',
                            marginRight: 10
                          }}>
                            LEG {leg.leg}: {leg.action}
                          </span>
                          <span style={{ fontSize: 18, fontWeight: 700 }}>
                            {leg.instrument}
                          </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 20, fontWeight: 800 }}>₹{leg.estimated_premium}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{leg.quantity} qty ({leg.lots} lots)</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, fontStyle: 'italic' }}>
                        {leg.instruction}
                      </div>
                    </div>
                  ))}

                  <div style={{
                    background: 'rgba(56,189,248,0.08)',
                    borderRadius: 6,
                    padding: '10px 14px',
                    fontSize: 12,
                    marginTop: 6,
                    color: '#38bdf8'
                  }}>
                    <strong>Execution Order:</strong> {ts.entry?.execute_as}
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 8,
                    marginTop: 12,
                    fontSize: 13
                  }}>
                    <div>Net Debit / Lot: <strong>₹{ts.entry?.net_debit_per_lot}</strong></div>
                    <div>Total Debit: <strong>₹{ts.entry?.total_debit?.toLocaleString()}</strong></div>
                  </div>
                </div>

                {/* ── RIGHT: EXIT RULES ── */}
                <div style={{
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 10,
                  padding: 18
                }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#ef4444', marginBottom: 14 }}>
                    {ts.exit?.heading}
                  </div>

                  {ts.exit?.rules?.map((rule: any) => (
                    <div key={rule.rule} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      marginBottom: 12,
                      padding: '10px 14px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.06)'
                    }}>
                      <span style={{ fontSize: 22 }}>{rule.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{rule.rule}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                          <strong>When:</strong> {rule.condition}
                        </div>
                        <div style={{ fontSize: 12, color: '#fb923c', marginTop: 2 }}>
                          <strong>Action:</strong> {rule.action}
                        </div>
                      </div>
                    </div>
                  ))}

                  <div style={{
                    background: 'rgba(251,146,60,0.1)',
                    borderRadius: 6,
                    padding: '10px 14px',
                    fontSize: 12,
                    color: '#fb923c',
                    marginTop: 4
                  }}>
                    <strong>How to Exit:</strong> {ts.exit?.exit_instruction}
                  </div>
                </div>
              </div>

              {/* Risk Profile Summary Bar */}
              {ts.risk_profile && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: 12,
                  marginTop: 16,
                  padding: '14px 18px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.06)'
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Max Loss</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444' }}>
                      ₹{ts.risk_profile.max_loss_rupees?.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Max Profit</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>
                      ₹{ts.risk_profile.max_profit_rupees?.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Risk:Reward</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#38bdf8' }}>
                      {ts.risk_profile.risk_reward_ratio}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Capital at Risk</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b' }}>
                      {ts.risk_profile.risk_as_pct_of_capital}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Breakeven</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#e2e8f0' }}>
                      ₹{ts.risk_profile.breakeven?.toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── POSITION ACTION: EXIT ── */}
          {posAction === 'EXIT' && (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <IconClock size={36} color="#fb923c" />
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fb923c', marginTop: 8, letterSpacing: '0.4px' }}>
                SQUARE-OFF WINDOW — EXIT ALL OPEN POSITIONS
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
                Market closes at 15:30 IST. Close all spread legs immediately to avoid overnight risk.
              </div>
            </div>
          )}

          {/* ── POSITION ACTION: NO TRADE ── */}
          {posAction === 'NO_TRADE' && (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <IconPause size={36} color="#64748b" />
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#94a3b8', marginTop: 8, letterSpacing: '0.4px' }}>
                NO ACTIVE SETUP — STANDBY IN CASH
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
                {ms?.is_weekend
                  ? 'Market is closed for the weekend. Signals will resume on Monday 9:15 AM IST.'
                  : !ms?.is_open
                    ? 'Market is closed. Signals generate during trading hours (9:15 AM – 3:30 PM IST).'
                    : 'Confluence score is below threshold. Wait for ≥3/5 confirmations before entering.'}
              </div>
            </div>
          )}
        </div>
      )}

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
            <span className="status-dot-pulse" style={{ width: 8, height: 8, background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
            Institutional Put Walls (Support Floors)
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
                      {w.wall_shift_direction === 'up' ? '+ Higher' : w.wall_shift_direction === 'down' ? '- Lower' : 'Solid'}
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
            <span className="status-dot-pulse" style={{ width: 8, height: 8, background: 'var(--red)', boxShadow: '0 0 8px var(--red)' }} />
            Institutional Call Walls (Resistance Ceilings)
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
                      {w.wall_shift_direction === 'up' ? '+ Rising' : w.wall_shift_direction === 'down' ? '- Lowering' : 'Solid'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Market News & Sentiment */}
      <div className="card">
        <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8, color: '#ffffff' }}>
          <IconNews size={16} color="#06b6d4" />
          Live Market Intelligence & Macro Sentiment
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

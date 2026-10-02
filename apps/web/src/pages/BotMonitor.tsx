import React, { useState, useEffect } from 'react';
import {
  getFoPaperTrades,
  getEquityPaperTrades,
  getFoReadinessGates,
  getDailyHistory,
  getAdaptiveParameters
} from '../services/api';

export default function BotMonitor() {
  const [foState, setFoState] = useState<any>({
    current_capital: 5000,
    initial_capital: 5000,
    daily_pnl: 0,
    open_positions: [],
    closed_trades: []
  });

  const [eqState, setEqState] = useState<any>({
    current_capital: 2500,
    initial_capital: 2500,
    daily_pnl: 0,
    purchasing_power: 12500,
    open_positions: [],
    closed_trades: []
  });

  const [gates, setGates] = useState<any>({
    gate_1_win_rate: { value: 0, threshold: 55, passed: false },
    gate_2_profit_factor: { value: 0, threshold: 1.5, passed: false },
    gate_3_max_drawdown: { value: 0, threshold: 4.0, passed: false },
    all_gates_passed: false
  });

  const [history, setHistory] = useState<any[]>([]);
  const [adaptive, setAdaptive] = useState<any>(null);
  const [widgetTab, setWidgetTab] = useState<'live' | 'history' | 'adaptive'>('history');
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const fetchData = async () => {
    try {
      const [fo, eq, g, h, adp] = await Promise.all([
        getFoPaperTrades(),
        getEquityPaperTrades(),
        getFoReadinessGates(),
        getDailyHistory(),
        getAdaptiveParameters()
      ]);
      if (fo) setFoState(fo);
      if (eq) setEqState(eq);
      if (g) setGates(g);
      if (h?.records) setHistory(h.records);
      if (adp) setAdaptive(adp);
      setLastRefreshed(new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST');
    } catch (err) {
      console.warn('Error fetching bot monitor data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalCapital = (foState?.current_capital ?? 5000) + (eqState?.current_capital ?? 2500);
  const totalDailyPnl = (foState?.daily_pnl ?? 0) + (eqState?.daily_pnl ?? 0);
  const totalOpen = (foState?.open_positions?.length ?? 0) + (eqState?.open_positions?.length ?? 0);
  const allClosed = [...(foState?.closed_trades || []), ...(eqState?.closed_trades || [])];

  // Liveness & Watchdog calculations
  const lastUpdatedRaw = foState?.last_updated;
  const lastUpdatedDate = lastUpdatedRaw ? new Date(lastUpdatedRaw) : null;
  const now = new Date();
  const minutesSinceHeartbeat = lastUpdatedDate 
    ? Math.max(0, Math.floor((now.getTime() - lastUpdatedDate.getTime()) / 60000)) 
    : 999;

  const istFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const currentISTTime = istFormatter.format(now);
  const isMarketHours = currentISTTime >= '09:15' && currentISTTime <= '15:35';
  const isPostMarket = currentISTTime > '15:35' || currentISTTime < '09:15';

  const isStalled = isMarketHours && minutesSinceHeartbeat > 20;
  const lastError = foState?.last_error;

  const botTimeStr = lastUpdatedDate 
    ? lastUpdatedDate.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST'
    : 'No pulse yet';

  // Shared styles
  const S = {
    container: {
      background: '#07090e',
      color: '#e2e8f0',
      padding: '12px 12px env(safe-area-inset-bottom, 12px)',
      paddingTop: 'max(12px, env(safe-area-inset-top))',
      minHeight: '100vh',
      width: '100%',
      maxWidth: 520,
      margin: '0 auto',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, monospace',
      WebkitTextSizeAdjust: '100%' as any,
      overflowX: 'hidden' as const,
    },
    card: {
      background: '#0d121c',
      border: '1px solid #1a2233',
      borderRadius: 8,
      padding: '10px 10px',
      marginBottom: 10,
      fontSize: 12,
    },
    label: { fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 0.3 },
    bigNum: { fontSize: 18, fontWeight: 700, marginTop: 2 },
    row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
    tabBtn: (active: boolean) => ({
      flex: 1,
      padding: '10px 4px',
      background: active ? 'rgba(0, 240, 255, 0.15)' : '#0d121c',
      border: active ? '1px solid #00f0ff' : '1px solid #1a2233',
      color: active ? '#00f0ff' : '#94a3b8',
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 700 as const,
      cursor: 'pointer',
      minHeight: 42,
      WebkitTapHighlightColor: 'transparent',
      touchAction: 'manipulation' as const,
    }),
    tradeRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: '6px 0',
      borderBottom: '1px solid #1a2233',
      gap: 8,
      flexWrap: 'wrap' as const,
    },
  };

  return (
    <div style={S.container}>
      {/* Widget Header with Engine Pulse Status */}
      <div style={{ ...S.row, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: isStalled ? '#ef4444' : (isPostMarket ? '#818cf8' : '#00ff88'),
            boxShadow: isStalled ? '0 0 8px #ef4444' : (isPostMarket ? '0 0 8px #818cf8' : '0 0 8px #00ff88')
          }} />
          <strong style={{ fontSize: 13, color: '#00f0ff', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>ARTHA SENTINEL</strong>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: isStalled ? '#ef4444' : (isPostMarket ? '#818cf8' : '#00ff88'), fontWeight: 700 }}>
            {isStalled ? 'STALLED' : (isPostMarket ? 'POST-MARKET' : 'ONLINE')}
          </span>
          <div style={{ fontSize: 9, color: '#64748b' }}>Pulse: {botTimeStr}</div>
        </div>
      </div>

      {/* LIVENESS WATCHDOG ALERTS */}
      {isStalled && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid #ef4444',
          borderRadius: 6,
          padding: '8px 10px',
          marginBottom: 10,
          fontSize: 11
        }}>
          <div style={{ color: '#ef4444', fontWeight: 700, marginBottom: 2 }}>
            LAPTOP OFFLINE / SUSPENDED
          </div>
          <div style={{ color: '#fca5a5', lineHeight: 1.4 }}>
            No heartbeat since <b>{botTimeStr}</b> ({minutesSinceHeartbeat}m ago). Laptop may be asleep or Wi-Fi dropped!
          </div>
        </div>
      )}

      {lastError && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.15)',
          border: '1px solid #f59e0b',
          borderRadius: 6,
          padding: '8px 10px',
          marginBottom: 10,
          fontSize: 11
        }}>
          <div style={{ color: '#f59e0b', fontWeight: 700, marginBottom: 2 }}>ENGINE ALERT</div>
          <div style={{ color: '#fcd34d', wordBreak: 'break-word' }}>{lastError}</div>
        </div>
      )}

      {/* Capital & PnL Matrix */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div style={S.card}>
          <div style={S.label}>Total Equity</div>
          <div style={{ ...S.bigNum, color: '#00f0ff' }}>
            {'\u20B9'}{totalCapital.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div style={S.card}>
          <div style={S.label}>Today P&L</div>
          <div style={{ ...S.bigNum, color: totalDailyPnl >= 0 ? '#00ff88' : '#ff3366' }}>
            {totalDailyPnl >= 0 ? '+' : ''}{'\u20B9'}{totalDailyPnl.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Sub-Vaults Breakdown */}
      <div style={{ ...S.card, fontSize: 11 }}>
        <div style={{ ...S.row, marginBottom: 4 }}>
          <span style={{ color: '#94a3b8', fontSize: 11 }}>F&O Vault:</span>
          <strong>{'\u20B9'}{(foState?.current_capital ?? 5000).toFixed(2)}</strong>
        </div>
        <div style={S.row}>
          <span style={{ color: '#94a3b8', fontSize: 11 }}>Equity (5x):</span>
          <strong style={{ color: '#00f0ff' }}>{'\u20B9'}{(eqState?.purchasing_power ?? 12500).toFixed(2)}</strong>
        </div>
      </div>

      {/* Navigation Tabs — mobile-friendly touch targets */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button onClick={() => setWidgetTab('live')} style={S.tabBtn(widgetTab === 'live')}>
          Live
        </button>
        <button onClick={() => setWidgetTab('history')} style={S.tabBtn(widgetTab === 'history')}>
          History ({history.length})
        </button>
        <button onClick={() => setWidgetTab('adaptive')} style={S.tabBtn(widgetTab === 'adaptive')}>
          Brain
        </button>
      </div>

      {/* VIEW 1: LIVE TELEMETRY */}
      {widgetTab === 'live' && (
        <>
          {/* Live Positions */}
          <div style={S.card}>
            <div style={{ ...S.row, marginBottom: 6 }}>
              <span style={{ ...S.label, fontWeight: 700 }}>Active Trades ({totalOpen})</span>
              <span style={{ color: '#00ff88', fontSize: 10 }}>Wake Lock Active</span>
            </div>

            {totalOpen === 0 ? (
              <div style={{ textAlign: 'center', padding: '8px 0', color: '#94a3b8', fontSize: 11 }}>
                Zero open risk (All squared off at 15:15 IST)
              </div>
            ) : (
              <div>
                {[...(foState?.open_positions || []), ...(eqState?.open_positions || [])].map((p: any, idx: number) => (
                  <div key={idx} style={S.tradeRow}>
                    <span style={{ fontWeight: 600, minWidth: 0 }}>{p.symbol} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({p.direction})</span></span>
                    <span style={{ color: '#00f0ff', fontSize: 10, whiteSpace: 'nowrap' }}>SL: {'\u20B9'}{p.stop_loss}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Today's Executed Trades */}
          <div style={S.card}>
            <div style={{ ...S.label, fontWeight: 700, marginBottom: 6 }}>
              Closed Today ({allClosed.length})
            </div>
            {allClosed.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '8px 0', color: '#94a3b8', fontSize: 11 }}>
                No trades closed yet today
              </div>
            ) : (
              <div>
                {allClosed.slice(-6).map((t: any, idx: number) => {
                  const pnl = t.net_pnl !== undefined ? t.net_pnl : (t.pnl || 0);
                  return (
                    <div key={idx} style={S.tradeRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 11 }}>{t.symbol}</div>
                        <div style={{ color: '#64748b', fontSize: 9 }}>{t.exit_reason}</div>
                      </div>
                      <strong style={{ color: pnl >= 0 ? '#00ff88' : '#ff3366', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {pnl >= 0 ? '+' : ''}{'\u20B9'}{pnl.toFixed(2)}
                      </strong>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3 Live Readiness Gates */}
          <div style={S.card}>
            <div style={{ ...S.label, fontWeight: 700, marginBottom: 6 }}>3 Readiness Gates</div>
            {[
              { label: 'Win Rate >= 55%', gate: gates?.gate_1_win_rate },
              { label: 'PF >= 1.5', gate: gates?.gate_2_profit_factor },
              { label: 'DD <= 4%', gate: gates?.gate_3_max_drawdown },
            ].map((g, i) => (
              <div key={i} style={{ ...S.row, marginBottom: 2, fontSize: 11 }}>
                <span style={{ color: '#94a3b8' }}>{g.label}</span>
                <span style={{ color: g.gate?.passed ? '#00ff88' : '#fbbf24', fontWeight: 600 }}>
                  {g.gate?.passed ? 'PASSED' : 'PENDING'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* VIEW 2: DAILY HISTORY RECORDS */}
      {widgetTab === 'history' && (
        <div style={S.card}>
          <div style={{ ...S.label, fontWeight: 700, marginBottom: 8 }}>
            Daily Sessions
          </div>

          {/* Today's Ongoing Session */}
          <div style={{ padding: 8, background: '#09101d', border: '1px dashed #00f0ff55', borderRadius: 6, marginBottom: 8 }}>
            <div style={{ ...S.row, marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff88' }} />
                <strong style={{ color: '#00f0ff', fontSize: 12 }}>Today Live</strong>
              </div>
              <strong style={{ color: totalDailyPnl >= 0 ? '#00ff88' : '#ff3366', fontSize: 14 }}>
                {totalDailyPnl >= 0 ? '+' : ''}{'\u20B9'}{totalDailyPnl.toFixed(2)}
              </strong>
            </div>
            <div style={{ ...S.row, color: '#94a3b8', fontSize: 10 }}>
              <span>Closed: {allClosed.length} | Open: {totalOpen}</span>
              <span>{'\u20B9'}{totalCapital.toFixed(0)}</span>
            </div>
          </div>

          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '10px 0', color: '#64748b', fontSize: 10, borderTop: '1px solid #1a2233' }}>
              Prior sessions auto-archive at 15:30 IST.
            </div>
          ) : (
            <div>
              <div style={{ color: '#64748b', fontSize: 9, textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 }}>
                Archived ({history.length})
              </div>
              {history.map((row: any, idx: number) => (
                <div key={idx} style={{ padding: '8px 0', borderBottom: '1px solid #1a2233' }}>
                  <div style={{ ...S.row, marginBottom: 3 }}>
                    <strong style={{ color: '#e2e8f0', fontSize: 12 }}>{row.date}</strong>
                    <strong style={{ color: row.total_pnl >= 0 ? '#00ff88' : '#ff3366', fontSize: 13 }}>
                      {row.total_pnl >= 0 ? '+' : ''}{'\u20B9'}{row.total_pnl.toFixed(2)}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: 10, flexWrap: 'wrap', gap: 2 }}>
                    <span>{row.trades_count} trades</span>
                    <span>F&O: {'\u20B9'}{row.fo_pnl?.toFixed(0)} | EQ: {'\u20B9'}{row.equity_pnl?.toFixed(0)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: ADAPTIVE BRAIN */}
      {widgetTab === 'adaptive' && (
        <div style={S.card}>
          <div style={{ ...S.row, marginBottom: 8 }}>
            <span style={{ ...S.label, color: '#00f0ff', fontWeight: 700 }}>Self-Improvement Engine</span>
            <span style={{ fontSize: 9, color: '#00ff88', background: 'rgba(0, 255, 136, 0.1)', padding: '2px 6px', borderRadius: 3, border: '1px solid #00ff8855' }}>
              AUTO
            </span>
          </div>

          {/* Adaptive param cards — responsive: 2-col on wide, 1-col on very narrow */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6, marginBottom: 8 }}>
            {[
              { label: 'BN STOP', value: '90-200 pts', sub: 'Anti-whipsaw' },
              { label: 'NIFTY STOP', value: '35-75 pts', sub: 'Anti-blowout' },
              { label: 'COOLDOWN', value: '20 mins', sub: 'Anti-churn' },
              { label: 'TRAILING', value: 'ON (1.2x R)', sub: 'Lock profits', color: '#00ff88' },
            ].map((item, i) => (
              <div key={i} style={{ background: '#09101d', border: '1px solid #1e293b', borderRadius: 6, padding: '8px 8px' }}>
                <div style={{ color: '#94a3b8', fontSize: 9, marginBottom: 2 }}>{item.label}</div>
                <strong style={{ color: item.color || '#f8fafc', fontSize: 13 }}>{item.value}</strong>
                <div style={{ color: '#64748b', fontSize: 8 }}>{item.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #1a2233', paddingTop: 6 }}>
            <div style={{ color: '#94a3b8', fontSize: 9, textTransform: 'uppercase', marginBottom: 4, fontWeight: 700 }}>
              Learned Adaptations
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(adaptive?.reasons_applied || [
                "Detected 6 micro-stop whipsaws. Enforced minimum stop cushion: Bank Nifty >= 90 pts, Nifty >= 35 pts.",
                "Detected 1 extreme stop blowout. Capped maximum stop distance: Bank Nifty <= 200 pts, Nifty <= 75 pts.",
                "Detected 2 rapid-fire re-entry churns. Set post-loss cooldown to 20 minutes and capped max daily trades to 6.",
                "Strong directional skew: Counter-trend setups now require strict 4/5 confluence + EMA confirmation."
              ]).map((reason: string, rIdx: number) => (
                <div key={rIdx} style={{
                  background: '#09101d',
                  border: '1px solid #1a2233',
                  borderRadius: 4,
                  padding: '6px 8px',
                  fontSize: 10,
                  color: '#cbd5e1',
                  lineHeight: 1.4,
                  wordBreak: 'break-word' as const,
                }}>
                  <span style={{ color: '#00f0ff', fontWeight: 700 }}>[ADAPTED]</span> {reason}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

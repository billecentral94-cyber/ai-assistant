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

  return (
    <div style={{
      background: '#07090e',
      color: '#e2e8f0',
      padding: '12px',
      minHeight: '100vh',
      maxWidth: 480,
      margin: '0 auto',
      fontFamily: 'monospace, -apple-system, sans-serif'
    }}>
      {/* Widget Header with Engine Pulse Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isStalled ? '#ef4444' : (isPostMarket ? '#818cf8' : '#00ff88'),
            boxShadow: isStalled ? '0 0 8px #ef4444' : (isPostMarket ? '0 0 8px #818cf8' : '0 0 8px #00ff88')
          }} />
          <strong style={{ fontSize: 13, color: '#00f0ff', letterSpacing: 0.5 }}>ARTHA SENTINEL</strong>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 10, color: isStalled ? '#ef4444' : (isPostMarket ? '#818cf8' : '#00ff88'), fontWeight: 700 }}>
            {isStalled ? '🔴 STALLED' : (isPostMarket ? 'POST-MARKET' : 'ONLINE')}
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
            ⚠️ LAPTOP OFFLINE / SUSPENDED
          </div>
          <div style={{ color: '#fca5a5' }}>
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
          <div style={{ color: '#f59e0b', fontWeight: 700, marginBottom: 2 }}>
            ⚠️ ENGINE ALERT
          </div>
          <div style={{ color: '#fcd34d' }}>{lastError}</div>
        </div>
      )}

      {/* Capital & PnL Matrix */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div style={{ background: '#0d121c', border: '1px solid #1a2233', borderRadius: 6, padding: 8 }}>
          <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Total Equity</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#00f0ff', marginTop: 2 }}>
            ₹{totalCapital.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ background: '#0d121c', border: '1px solid #1a2233', borderRadius: 6, padding: 8 }}>
          <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Today P&L</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: totalDailyPnl >= 0 ? '#00ff88' : '#ff3366', marginTop: 2 }}>
            {totalDailyPnl >= 0 ? '+' : ''}₹{totalDailyPnl.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Sub-Vaults Breakdown */}
      <div style={{ background: '#0d121c', border: '1px solid #1a2233', borderRadius: 6, padding: 8, marginBottom: 10, fontSize: 11 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: '#94a3b8' }}>F&O Micro-Vault (1 Lot):</span>
          <strong>₹{(foState?.current_capital ?? 5000).toFixed(2)}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#94a3b8' }}>Equity Intraday (5x Power):</span>
          <strong style={{ color: '#00f0ff' }}>₹{(eqState?.purchasing_power ?? 12500).toFixed(2)}</strong>
        </div>
      </div>

      {/* Navigation Pills (Inside Widget Card) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button
          onClick={() => setWidgetTab('live')}
          style={{
            flex: 1,
            padding: '6px 0',
            background: widgetTab === 'live' ? 'rgba(0, 240, 255, 0.15)' : '#0d121c',
            border: widgetTab === 'live' ? '1px solid #00f0ff' : '1px solid #1a2233',
            color: widgetTab === 'live' ? '#00f0ff' : '#94a3b8',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Live Telemetry
        </button>
        <button
          onClick={() => setWidgetTab('history')}
          style={{
            flex: 1,
            padding: '6px 0',
            background: widgetTab === 'history' ? 'rgba(0, 240, 255, 0.15)' : '#0d121c',
            border: widgetTab === 'history' ? '1px solid #00f0ff' : '1px solid #1a2233',
            color: widgetTab === 'history' ? '#00f0ff' : '#94a3b8',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          History ({history.length})
        </button>
        <button
          onClick={() => setWidgetTab('adaptive')}
          style={{
            flex: 1,
            padding: '6px 0',
            background: widgetTab === 'adaptive' ? 'rgba(0, 240, 255, 0.15)' : '#0d121c',
            border: widgetTab === 'adaptive' ? '1px solid #00f0ff' : '1px solid #1a2233',
            color: widgetTab === 'adaptive' ? '#00f0ff' : '#94a3b8',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Adaptive Brain
        </button>
      </div>

      {/* VIEW 1: LIVE TELEMETRY */}
      {widgetTab === 'live' && (
        <>
          {/* Live Positions */}
          <div style={{ background: '#0d121c', border: '1px solid #1a2233', borderRadius: 6, padding: 8, marginBottom: 10, fontSize: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', fontSize: 10 }}>Active Trades ({totalOpen})</span>
              <span style={{ color: '#00ff88', fontSize: 10 }}>Wake Lock Active</span>
            </div>

            {totalOpen === 0 ? (
              <div style={{ textAlign: 'center', padding: '6px 0', color: '#94a3b8', fontSize: 11 }}>
                Zero open risk (All squared off at 15:15 IST)
              </div>
            ) : (
              <div>
                {[...(foState?.open_positions || []), ...(eqState?.open_positions || [])].map((p: any, idx: number) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #1a2233' }}>
                    <span><b>{p.symbol}</b> ({p.direction})</span>
                    <span style={{ color: '#00f0ff' }}>SL: ₹{p.stop_loss} | TP: ₹{p.target || p.target_1}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Today's Executed Trades */}
          <div style={{ background: '#0d121c', border: '1px solid #1a2233', borderRadius: 6, padding: 8, marginBottom: 10, fontSize: 11 }}>
            <div style={{ fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', fontSize: 10, marginBottom: 6 }}>
              Today's Closed Trades ({allClosed.length})
            </div>
            {allClosed.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '6px 0', color: '#94a3b8', fontSize: 11 }}>
                No trades closed yet today
              </div>
            ) : (
              <div>
                {allClosed.slice(-4).map((t: any, idx: number) => {
                  const pnl = t.net_pnl !== undefined ? t.net_pnl : (t.pnl || 0);
                  return (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #1a2233' }}>
                      <span><b>{t.symbol}</b> ({t.exit_reason})</span>
                      <strong style={{ color: pnl >= 0 ? '#00ff88' : '#ff3366' }}>
                        {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)}
                      </strong>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3 Live Readiness Gates */}
          <div style={{ background: '#0d121c', border: '1px solid #1a2233', borderRadius: 6, padding: 8, fontSize: 11 }}>
            <div style={{ fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', fontSize: 10, marginBottom: 6 }}>
              3 Live Readiness Gates
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: '#94a3b8' }}>Gate 1 (Win Rate &gt;= 55%):</span>
              <span style={{ color: gates?.gate_1_win_rate?.passed ? '#00ff88' : '#fbbf24' }}>
                {gates?.gate_1_win_rate?.passed ? 'PASSED' : 'PENDING'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: '#94a3b8' }}>Gate 2 (PF &gt;= 1.5):</span>
              <span style={{ color: gates?.gate_2_profit_factor?.passed ? '#00ff88' : '#fbbf24' }}>
                {gates?.gate_2_profit_factor?.passed ? 'PASSED' : 'PENDING'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8' }}>Gate 3 (DD &lt;= 4%):</span>
              <span style={{ color: gates?.gate_3_max_drawdown?.passed ? '#00ff88' : '#fbbf24' }}>
                {gates?.gate_3_max_drawdown?.passed ? 'PASSED' : 'PENDING'}
              </span>
            </div>
          </div>
        </>
      )}

      {/* VIEW 2: DAILY HISTORY RECORDS */}
      {widgetTab === 'history' && (
        <div style={{ background: '#0d121c', border: '1px solid #1a2233', borderRadius: 6, padding: 8, fontSize: 11 }}>
          <div style={{ fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', fontSize: 10, marginBottom: 8 }}>
            Daily Sessions Performance
          </div>

          {/* Today's Ongoing Session */}
          <div style={{ padding: '8px', background: '#09101d', border: '1px dashed #00f0ff55', borderRadius: 5, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff88' }} />
                <strong style={{ color: '#00f0ff' }}>Today's Live Session</strong>
              </div>
              <strong style={{ color: totalDailyPnl >= 0 ? '#00ff88' : '#ff3366', fontSize: 13 }}>
                {totalDailyPnl >= 0 ? '+' : ''}₹{totalDailyPnl.toFixed(2)}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: 10 }}>
              <span>Closed: {allClosed.length} | Active: {totalOpen}</span>
              <span>Vault: ₹{totalCapital.toFixed(2)}</span>
            </div>
          </div>

          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '10px 0', color: '#64748b', fontSize: 10, borderTop: '1px solid #1a2233' }}>
              Prior sessions auto-archive to permanent record at 15:30 IST.
            </div>
          ) : (
            <div>
              <div style={{ color: '#64748b', fontSize: 9, textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 }}>
                Archived Prior Days ({history.length})
              </div>
              {history.map((row: any, idx: number) => (
                <div key={idx} style={{ padding: '6px 0', borderBottom: '1px solid #1a2233' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <strong style={{ color: '#e2e8f0' }}>{row.date}</strong>
                    <strong style={{ color: row.total_pnl >= 0 ? '#00ff88' : '#ff3366' }}>
                      {row.total_pnl >= 0 ? '+' : ''}₹{row.total_pnl.toFixed(2)}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: 10 }}>
                    <span>Trades: {row.trades_count}</span>
                    <span>F&O: ₹{row.fo_pnl.toFixed(2)} | EQ: ₹{row.equity_pnl.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: ADAPTIVE BRAIN (SELF-IMPROVEMENT GUARDRAILS) */}
      {widgetTab === 'adaptive' && (
        <div style={{ background: '#0d121c', border: '1px solid #1a2233', borderRadius: 6, padding: 8, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, textTransform: 'uppercase', color: '#00f0ff', fontSize: 10, letterSpacing: 0.5 }}>
              Self-Improvement Engine
            </span>
            <span style={{ fontSize: 9, color: '#00ff88', background: 'rgba(0, 255, 136, 0.1)', padding: '2px 6px', borderRadius: 3, border: '1px solid #00ff8855' }}>
              AUTO-OPTIMIZED
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
            <div style={{ background: '#09101d', border: '1px solid #1e293b', borderRadius: 4, padding: 6 }}>
              <div style={{ color: '#94a3b8', fontSize: 9 }}>BANK NIFTY STOP</div>
              <strong style={{ color: '#f8fafc', fontSize: 12 }}>90 – 200 pts</strong>
              <div style={{ color: '#64748b', fontSize: 8 }}>Anti-whipsaw cushion</div>
            </div>
            <div style={{ background: '#09101d', border: '1px solid #1e293b', borderRadius: 4, padding: 6 }}>
              <div style={{ color: '#94a3b8', fontSize: 9 }}>NIFTY STOP</div>
              <strong style={{ color: '#f8fafc', fontSize: 12 }}>35 – 75 pts</strong>
              <div style={{ color: '#64748b', fontSize: 8 }}>Anti-blowout cap</div>
            </div>
            <div style={{ background: '#09101d', border: '1px solid #1e293b', borderRadius: 4, padding: 6 }}>
              <div style={{ color: '#94a3b8', fontSize: 9 }}>POST-LOSS COOLDOWN</div>
              <strong style={{ color: '#f8fafc', fontSize: 12 }}>20 mins</strong>
              <div style={{ color: '#64748b', fontSize: 8 }}>Anti-churn lockout</div>
            </div>
            <div style={{ background: '#09101d', border: '1px solid #1e293b', borderRadius: 4, padding: 6 }}>
              <div style={{ color: '#94a3b8', fontSize: 9 }}>TRAILING PROFIT</div>
              <strong style={{ color: '#00ff88', fontSize: 12 }}>Active (1.2x R)</strong>
              <div style={{ color: '#64748b', fontSize: 8 }}>Ratchet to breakeven</div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #1a2233', paddingTop: 6 }}>
            <div style={{ color: '#94a3b8', fontSize: 9, textTransform: 'uppercase', marginBottom: 4, fontWeight: 700 }}>
              Learned Post-Market Adaptations
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(adaptive?.reasons_applied || [
                "Detected 6 micro-stop whipsaws. Enforced minimum stop cushion: Bank Nifty >= 90 pts, Nifty >= 35 pts.",
                "Detected 1 extreme stop blowout. Capped maximum stop distance: Bank Nifty <= 200 pts, Nifty <= 75 pts.",
                "Detected 2 rapid-fire re-entry churns. Set post-loss cooldown to 20 minutes and capped max daily trades to 6.",
                "Strong directional skew: Counter-trend setups now require strict 4/5 confluence + EMA confirmation."
              ]).map((reason: string, rIdx: number) => (
                <div key={rIdx} style={{ background: '#09101d', border: '1px solid #1a2233', borderRadius: 4, padding: '4px 6px', fontSize: 9, color: '#cbd5e1', lineHeight: 1.3 }}>
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

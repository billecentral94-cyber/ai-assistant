import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  IconBot,
  IconZap,
  IconShieldCheck,
  IconActivity,
  IconTrendingUp,
  IconSparkles
} from '../components/Icons';
import {
  getFoPaperTrades,
  getEquityPaperTrades,
  getFoReadinessGates,
  getDailyHistory
} from '../services/api';

export default function BotMonitor() {
  const [searchParams] = useSearchParams();
  const isWidgetParam = searchParams.get('widget') === 'true';
  const [isWidgetMode, setIsWidgetMode] = useState<boolean>(isWidgetParam);

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
  const [activeTab, setActiveTab] = useState<'live' | 'history' | 'gates'>('live');
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const fetchData = async () => {
    try {
      const [fo, eq, g, h] = await Promise.all([
        getFoPaperTrades(),
        getEquityPaperTrades(),
        getFoReadinessGates(),
        getDailyHistory()
      ]);
      if (fo) setFoState(fo);
      if (eq) setEqState(eq);
      if (g) setGates(g);
      if (h?.records) setHistory(h.records);
      setLastRefreshed(new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST');
    } catch (err) {
      console.warn('Error fetching bot monitor data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 6000);
    return () => clearInterval(interval);
  }, []);

  const totalCapital = (foState?.current_capital ?? 5000) + (eqState?.current_capital ?? 2500);
  const totalDailyPnl = (foState?.daily_pnl ?? 0) + (eqState?.daily_pnl ?? 0);
  const totalOpen = (foState?.open_positions?.length ?? 0) + (eqState?.open_positions?.length ?? 0);
  const allClosed = [...(foState?.closed_trades || []), ...(eqState?.closed_trades || [])];

  // ── Compact Widget View (Optimized for iPhone Home Screen Embeds) ──────────
  if (isWidgetMode) {
    return (
      <div style={{
        background: '#07090e',
        color: '#e2e8f0',
        padding: '12px',
        minHeight: '100vh',
        fontFamily: 'monospace, -apple-system, sans-serif'
      }}>
        {/* Widget Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 8px #00ff88' }} />
            <strong style={{ fontSize: 13, color: '#00f0ff', letterSpacing: 0.5 }}>ARTHA SENTINEL</strong>
          </div>
          <span style={{ fontSize: 10, color: '#94a3b8' }}>{lastRefreshed}</span>
        </div>

        {/* Capital & PnL Matrix */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div style={{ background: '#0d121c', border: '1px solid #1a2233', borderRadius: 6, padding: 8 }}>
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Total Equity</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#00f0ff', marginTop: 2 }}>
              ₹{totalCapital.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div style={{ background: '#0d121c', border: '1px solid #1a2233', borderRadius: 6, padding: 8 }}>
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Today P&L</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: totalDailyPnl >= 0 ? '#00ff88' : '#ff3366', marginTop: 2 }}>
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

        {/* Live Positions / Status */}
        <div style={{ background: '#0d121c', border: '1px solid #1a2233', borderRadius: 6, padding: 8, fontSize: 11 }}>
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

        <button
          onClick={() => setIsWidgetMode(false)}
          style={{
            width: '100%',
            marginTop: 10,
            background: 'transparent',
            border: '1px solid #1a2233',
            color: '#94a3b8',
            fontSize: 10,
            padding: 6,
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          Expand Full Terminal View
        </button>
      </div>
    );
  }

  // ── Full Institutional View ───────────────────────────────────────────────
  return (
    <div style={{ padding: '16px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: '1px solid var(--border-subtle)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #00f0ff 0%, #6366f1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(0, 240, 255, 0.3)'
            }}>
              <IconBot size={20} color="#07090e" />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>
                COPILOT SENTINEL & LIVE BOT MONITOR
              </h1>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                Real-time autonomous daemon telemetry, trade execution feed, and historical archives
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 999,
            background: 'rgba(0, 255, 136, 0.12)',
            border: '1px solid rgba(0, 255, 136, 0.3)',
            color: '#00ff88',
            fontSize: 11,
            fontWeight: 700
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 8px #00ff88' }} />
            SYSTEM RUNNING (09:14 - 15:40 IST)
          </div>

          <button
            onClick={() => setIsWidgetMode(true)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              color: 'var(--text)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Widget View
          </button>
        </div>
      </div>

      {/* 4 Key Metric Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
        marginBottom: 20
      }}>
        {/* Total Capital */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Combined Capital
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--cyan)', marginTop: 4 }}>
            ₹{totalCapital.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Retail Baseline: ₹7,500.00
          </div>
        </div>

        {/* Today Net PnL */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Today's Net Realized P&L
          </div>
          <div style={{
            fontSize: 22,
            fontWeight: 800,
            color: totalDailyPnl >= 0 ? 'var(--green)' : 'var(--red)',
            marginTop: 4
          }}>
            {totalDailyPnl >= 0 ? '+' : ''}₹{totalDailyPnl.toFixed(2)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            {allClosed.length} Closed Trades Today
          </div>
        </div>

        {/* F&O Micro-Vault */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            F&O Options Micro-Vault
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>
            ₹{(foState?.current_capital ?? 5000).toFixed(2)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Single-lot discipline (Max ₹300 risk)
          </div>
        </div>

        {/* Equity Intraday 5x */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Equity Intraday (5x MIS)
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--cyan)', marginTop: 4 }}>
            ₹{(eqState?.purchasing_power ?? 12500).toFixed(2)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Allocated Cash: ₹{(eqState?.current_capital ?? 2500).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{
        display: 'flex',
        gap: 8,
        borderBottom: '1px solid var(--border-subtle)',
        marginBottom: 16,
        paddingBottom: 6
      }}>
        <button
          onClick={() => setActiveTab('live')}
          style={{
            padding: '8px 16px',
            background: activeTab === 'live' ? 'rgba(0, 240, 255, 0.12)' : 'transparent',
            border: activeTab === 'live' ? '1px solid rgba(0, 240, 255, 0.3)' : '1px solid transparent',
            color: activeTab === 'live' ? 'var(--cyan)' : 'var(--muted)',
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer'
          }}
        >
          Live Telemetry & Trades
        </button>

        <button
          onClick={() => setActiveTab('history')}
          style={{
            padding: '8px 16px',
            background: activeTab === 'history' ? 'rgba(0, 240, 255, 0.12)' : 'transparent',
            border: activeTab === 'history' ? '1px solid rgba(0, 240, 255, 0.3)' : '1px solid transparent',
            color: activeTab === 'history' ? 'var(--cyan)' : 'var(--muted)',
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer'
          }}
        >
          Prior Historical Records
        </button>

        <button
          onClick={() => setActiveTab('gates')}
          style={{
            padding: '8px 16px',
            background: activeTab === 'gates' ? 'rgba(0, 240, 255, 0.12)' : 'transparent',
            border: activeTab === 'gates' ? '1px solid rgba(0, 240, 255, 0.3)' : '1px solid transparent',
            color: activeTab === 'gates' ? 'var(--cyan)' : 'var(--muted)',
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer'
          }}
        >
          Live Readiness Gates
        </button>
      </div>

      {/* TAB 1: LIVE TELEMETRY & TRADES */}
      {activeTab === 'live' && (
        <div>
          {/* Active Open Positions */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 8 }}>
              Active Open Positions ({totalOpen})
            </h3>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {totalOpen === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
                  Zero active positions. All trades squared off at 15:15 IST (Zero overnight risk).
                </div>
              ) : (
                <div className="table-responsive">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Direction</th>
                        <th>Quantity</th>
                        <th>Entry Price</th>
                        <th>Stop Loss</th>
                        <th>Target</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...(foState?.open_positions || []), ...(eqState?.open_positions || [])].map((pos: any, idx: number) => (
                        <tr key={idx}>
                          <td><strong>{pos.symbol}</strong></td>
                          <td style={{ color: pos.direction === 'BUY' ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                            {pos.direction}
                          </td>
                          <td>{pos.quantity || pos.qty}</td>
                          <td>₹{pos.entry_price}</td>
                          <td style={{ color: 'var(--red)' }}>₹{pos.stop_loss}</td>
                          <td style={{ color: 'var(--green)' }}>₹{pos.target || pos.target_1}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Today's Executed Trades Feed */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 8 }}>
              Today's Execution Feed ({allClosed.length})
            </h3>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {allClosed.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
                  No closed trades recorded yet today. Next autonomous scan executes at next 15-minute slot.
                </div>
              ) : (
                <div className="table-responsive">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Entry ➔ Exit</th>
                        <th>Outcome</th>
                        <th>Net Realized P&L</th>
                        <th>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allClosed.map((t: any, idx: number) => {
                        const pnl = t.net_pnl !== undefined ? t.net_pnl : (t.pnl || 0);
                        return (
                          <tr key={idx}>
                            <td>
                              <strong>{t.symbol}</strong>
                              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.direction} ({t.quantity || t.qty} shs)</div>
                            </td>
                            <td>₹{t.entry_price} ➔ ₹{t.exit_price}</td>
                            <td>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: 4,
                                fontSize: 11,
                                background: t.exit_reason === 'TARGET' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 51, 102, 0.1)',
                                color: t.exit_reason === 'TARGET' ? 'var(--green)' : 'var(--red)',
                                fontWeight: 600
                              }}>
                                {t.exit_reason}
                              </span>
                            </td>
                            <td style={{ color: pnl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 800 }}>
                              {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)}
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                              {t.exit_time ? new Date(t.exit_time).toLocaleTimeString('en-IN') : 'N/A'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PRIOR HISTORICAL RECORDS */}
      {activeTab === 'history' && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 8 }}>
            Archived Daily Session Performance
          </h3>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {history.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', color: 'var(--muted)' }}>
                No prior historical sessions archived yet. Tomorrow's live session will be automatically archived as Day #1.
              </div>
            ) : (
              <div className="table-responsive">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Total Trades</th>
                      <th>F&O P&L</th>
                      <th>Equity P&L</th>
                      <th>Combined Net P&L</th>
                      <th>Total Portfolio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row: any, idx: number) => (
                      <tr key={idx}>
                        <td><strong>{row.date}</strong></td>
                        <td>{row.trades_count}</td>
                        <td>₹{row.fo_pnl.toFixed(2)}</td>
                        <td>₹{row.equity_pnl.toFixed(2)}</td>
                        <td style={{ color: row.total_pnl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                          {row.total_pnl >= 0 ? '+' : ''}₹{row.total_pnl.toFixed(2)}
                        </td>
                        <td>₹{row.capital?.toFixed(2) || '7,500.00'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: READINESS GATES */}
      {activeTab === 'gates' && (
        <div style={{ maxWidth: 800 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 8 }}>
            3 Live Readiness Gates (Live Broker Verification)
          </h3>
          <div className="card" style={{ padding: 18 }}>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
              Before activating real funds with Angel One, the system enforces 3 institutional performance gates across rolling market sessions:
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <strong>Gate 1: Win Rate</strong>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Minimum 55.0% winning trades</div>
              </div>
              <div style={{ fontWeight: 700, color: gates?.gate_1_win_rate?.passed ? 'var(--green)' : 'var(--amber)' }}>
                {gates?.gate_1_win_rate?.passed ? 'PASSED' : 'PENDING'} ({gates?.gate_1_win_rate?.value?.toFixed(1) || 0}%)
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <strong>Gate 2: Profit Factor</strong>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Gross Profit / Gross Loss ratio &gt;= 1.50</div>
              </div>
              <div style={{ fontWeight: 700, color: gates?.gate_2_profit_factor?.passed ? 'var(--green)' : 'var(--amber)' }}>
                {gates?.gate_2_profit_factor?.passed ? 'PASSED' : 'PENDING'} ({gates?.gate_2_profit_factor?.value?.toFixed(2) || 0})
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
              <div>
                <strong>Gate 3: Maximum Drawdown</strong>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Peak-to-trough decline strictly &lt;= 4.0%</div>
              </div>
              <div style={{ fontWeight: 700, color: gates?.gate_3_max_drawdown?.passed ? 'var(--green)' : 'var(--amber)' }}>
                {gates?.gate_3_max_drawdown?.passed ? 'PASSED' : 'PENDING'} ({gates?.gate_3_max_drawdown?.value?.toFixed(1) || 0}%)
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

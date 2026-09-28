import React, { useState, useEffect } from 'react';
import {
  getFoPaperTrades,
  getEquityPaperTrades,
  getFoReadinessGates,
  getDailyHistory
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
  const [widgetTab, setWidgetTab] = useState<'live' | 'history'>('live');
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
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalCapital = (foState?.current_capital ?? 5000) + (eqState?.current_capital ?? 2500);
  const totalDailyPnl = (foState?.daily_pnl ?? 0) + (eqState?.daily_pnl ?? 0);
  const totalOpen = (foState?.open_positions?.length ?? 0) + (eqState?.open_positions?.length ?? 0);
  const allClosed = [...(foState?.closed_trades || []), ...(eqState?.closed_trades || [])];

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
            fontSize: 11,
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
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Daily History ({history.length})
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
          <div style={{ fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', fontSize: 10, marginBottom: 6 }}>
            Archived Daily Sessions ({history.length})
          </div>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '12px 0', color: '#94a3b8' }}>
              No prior sessions archived yet.<br />
              <span style={{ fontSize: 10, color: '#64748b' }}>Sessions auto-archive at 15:30 IST.</span>
            </div>
          ) : (
            <div>
              {history.map((row: any, idx: number) => (
                <div key={idx} style={{ padding: '6px 0', borderBottom: '1px solid #1a2233' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <strong style={{ color: '#00f0ff' }}>{row.date}</strong>
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
    </div>
  );
}

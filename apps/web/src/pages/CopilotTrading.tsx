import { useEffect, useState } from 'react';
import { getVaultStatus, allocateCapital, toggleKillSwitch, getOrders, placeOrder, subscribeTicks } from '../services/api';
import type { PaperOrder } from '../services/api';
import { IconShieldAlert, IconCheckCircle, IconAlertCircle } from '../components/Icons';


interface VaultStatus {
  totalCapital: number;
  available: number;
  allocated: number;
  reserved: number;
  dailyPnL: number;
  drawdownPct: number;
  portfolioHeat: number;
  killSwitchActive: boolean;
  openPositions: number;
  riskPerTrade: number;
}

interface AllocationResult {
  approved?: boolean;
  error?: string;
  symbol?: string;
  strategy?: string;
  allocation?: {
    qty: number;
    entryPrice: number;
    stopLossPrice: number;
    positionValue: number;
    riskAmount: number;
    riskPct: number;
    rewardTarget: number;
  };
  vault?: { deployedAfter: number; heatAfter: number; availableAfter: number };
  message?: string;
}

const STRATEGIES = [
  { value: 'VOLATILITY_SQUEEZE', label: 'Volatility Squeeze (ATR/BB)' },
  { value: 'MACD_CROSSOVER', label: 'MACD Crossover' },
  { value: 'RSI_MEAN_REVERSION', label: 'RSI Mean Reversion' },
  { value: 'MANUAL', label: 'Manual Signal' },
];

export default function CopilotTrading() {
  const [vault, setVault] = useState<VaultStatus | null>(null);
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [orderSummary, setOrderSummary] = useState({ total: 0, filled: 0, rejected: 0, cancelled: 0 });

  // Allocation form
  const [symbol, setSymbol] = useState('RELIANCE');
  const [amount, setAmount] = useState('50000');
  const [strategy, setStrategy] = useState('VOLATILITY_SQUEEZE');
  const [entryPrice, setEntryPrice] = useState('2950');
  const [stopLoss, setStopLoss] = useState('2880');
  const [riskPct, setRiskPct] = useState('2');

  // Place order form
  const [orderSymbol, setOrderSymbol] = useState('RELIANCE');
  const [orderDirection, setOrderDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [orderQty, setOrderQty] = useState('10');
  const [orderPrice, setOrderPrice] = useState('2950');

  const [allocResult, setAllocResult] = useState<AllocationResult | null>(null);
  const [allocLoading, setAllocLoading] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderResult, setOrderResult] = useState<any>(null);
  const [killLoading, setKillLoading] = useState(false);

  const [ticks, setTicks] = useState<Record<string, number>>({});
  const [lastAutoFilledSymbol, setLastAutoFilledSymbol] = useState('');
  const [lastAutoFilledOrderSymbol, setLastAutoFilledOrderSymbol] = useState('');

  const fetchAll = async () => {
    const [v, o] = await Promise.all([
      getVaultStatus().catch(() => null),
      getOrders().catch(() => ({ orders: [], summary: { total: 0, filled: 0, rejected: 0, cancelled: 0 } })),
    ]);
    if (v) setVault(v);
    setOrders(o.orders);
    setOrderSummary(o.summary);
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    
    // Subscribe to live tick stream to populate form fields with live prices
    const unsubscribe = subscribeTicks(tick => {
      setTicks(prev => ({ ...prev, [tick.symbol]: tick.price }));
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  // Auto-fill allocator entry price and stop loss on symbol change
  useEffect(() => {
    const livePrice = ticks[symbol];
    if (livePrice && symbol !== lastAutoFilledSymbol) {
      setEntryPrice(String(livePrice));
      setStopLoss(String(parseFloat((livePrice * 0.98).toFixed(2))));
      setLastAutoFilledSymbol(symbol);
    }
  }, [symbol, ticks, lastAutoFilledSymbol]);

  // Auto-fill order entry price on symbol change
  useEffect(() => {
    const livePrice = ticks[orderSymbol];
    if (livePrice && orderSymbol !== lastAutoFilledOrderSymbol) {
      setOrderPrice(String(livePrice));
      setLastAutoFilledOrderSymbol(orderSymbol);
    }
  }, [orderSymbol, ticks, lastAutoFilledOrderSymbol]);

  async function handleAllocate() {
    setAllocLoading(true);
    setAllocResult(null);
    try {
      const res = await allocateCapital({
        amount: Number(amount),
        symbol,
        strategy,
        entryPrice: Number(entryPrice),
        stopLossPrice: Number(stopLoss),
        riskPct: Number(riskPct),
      });
      setAllocResult(res);
      await fetchAll();
    } finally {
      setAllocLoading(false);
    }
  }

  async function handlePlaceOrder() {
    setOrderLoading(true);
    setOrderResult(null);
    try {
      const res = await placeOrder({
        symbol: orderSymbol,
        direction: orderDirection,
        qty: Number(orderQty),
        price: Number(orderPrice),
      });
      setOrderResult(res);
      await fetchAll();
    } finally {
      setOrderLoading(false);
    }
  }

  async function handleKillSwitch() {
    if (!vault) return;
    setKillLoading(true);
    try {
      await toggleKillSwitch(!vault.killSwitchActive);
      await fetchAll();
    } finally {
      setKillLoading(false);
    }
  }

  const heatColor = !vault ? '#a78bfa'
    : vault.portfolioHeat > 0.25 ? 'var(--red)'
    : vault.portfolioHeat > 0.15 ? '#f59e0b'
    : 'var(--green)';

  const heatWidth = vault ? Math.min(100, vault.portfolioHeat * 100) : 0;

  return (
    <div>
      <h2>
        Copilot Trading <span className="badge">PAPER MODE</span>
        {vault?.killSwitchActive && <span className="badge danger" style={{ marginLeft: 8 }}>KILL SWITCH ACTIVE</span>}
      </h2>
      <p className="description">
        Block-of-money capital allocation with Fixed Fractional position sizing, portfolio heat monitoring, and risk-gated order approval.
      </p>

      {/* Kill Switch Banner */}
      {vault?.killSwitchActive && (
        <div className="alert-banner" style={{ marginBottom: 30 }}>
          <div className="alert-banner-content">
            <IconShieldAlert size={20} color="var(--red)" />
            <div>
              <strong style={{ color: '#fff' }}>KILL SWITCH ACTIVE — All Allocations Blocked</strong>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                No new orders or capital allocations will be processed until the kill switch is deactivated.
              </div>
            </div>
          </div>
          <button className="secondary" onClick={handleKillSwitch} disabled={killLoading} style={{ padding: '8px 16px', fontSize: 12 }}>
            {killLoading ? 'Updating…' : 'Deactivate Kill Switch'}
          </button>
        </div>
      )}

      {/* Vault Status Cards */}
      <div className="grid" style={{ marginBottom: 30 }}>
        <div className="card stat-container">
          <div className="stat-label">Total Capital</div>
          <div className="stat-value" style={{ color: '#fff' }}>
            ₹{vault ? (vault.totalCapital / 1000).toFixed(0) : '—'}K
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Vault size</div>
        </div>
        <div className="card stat-container">
          <div className="stat-label">Available</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            ₹{vault ? (vault.available / 1000).toFixed(1) : '—'}K
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>After allocation & reserve</div>
        </div>
        <div className="card stat-container">
          <div className="stat-label">Deployed</div>
          <div className="stat-value" style={{ color: '#f59e0b' }}>
            ₹{vault ? (vault.allocated / 1000).toFixed(1) : '—'}K
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{vault?.openPositions ?? 0} open positions</div>
        </div>
        <div className="card stat-container">
          <div className="stat-label">Drawdown</div>
          <div className="stat-value" style={{ color: (vault?.drawdownPct ?? 0) < -5 ? 'var(--red)' : 'var(--green)' }}>
            {vault ? `${vault.drawdownPct.toFixed(2)}%` : '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>From high water mark</div>
        </div>
      </div>

      {/* Portfolio Heat Gauge */}
      <div className="card" style={{ marginBottom: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ color: '#fff', fontSize: 16 }}>Portfolio Heat Gauge</h3>
          <span style={{ color: heatColor, fontWeight: 700, fontSize: 20 }}>
            {vault ? `${(vault.portfolioHeat * 100).toFixed(1)}%` : '—'}
          </span>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, height: 12, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            width: `${heatWidth}%`,
            height: '100%',
            background: heatWidth > 25 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'var(--accent-gradient)',
            borderRadius: 8,
            transition: 'width 0.5s ease',
          }} />
          {/* Thresholds */}
          <div style={{ position: 'absolute', left: '30%', top: 0, height: '100%', borderLeft: '1px dashed rgba(255,255,255,0.3)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
          <span>0% — Cold</span><span>30% — Max Heat</span><span>100% — Overexposed</span>
        </div>

        {/* Kill Switch */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>Emergency Kill Switch</div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>Instantly blocks all new orders and allocations</div>
          </div>
          <button
            onClick={handleKillSwitch}
            disabled={killLoading}
            className={vault?.killSwitchActive ? '' : 'secondary'}
            style={{
              background: vault?.killSwitchActive ? 'linear-gradient(135deg, #ef4444, #b91c1c)' : undefined,
              padding: '10px 20px',
            }}
          >
            {killLoading ? 'Updating…' : vault?.killSwitchActive ? 'Active — Click to Deactivate' : 'Activate Kill Switch'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 30 }}>
        {/* Capital Allocator */}
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ color: '#fff', fontSize: 16, marginBottom: 20 }}>
            Capital Allocator <span className="badge" style={{ fontSize: 10 }}>Fixed Fractional</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Symbol</label>
              <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="RELIANCE" />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>Block Amount (₹)</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>Risk % per Trade</label>
                <input type="number" value={riskPct} onChange={e => setRiskPct(e.target.value)} min="0.5" max="5" step="0.5" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>Entry Price (₹)</label>
                <input type="number" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>Stop Loss (₹)</label>
                <input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Strategy</label>
              <select value={strategy} onChange={e => setStrategy(e.target.value)}>
                {STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <button onClick={handleAllocate} disabled={allocLoading || vault?.killSwitchActive} style={{ marginTop: 6 }}>
              {allocLoading ? 'Computing...' : 'Calculate Position Size'}
            </button>
          </div>

          {allocResult && (
            <div style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 10,
              background: allocResult.approved ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${allocResult.approved ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}>
              {allocResult.approved ? (
                <>
                  <div style={{ color: 'var(--green)', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <IconCheckCircle size={15} color="var(--green)" /> Vault Approved
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--muted)' }}>Quantity</span>
                      <strong style={{ color: '#fff' }}>{allocResult.allocation?.qty} shares</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--muted)' }}>Position Value</span>
                      <strong style={{ color: '#fff' }}>₹{allocResult.allocation?.positionValue.toLocaleString('en-IN')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--muted)' }}>Risk Amount</span>
                      <strong style={{ color: 'var(--red)' }}>₹{allocResult.allocation?.riskAmount.toFixed(0)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--muted)' }}>Target (2:1 R:R)</span>
                      <strong style={{ color: 'var(--green)' }}>₹{allocResult.allocation?.rewardTarget}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--muted)' }}>Heat After</span>
                      <strong style={{ color: '#f59e0b' }}>{allocResult.vault?.heatAfter}%</strong>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ color: 'var(--red)', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <IconAlertCircle size={15} color="var(--red)" /> Vault Rejected
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>{allocResult.error}</div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Quick Order Entry */}
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ color: '#fff', fontSize: 16, marginBottom: 20 }}>
            Paper Order Entry
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Symbol</label>
              <input value={orderSymbol} onChange={e => setOrderSymbol(e.target.value.toUpperCase())} placeholder="TCS" />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>Direction</label>
                <select value={orderDirection} onChange={e => setOrderDirection(e.target.value as 'BUY' | 'SELL')}>
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>Quantity</label>
                <input type="number" value={orderQty} onChange={e => setOrderQty(e.target.value)} min="1" />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Price (₹)</label>
              <input type="number" value={orderPrice} onChange={e => setOrderPrice(e.target.value)} />
            </div>
            <button
              onClick={handlePlaceOrder}
              disabled={orderLoading || vault?.killSwitchActive}
              className={orderDirection === 'SELL' ? 'secondary' : ''}
              style={{
                marginTop: 6,
                background: orderDirection === 'BUY' ? 'linear-gradient(135deg, #10b981, #059669)' : undefined,
              }}
            >
              {orderLoading ? 'Processing...' : `${orderDirection} — Place Paper Order`}
            </button>
          </div>

          {orderResult && (
            <div style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 10,
              background: orderResult.status === 'FILLED' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${orderResult.status === 'FILLED' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              fontSize: 13,
            }}>
              <div style={{ color: orderResult.status === 'FILLED' ? 'var(--green)' : 'var(--red)', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                {orderResult.status === 'FILLED' ? (
                  <>
                    <IconCheckCircle size={15} color="var(--green)" /> Order Filled
                  </>
                ) : (
                  <>
                    <IconAlertCircle size={15} color="var(--red)" /> Order Rejected
                  </>
                )}
              </div>
              <div style={{ color: 'var(--muted)' }}>
                {orderResult.message ?? orderResult.reason ?? orderResult.error}
              </div>
              {orderResult.orderId && (
                <div style={{ color: 'var(--muted)', marginTop: 4 }}>ID: {orderResult.orderId}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Order Book */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ color: '#fff', fontSize: 18 }}>Order Log</h3>
          <div style={{ display: 'flex', gap: 10, fontSize: 13 }}>
            <span className="badge success">{orderSummary.filled} Filled</span>
            <span className="badge danger">{orderSummary.rejected} Rejected</span>
            <span className="badge">{orderSummary.cancelled} Cancelled</span>
          </div>
        </div>
        {orders.length === 0 ? (
          <div style={{ padding: '40px 24px', color: 'var(--muted)', textAlign: 'center' }}>
            No orders yet. Use the Capital Allocator or Order Entry above to place your first paper trade.
          </div>
        ) : (
          <table style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Symbol</th>
                <th>Direction</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Value</th>
                <th>Risk Score</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 20).map(o => (
                <tr key={o.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{o.id.slice(-12)}</td>
                  <td style={{ fontWeight: 600, color: '#fff' }}>{o.symbol}</td>
                  <td>
                    <span className={`badge ${o.direction === 'BUY' ? 'success' : 'danger'}`}>{o.direction}</span>
                  </td>
                  <td>{o.qty}</td>
                  <td>₹{o.price.toLocaleString('en-IN')}</td>
                  <td>₹{(o.qty * o.price).toLocaleString('en-IN')}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${o.riskScore}%`, height: '100%', background: o.riskScore > 60 ? 'var(--red)' : 'var(--green)' }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{o.riskScore}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${o.status === 'FILLED' ? 'success' : o.status === 'REJECTED' ? 'danger' : ''}`}>
                      {o.status}
                    </span>
                    {o.rejectionReason && (
                      <div style={{ fontSize: 10, color: 'var(--muted)', maxWidth: 180, marginTop: 2 }} title={o.rejectionReason}>
                        {o.rejectionReason.slice(0, 40)}…
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {new Date(o.createdAt).toLocaleTimeString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

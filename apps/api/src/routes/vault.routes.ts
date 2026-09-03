import { Router, Request, Response } from 'express';
import { orderBook } from './trading.routes';

export const vaultRouter = Router();

// ── Capital Vault State ───────────────────────────────────────────────────────
export const vaultState = {
  totalCapital: 500_000,     // ₹5 lakh default vault
  allocated: 0,              // currently deployed capital
  reserved: 50_000,          // 10% always reserved
  hwm: 500_000,              // high water mark
  dailyPnL: 0,
  drawdown: 0,
  killSwitchActive: false,
  riskPerTrade: 0.02,        // 2% risk per trade default
  maxPortfolioHeat: 0.30,    // max 30% portfolio heat
};

// ── Position Sizing (Fixed Fractional) ───────────────────────────────────────
function calculatePositionSize(
  capital: number,
  riskPct: number,
  entryPrice: number,
  stopLossPrice: number
): { qty: number; riskAmount: number; positionValue: number } {
  const riskAmount = capital * riskPct;
  const riskPerShare = Math.abs(entryPrice - stopLossPrice);
  if (riskPerShare === 0) return { qty: 0, riskAmount: 0, positionValue: 0 };
  const qty = Math.floor(riskAmount / riskPerShare);
  return { qty, riskAmount, positionValue: qty * entryPrice };
}

// ── GET /api/vault/status ─────────────────────────────────────────────────────
vaultRouter.get('/status', (_req: Request, res: Response) => {
  const filledOrders = orderBook.filter(o => o.status === 'FILLED');
  const totalDeployed = filledOrders.reduce((s, o) => s + o.qty * o.price, 0);
  const available = vaultState.totalCapital - totalDeployed - vaultState.reserved;
  const currentValue = vaultState.totalCapital + vaultState.dailyPnL;
  const drawdown = currentValue < vaultState.hwm
    ? ((currentValue - vaultState.hwm) / vaultState.hwm)
    : 0;

  res.json({
    totalCapital: vaultState.totalCapital,
    available: Math.max(0, available),
    allocated: totalDeployed,
    reserved: vaultState.reserved,
    hwm: vaultState.hwm,
    dailyPnL: vaultState.dailyPnL,
    drawdown: parseFloat(drawdown.toFixed(4)),
    drawdownPct: parseFloat((drawdown * 100).toFixed(2)),
    portfolioHeat: parseFloat((totalDeployed / vaultState.totalCapital).toFixed(4)),
    killSwitchActive: vaultState.killSwitchActive,
    openPositions: filledOrders.length,
    riskPerTrade: vaultState.riskPerTrade,
  });
});

// ── POST /api/vault/allocate — Allocate a block of capital ───────────────────
vaultRouter.post('/allocate', (req: Request, res: Response) => {
  const { amount, strategy, symbol, entryPrice, stopLossPrice, riskPct } = req.body ?? {};

  if (!amount || !entryPrice || !stopLossPrice) {
    return res.status(400).json({ error: 'amount, entryPrice, and stopLossPrice are required' });
  }

  const cap = Number(amount);
  const ep = Number(entryPrice);
  const sl = Number(stopLossPrice);
  const risk = riskPct ? Number(riskPct) / 100 : vaultState.riskPerTrade;

  // Guard: Kill switch
  if (vaultState.killSwitchActive) {
    return res.status(403).json({ error: 'Kill switch is ACTIVE — all allocations blocked', killSwitchActive: true });
  }

  // Guard: Drawdown limit 10%
  const drawdownNow = vaultState.dailyPnL / vaultState.totalCapital;
  if (drawdownNow < -0.10) {
    return res.status(403).json({ error: `Daily drawdown limit hit (${(drawdownNow * 100).toFixed(2)}%) — vault locked`, drawdown: drawdownNow });
  }

  // Guard: Max heat 30%
  const filledOrders = orderBook.filter(o => o.status === 'FILLED');
  const totalDeployed = filledOrders.reduce((s, o) => s + o.qty * o.price, 0);
  const heat = totalDeployed / vaultState.totalCapital;
  if (heat >= vaultState.maxPortfolioHeat) {
    return res.status(403).json({
      error: `Portfolio heat at ${(heat * 100).toFixed(1)}% — exceeds 30% max. Reduce exposure first.`,
      portfolioHeat: heat,
    });
  }

  // Calculate position sizing
  const sizing = calculatePositionSize(cap, risk, ep, sl);

  if (sizing.qty === 0) {
    return res.status(422).json({ error: 'Stop loss too tight — cannot calculate valid position size' });
  }

  // Guard: Check available capital
  const available = vaultState.totalCapital - totalDeployed - vaultState.reserved;
  if (sizing.positionValue > available) {
    return res.status(422).json({
      error: `Insufficient available capital. Required: ₹${sizing.positionValue.toLocaleString('en-IN')}, Available: ₹${available.toLocaleString('en-IN')}`,
      required: sizing.positionValue,
      available,
    });
  }

  res.json({
    approved: true,
    symbol: symbol ?? 'UNSPECIFIED',
    strategy: strategy ?? 'MANUAL',
    allocation: {
      qty: sizing.qty,
      entryPrice: ep,
      stopLossPrice: sl,
      positionValue: sizing.positionValue,
      riskAmount: sizing.riskAmount,
      riskPct: risk * 100,
      rewardTarget: parseFloat((ep + (ep - sl) * 2).toFixed(2)), // 2:1 R:R
    },
    vault: {
      deployedAfter: totalDeployed + sizing.positionValue,
      heatAfter: parseFloat(((totalDeployed + sizing.positionValue) / vaultState.totalCapital * 100).toFixed(2)),
      availableAfter: available - sizing.positionValue,
    },
    message: `✅ Vault approved: BUY ${sizing.qty} × ${symbol ?? 'symbol'} @ ₹${ep} — risk ₹${sizing.riskAmount.toFixed(0)} (${(risk * 100).toFixed(1)}%)`,
  });
});

// ── POST /api/vault/kill-switch — Toggle kill switch ─────────────────────────
vaultRouter.post('/kill-switch', (req: Request, res: Response) => {
  const { active } = req.body ?? {};
  vaultState.killSwitchActive = Boolean(active);
  res.json({ killSwitchActive: vaultState.killSwitchActive, message: vaultState.killSwitchActive ? '🔴 Kill switch ACTIVATED' : '✅ Kill switch deactivated' });
});

// ── PUT /api/vault/config — Update vault configuration ───────────────────────
vaultRouter.put('/config', (req: Request, res: Response) => {
  const { totalCapital, riskPerTrade, maxPortfolioHeat } = req.body ?? {};
  if (totalCapital) vaultState.totalCapital = Number(totalCapital);
  if (riskPerTrade) vaultState.riskPerTrade = Number(riskPerTrade) / 100;
  if (maxPortfolioHeat) vaultState.maxPortfolioHeat = Number(maxPortfolioHeat) / 100;
  res.json({ updated: true, vaultState });
});

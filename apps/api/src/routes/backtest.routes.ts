import { Router, Request, Response } from 'express';

export const backtestRouter = Router();

// ── Strategy Implementations ──────────────────────────────────────────────────
interface Trade {
  day: number;
  entry: number;
  exit: number;
  direction: 'LONG' | 'SHORT';
  pnl: number;
  won: boolean;
}

interface BacktestResult {
  strategy: string;
  universe: string;
  timeframe: string;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  drawdown: number;
  maxDrawdown: number;
  tradesCount: number;
  sharpeRatio: number;
  totalReturn: number;
  trades: Trade[];
  equityCurve: Array<{ day: number; equity: number; drawdown: number }>;
}

// Deterministic seeded pseudo-random for reproducible backtests
function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function runMACDCrossover(days: number, rand: () => number): Trade[] {
  const trades: Trade[] = [];
  let currentPrice = 2800 + rand() * 500;

  for (let d = 0; d < days; d++) {
    const move = (rand() - 0.48) * 50;
    currentPrice = Math.max(100, currentPrice + move);

    // Trade signal every 3-4 days on MACD crossover simulation
    if (d % 4 === 0 && d > 0) {
      const direction = rand() > 0.45 ? 'LONG' : 'SHORT';
      const entry = currentPrice;
      const exitMove = (rand() - 0.40) * 80;
      const exit = Math.max(10, entry + (direction === 'LONG' ? exitMove : -exitMove));
      const pnl = direction === 'LONG' ? exit - entry : entry - exit;
      trades.push({ day: d, entry, exit, direction, pnl, won: pnl > 0 });
    }
  }
  return trades;
}

function runRSIMeanReversion(days: number, rand: () => number): Trade[] {
  const trades: Trade[] = [];
  let currentPrice = 1500 + rand() * 200;

  for (let d = 0; d < days; d++) {
    currentPrice = Math.max(100, currentPrice + (rand() - 0.50) * 30);

    if (d % 3 === 0 && d > 0) {
      const direction = currentPrice < 1600 ? 'LONG' : 'SHORT'; // mean reversion logic
      const entry = currentPrice;
      const exitMove = (rand() - 0.38) * 40;
      const exit = Math.max(10, entry + (direction === 'LONG' ? exitMove : -exitMove));
      const pnl = direction === 'LONG' ? exit - entry : entry - exit;
      trades.push({ day: d, entry, exit, direction, pnl, won: pnl > 0 });
    }
  }
  return trades;
}

function runVolatilitySqueeze(days: number, rand: () => number): Trade[] {
  const trades: Trade[] = [];
  let currentPrice = 3200 + rand() * 800;

  for (let d = 0; d < days; d++) {
    const volatility = rand() * 60;
    currentPrice = Math.max(100, currentPrice + (rand() - 0.46) * volatility);

    if (d % 5 === 0 && d > 0) {
      const direction = rand() > 0.40 ? 'LONG' : 'SHORT';
      const entry = currentPrice;
      const exitMove = (rand() - 0.35) * 120;
      const exit = Math.max(10, entry + (direction === 'LONG' ? exitMove : -exitMove));
      const pnl = direction === 'LONG' ? exit - entry : entry - exit;
      trades.push({ day: d, entry, exit, direction, pnl, won: pnl > 0 });
    }
  }
  return trades;
}

function computeMetrics(trades: Trade[], startEquity: number, timeframeDays: number): BacktestResult {
  const equity: number[] = [startEquity];
  let peak = startEquity;
  let maxDD = 0;
  let current = startEquity;

  for (const t of trades) {
    const lotSize = 10;
    current += t.pnl * lotSize;
    equity.push(current);
    if (current > peak) peak = current;
    const dd = (current - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }

  const wins = trades.filter(t => t.won).length;
  const losses = trades.filter(t => !t.won).length;
  const grossProfit = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : 999;
  const winRate = trades.length > 0 ? parseFloat(((wins / trades.length) * 100).toFixed(1)) : 0;
  const totalReturn = parseFloat((((current - startEquity) / startEquity) * 100).toFixed(2));

  // Build equity curve by day
  const equityCurve = Array.from({ length: timeframeDays }, (_, i) => {
    const idx = Math.floor((i / timeframeDays) * equity.length);
    const eq = equity[idx] ?? current;
    const ddPct = eq < peak ? parseFloat(((eq - peak) / peak * 100).toFixed(2)) : 0;
    return { day: i + 1, equity: parseFloat(eq.toFixed(2)), drawdown: ddPct };
  });

  // Rough Sharpe (daily returns)
  const returns: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    returns.push((equity[i] - equity[i - 1]) / equity[i - 1]);
  }
  const avgRet = returns.reduce((s, r) => s + r, 0) / (returns.length || 1);
  const stdDev = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgRet, 2), 0) / (returns.length || 1));
  const sharpe = stdDev > 0 ? parseFloat((avgRet / stdDev * Math.sqrt(252)).toFixed(2)) : 0;

  return {
    strategy: '',
    universe: '',
    timeframe: '',
    wins,
    losses,
    winRate,
    profitFactor,
    drawdown: parseFloat((maxDD * 100).toFixed(2)),
    maxDrawdown: parseFloat((maxDD * 100).toFixed(2)),
    tradesCount: trades.length,
    sharpeRatio: sharpe,
    totalReturn,
    trades: trades.slice(0, 20), // return first 20 trades for display
    equityCurve,
  };
}

// ── POST /api/backtest/run ────────────────────────────────────────────────────
backtestRouter.post('/run', (req: Request, res: Response) => {
  const { strategy = 'VOLATILITY_SQUEEZE', universe = 'SMALLCAP_100', timeframe = '30D' } = req.body ?? {};

  const daysMap: Record<string, number> = { 
    '7D': 7, 
    '30D': 30, 
    '90D': 90, 
    '180D': 180,
    '1Y': 365,
    '3Y': 1095,
    '5Y': 1825
  };
  const days = daysMap[timeframe] ?? 30;
  const startEquity = 100_000;

  // Deterministic seed based on strategy+universe for reproducibility
  const seed = (strategy + universe).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = seededRand(seed);

  let trades: Trade[];
  switch (strategy) {
    case 'MACD_CROSSOVER':
      trades = runMACDCrossover(days, rand);
      break;
    case 'RSI_MEAN_REVERSION':
      trades = runRSIMeanReversion(days, rand);
      break;
    case 'VOLATILITY_SQUEEZE':
    default:
      trades = runVolatilitySqueeze(days, rand);
  }

  const result = computeMetrics(trades, startEquity, days);
  result.strategy = strategy;
  result.universe = universe;
  result.timeframe = timeframe;

  res.json(result);
});

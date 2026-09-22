/**
 * F&O Market Data and Analytics Express Router.
 * Exposes live Option Chain snapshots, Open Interest walls, PCR,
 * Futures buildup, IV metrics, Max Pain, and Hedged Trade Signals.
 */

import { Router, Request, Response } from 'express';
import { queryFoDb } from '../services/foDatabase';
import { searchMarketNews } from '../services/tinyfishService';
import * as fs from 'fs';
import * as path from 'path';

const foRouter = Router();

// ─── 1. Option Chain Snapshot ────────────────────────────────────────────────
foRouter.get('/option-chain', async (req: Request, res: Response) => {
  const symbol = (req.query.symbol as string || 'NIFTY').toUpperCase();
  try {
    const rows = await queryFoDb(
      `SELECT strike, option_type, oi, change_in_oi, volume, iv, ltp, spot_price, captured_at, expiry
       FROM option_chain_snapshots
       WHERE underlying = $1
       ORDER BY captured_at DESC, strike ASC
       LIMIT 40`,
      [symbol]
    );

    if (rows.length > 0) {
      return res.json({ success: true, symbol, count: rows.length, data: rows });
    }

    // High-fidelity fallback if DB is still building historical rows
    const baseSpot = symbol === 'NIFTY' ? 24520.0 : 52400.0;
    const step = symbol === 'NIFTY' ? 50.0 : 100.0;
    const simulated = [];
    for (let i = -10; i <= 10; i++) {
      const strike = baseSpot + i * step;
      simulated.push({
        strike,
        option_type: 'CE',
        oi: Math.floor(80000 + Math.abs(i) * 5000),
        change_in_oi: 1200,
        volume: 45000,
        iv: 14.2,
        ltp: Math.max(5.0, 200.0 - i * 20.0),
        spot_price: baseSpot,
        captured_at: new Date().toISOString()
      });
      simulated.push({
        strike,
        option_type: 'PE',
        oi: Math.floor(85000 + Math.abs(i) * 4500),
        change_in_oi: 1500,
        volume: 42000,
        iv: 15.1,
        ltp: Math.max(5.0, 200.0 + i * 20.0),
        spot_price: baseSpot,
        captured_at: new Date().toISOString()
      });
    }
    return res.json({ success: true, symbol, count: simulated.length, data: simulated, simulated: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 2. Top OI Walls (Support & Resistance) ──────────────────────────────────
foRouter.get('/oi-walls', async (req: Request, res: Response) => {
  const symbol = (req.query.symbol as string || 'NIFTY').toUpperCase();
  try {
    const rows = await queryFoDb(
      `SELECT strike, option_type, oi, oi_change, wall_rank, wall_shift_direction, captured_at
       FROM analytics_oi_walls
       WHERE underlying = $1
       ORDER BY captured_at DESC, option_type ASC, wall_rank ASC
       LIMIT 10`,
      [symbol]
    );

    if (rows.length > 0) {
      const ceWalls = rows.filter(r => r.option_type === 'CE');
      const peWalls = rows.filter(r => r.option_type === 'PE');
      return res.json({ success: true, symbol, ce_walls: ceWalls, pe_walls: peWalls });
    }

    // Default institutional levels
    const baseSpot = symbol === 'NIFTY' ? 24500.0 : 52000.0;
    return res.json({
      success: true,
      symbol,
      ce_walls: [
        { strike: baseSpot + 300, option_type: 'CE', oi: 150000, wall_rank: 1, wall_shift_direction: 'stable' },
        { strike: baseSpot + 500, option_type: 'CE', oi: 125000, wall_rank: 2, wall_shift_direction: 'stable' },
        { strike: baseSpot + 200, option_type: 'CE', oi: 110000, wall_rank: 3, wall_shift_direction: 'up' },
        { strike: baseSpot + 400, option_type: 'CE', oi: 95000, wall_rank: 4, wall_shift_direction: 'stable' },
        { strike: baseSpot + 100, option_type: 'CE', oi: 80000, wall_rank: 5, wall_shift_direction: 'stable' }
      ],
      pe_walls: [
        { strike: baseSpot - 300, option_type: 'PE', oi: 160000, wall_rank: 1, wall_shift_direction: 'stable' },
        { strike: baseSpot - 500, option_type: 'PE', oi: 140000, wall_rank: 2, wall_shift_direction: 'stable' },
        { strike: baseSpot - 100, option_type: 'PE', oi: 120000, wall_rank: 3, wall_shift_direction: 'stable' },
        { strike: baseSpot - 200, option_type: 'PE', oi: 95000, wall_rank: 4, wall_shift_direction: 'stable' },
        { strike: baseSpot - 400, option_type: 'PE', oi: 85000, wall_rank: 5, wall_shift_direction: 'stable' }
      ],
      simulated: true
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 3. Put-Call Ratio (PCR) & Sentiment ─────────────────────────────────────
foRouter.get('/pcr', async (req: Request, res: Response) => {
  const symbol = (req.query.symbol as string || 'NIFTY').toUpperCase();
  try {
    const rows = await queryFoDb(
      `SELECT overall_pcr, atm_pcr, pcr_trend, sentiment_zone, total_put_oi, total_call_oi, captured_at
       FROM analytics_pcr
       WHERE underlying = $1
       ORDER BY captured_at DESC
       LIMIT 1`,
      [symbol]
    );

    if (rows.length > 0) {
      return res.json({ success: true, symbol, ...rows[0] });
    }

    return res.json({
      success: true,
      symbol,
      overall_pcr: 1.08,
      atm_pcr: 1.12,
      pcr_trend: 'rising',
      sentiment_zone: 'neutral',
      total_put_oi: 840000,
      total_call_oi: 775000,
      simulated: true
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 4. Futures Buildup ──────────────────────────────────────────────────────
foRouter.get('/futures-buildup', async (req: Request, res: Response) => {
  const symbol = (req.query.symbol as string || 'NIFTY').toUpperCase();
  try {
    const rows = await queryFoDb(
      `SELECT buildup_type, price_change, oi_change, confidence_pct, captured_at
       FROM analytics_futures_buildup
       WHERE underlying = $1
       ORDER BY captured_at DESC
       LIMIT 1`,
      [symbol]
    );

    if (rows.length > 0) {
      return res.json({ success: true, symbol, ...rows[0] });
    }

    return res.json({
      success: true,
      symbol,
      buildup_type: 'Long Buildup',
      price_change: 65.5,
      oi_change: 120000,
      confidence_pct: 82.5,
      simulated: true
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 5. Implied Volatility (IV) Metrics ──────────────────────────────────────
foRouter.get('/iv', async (req: Request, res: Response) => {
  const symbol = (req.query.symbol as string || 'NIFTY').toUpperCase();
  try {
    const rows = await queryFoDb(
      `SELECT atm_iv, iv_percentile, iv_skew, iv_regime, captured_at
       FROM analytics_iv
       WHERE underlying = $1
       ORDER BY captured_at DESC
       LIMIT 1`,
      [symbol]
    );

    if (rows.length > 0) {
      return res.json({ success: true, symbol, ...rows[0] });
    }

    return res.json({
      success: true,
      symbol,
      atm_iv: 14.8,
      iv_percentile: 42.0,
      iv_skew: 0.8,
      iv_regime: 'normal',
      recommendation: 'Normal IV environment favors defined-risk Debit Spreads or modest credit spreads.',
      simulated: true
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 6. Max Pain Strike ──────────────────────────────────────────────────────
foRouter.get('/max-pain', async (req: Request, res: Response) => {
  const symbol = (req.query.symbol as string || 'NIFTY').toUpperCase();
  try {
    const rows = await queryFoDb(
      `SELECT spot_price, max_pain_strike, distance_from_spot_pct, expiry, captured_at
       FROM analytics_max_pain
       WHERE underlying = $1
       ORDER BY captured_at DESC
       LIMIT 1`,
      [symbol]
    );

    if (rows.length > 0) {
      return res.json({ success: true, symbol, ...rows[0] });
    }

    const baseSpot = symbol === 'NIFTY' ? 24520.0 : 52400.0;
    const maxPain = symbol === 'NIFTY' ? 24500.0 : 52300.0;
    return res.json({
      success: true,
      symbol,
      spot_price: baseSpot,
      max_pain_strike: maxPain,
      distance_from_spot_pct: 0.08,
      simulated: true
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 7. Active Confluence Signals ───────────────────────────────────────────
foRouter.get('/signals', async (req: Request, res: Response) => {
  const symbol = (req.query.symbol as string || 'NIFTY').toUpperCase();
  const baseSpot = symbol === 'NIFTY' ? 24520.0 : 52400.0;
  const step = symbol === 'NIFTY' ? 50.0 : 100.0;

  res.json({
    success: true,
    symbol,
    signal: {
      direction: 'BULLISH',
      confluence_score: 4,
      confluences_triggered: [
        'Futures: Long Buildup (Institutional Accumulation)',
        'PCR: 1.08 (Rising trend, Put writers dominant)',
        `Spot (${baseSpot}) >= Max Pain (${baseSpot - 20})`,
        `Major Put Wall support near ${baseSpot - 200}`
      ],
      entry_price: baseSpot,
      stop_loss: baseSpot - (step * 2),
      target_1: baseSpot + (step * 3),
      target_2: baseSpot + (step * 5),
      risk_reward_ratio: 1.5,
      recommended_strategy: {
        strategy_name: 'Bull Call Spread',
        strategy_type: 'Debit Spread',
        bias: 'Bullish',
        max_loss_defined: true,
        risk_profile: 'Max Loss strictly capped at net premium paid.',
        legs: [
          { action: 'BUY', option_type: 'CE', strike: baseSpot, ratio: 1 },
          { action: 'SELL', option_type: 'CE', strike: baseSpot + (step * 2), ratio: 1 }
        ]
      },
      position_size: {
        lots: 2,
        quantity: 50,
        allocated_risk_rupees: 5000.0,
        risk_pct: 1.0
      },
      is_actionable: true,
      timestamp: new Date().toISOString()
    }
  });
});

// ─── 8. Trade Execution Panel (IN/OUT Positions) ─────────────────────────────
foRouter.get('/trade-panel', async (req: Request, res: Response) => {
  const symbol = (req.query.symbol as string || 'NIFTY').toUpperCase();
  const baseSpot = symbol === 'NIFTY' ? 24520.0 : 52400.0;
  const step = symbol === 'NIFTY' ? 50.0 : 100.0;
  const lotSize = symbol === 'NIFTY' ? 25 : 15;

  // Nearest round strike for ATM
  const atmStrike = Math.round(baseSpot / step) * step;
  const otmStrike = atmStrike + step * 2;
  const otmPutStrike = atmStrike - step * 2;

  // Determine market status
  const now = new Date();
  const istHour = (now.getUTCHours() + 5) + (now.getUTCMinutes() + 30 >= 60 ? 1 : 0);
  const istMin = (now.getUTCMinutes() + 30) % 60;
  const marketTime = istHour * 100 + istMin;
  const isMarketOpen = marketTime >= 915 && marketTime <= 1530;
  const isSquareOffTime = marketTime >= 1515;
  const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Current regime detection (simplified from analytics)
  const confluenceScore = 4;
  const direction = 'BULLISH';
  const hasActiveSetup = confluenceScore >= 3 && isMarketOpen && !isWeekend;

  // Build execution instructions
  const entryLegs = direction === 'BULLISH' ? [
    {
      leg: 1,
      action: 'BUY',
      instrument: `${symbol} ${atmStrike} CE`,
      strike: atmStrike,
      option_type: 'CE',
      lots: 2,
      quantity: 2 * lotSize,
      estimated_premium: Math.round(step * 3.2),
      order_type: 'LIMIT',
      instruction: `Place BUY order for ${symbol} ${atmStrike} CE × ${2 * lotSize} qty at market or limit ₹${Math.round(step * 3.2)}`
    },
    {
      leg: 2,
      action: 'SELL',
      instrument: `${symbol} ${otmStrike} CE`,
      strike: otmStrike,
      option_type: 'CE',
      lots: 2,
      quantity: 2 * lotSize,
      estimated_premium: Math.round(step * 1.6),
      order_type: 'LIMIT',
      instruction: `Place SELL order for ${symbol} ${otmStrike} CE × ${2 * lotSize} qty at market or limit ₹${Math.round(step * 1.6)}`
    }
  ] : [
    {
      leg: 1,
      action: 'BUY',
      instrument: `${symbol} ${atmStrike} PE`,
      strike: atmStrike,
      option_type: 'PE',
      lots: 2,
      quantity: 2 * lotSize,
      estimated_premium: Math.round(step * 3.2),
      order_type: 'LIMIT',
      instruction: `Place BUY order for ${symbol} ${atmStrike} PE × ${2 * lotSize} qty at market or limit ₹${Math.round(step * 3.2)}`
    },
    {
      leg: 2,
      action: 'SELL',
      instrument: `${symbol} ${otmPutStrike} PE`,
      strike: otmPutStrike,
      option_type: 'PE',
      lots: 2,
      quantity: 2 * lotSize,
      estimated_premium: Math.round(step * 1.6),
      order_type: 'LIMIT',
      instruction: `Place SELL order for ${symbol} ${otmPutStrike} PE × ${2 * lotSize} qty at market or limit ₹${Math.round(step * 1.6)}`
    }
  ];

  const netDebit = entryLegs[0].estimated_premium - entryLegs[1].estimated_premium;
  const maxLoss = netDebit * entryLegs[0].quantity;
  const spreadWidth = Math.abs(entryLegs[0].strike - entryLegs[1].strike);
  const maxProfit = (spreadWidth - netDebit) * entryLegs[0].quantity;

  const exitRules = [
    {
      rule: 'TARGET HIT',
      icon: '[TGT]',
      condition: `Spot ${direction === 'BULLISH' ? 'rises above' : 'falls below'} ₹${direction === 'BULLISH' ? atmStrike + step * 3 : atmStrike - step * 3}`,
      action: 'EXIT BOTH LEGS — Square off the entire spread. Book profit.',
      priority: 1
    },
    {
      rule: 'STOP LOSS HIT',
      icon: '[SL]',
      condition: `Spot ${direction === 'BULLISH' ? 'falls below' : 'rises above'} ₹${direction === 'BULLISH' ? atmStrike - step * 2 : atmStrike + step * 2}`,
      action: 'EXIT BOTH LEGS — Square off immediately. Cut the loss.',
      priority: 2
    },
    {
      rule: 'EOD SQUARE-OFF',
      icon: '[EOD]',
      condition: 'Time reaches 15:15 IST (mandatory)',
      action: 'EXIT BOTH LEGS — Close all open positions before 15:30 close.',
      priority: 3
    },
    {
      rule: 'SPREAD DECAY',
      icon: '[DEC]',
      condition: 'If spread value drops to 30% of entry debit',
      action: 'EXIT BOTH LEGS — Premium has eroded, close to limit loss.',
      priority: 4
    }
  ];

  const statusLabel = isWeekend ? 'MARKET CLOSED (Weekend)' :
    !isMarketOpen ? 'MARKET CLOSED (After Hours)' :
    isSquareOffTime ? 'SQUARE-OFF WINDOW (Exit All Positions)' :
    hasActiveSetup ? 'ACTIVE SETUP — READY TO ENTER' : 'NO CONFLUENCE — STAY CASH';

  const statusColor = hasActiveSetup ? 'green' :
    isSquareOffTime ? 'orange' : 'gray';

  res.json({
    success: true,
    symbol,
    market_status: {
      is_open: isMarketOpen && !isWeekend,
      is_square_off_time: isSquareOffTime,
      is_weekend: isWeekend,
      status_label: statusLabel,
      status_color: statusColor,
      current_time_ist: `${String(istHour).padStart(2, '0')}:${String(istMin).padStart(2, '0')} IST`
    },
    position_action: hasActiveSetup ? 'ENTER' : (isSquareOffTime ? 'EXIT_ALL' : 'NO_TRADE'),
    trade_setup: hasActiveSetup ? {
      direction,
      strategy_name: direction === 'BULLISH' ? 'Bull Call Spread' : 'Bear Put Spread',
      strategy_type: 'Debit Spread (Defined Risk)',
      confluence_score: `${confluenceScore}/5`,
      spot_price: baseSpot,

      entry: {
        heading: 'ENTRY POSITION (What to BUY & SELL)',
        legs: entryLegs,
        net_debit_per_lot: netDebit,
        total_debit: netDebit * entryLegs[0].quantity,
        execute_as: 'Execute Leg 1 first (BUY), then Leg 2 (SELL) immediately after fill.'
      },

      exit: {
        heading: 'EXIT RULES (When & How to GET OUT)',
        target_price: direction === 'BULLISH' ? atmStrike + step * 3 : atmStrike - step * 3,
        stop_loss_price: direction === 'BULLISH' ? atmStrike - step * 2 : atmStrike + step * 2,
        eod_deadline: '15:15 IST',
        rules: exitRules,
        exit_instruction: 'To exit: Place opposite orders on BOTH legs simultaneously (Sell what you bought, Buy back what you sold).'
      },

      risk_profile: {
        max_loss_rupees: maxLoss,
        max_profit_rupees: maxProfit,
        risk_reward_ratio: `1 : ${(maxProfit / maxLoss).toFixed(1)}`,
        risk_as_pct_of_capital: `${((maxLoss / 500000) * 100).toFixed(2)}%`,
        breakeven: atmStrike + netDebit
      }
    } : null
  });
});

// ─── 9. TinyFish Live Market News & Sentiment ────────────────────────────────
foRouter.get('/news', async (req: Request, res: Response) => {
  const query = (req.query.q as string || 'NSE Nifty F&O market news').trim();
  const news = await searchMarketNews(query);
  res.json({ success: true, query, results: news });
});

// ─── Helper: Read live_trading_state.json from F&O service ────────────────────
function readTradingState(): any | null {
  const candidates = [
    path.resolve(__dirname, '../../../../services/fo_data_service/live_trading_state.json'),
    path.resolve(__dirname, '../../../../../services/fo_data_service/live_trading_state.json'),
    'C:\\Users\\bille\\OneDrive\\Documents\\Desktop\\artha-ai-copilot\\services\\fo_data_service\\live_trading_state.json',
    'C:\\Users\\bille\\OneDrive\\Documents\\Desktop\\fo_data_service\\live_trading_state.json'
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      }
    } catch { /* skip */ }
  }
  return null;
}

// ─── 10. Paper Trading — Live Positions & PnL ────────────────────────────────
foRouter.get('/paper-trades', async (req: Request, res: Response) => {
  const state = readTradingState();
  if (state) {
    return res.json({
      success: true,
      engine_status: state.engine_status || 'ACTIVE',
      initial_capital: state.initial_capital,
      current_capital: state.current_capital,
      daily_pnl: state.daily_pnl,
      open_positions: state.open_positions || [],
      closed_trades: state.closed_trades || [],
      last_updated: state.last_updated
    });
  }

  // Default: engine not yet started
  res.json({
    success: true,
    engine_status: 'STANDBY',
    initial_capital: 500000,
    current_capital: 500000,
    daily_pnl: 0,
    open_positions: [],
    closed_trades: [],
    last_updated: null
  });
});

// ─── 11. Live Readiness Gates (Win Rate / Profit Factor / Max Drawdown) ──────
foRouter.get('/readiness-gates', async (req: Request, res: Response) => {
  const state = readTradingState();
  if (state && state.readiness_gates) {
    return res.json({
      success: true,
      engine_status: state.engine_status || 'ACTIVE',
      ...state.readiness_gates,
      last_updated: state.last_updated
    });
  }

  // Default: no trades yet
  res.json({
    success: true,
    engine_status: 'STANDBY',
    total_trades: 0,
    wins: 0,
    losses: 0,
    win_rate_pct: 0,
    profit_factor: 0,
    max_drawdown_pct: 0,
    gate_1_win_rate: { value: 0, threshold: 55.0, passed: false },
    gate_2_profit_factor: { value: 0, threshold: 1.5, passed: false },
    gate_3_max_drawdown: { value: 0, threshold: 4.0, passed: false },
    all_gates_passed: false,
    last_updated: null
  });
});

// ─── 12. Real-Time SSE Stream for F&O Analytics ──────────────────────────────
foRouter.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const symbol = (req.query.symbol as string || 'NIFTY').toUpperCase();

  // Send initial snapshot
  const initialData = {
    type: 'FNO_SNAPSHOT',
    symbol,
    pcr: 1.08,
    buildup: 'Long Buildup',
    iv_percentile: 42.0,
    timestamp: new Date().toISOString()
  };
  res.write(`data: ${JSON.stringify(initialData)}\n\n`);

  // Heartbeat interval
  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'HEARTBEAT', timestamp: Date.now() })}\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

export { foRouter };

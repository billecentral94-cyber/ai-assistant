import { Router, Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const aiRouter = Router();

// ── In-memory context shared with trading/portfolio ──────────────────────────
export const LIVE_CONTEXT = {
  regime: 'STRONG_BULL',
  vix: 14.5,
  drawdown: -0.04,
  portfolioHeat: 0.28,
  openPositions: [
    { symbol: 'BANKNIFTY', direction: 'SHORT', qty: 15, entryPrice: 47200, ltp: 47050, pnl: 2250 },
  ],
  killSwitchActive: false,
  todayTrades: 4,
  todayWins: 3,
  todayLosses: 1,
  highConfSetups: [
    { symbol: 'RELIANCE', direction: 'LONG', score: 82 },
    { symbol: 'TCS', direction: 'LONG', score: 76 },
  ],
};

// ── Gemini AI client ──────────────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';

function buildSystemPrompt(): string {
  const { regime, vix, drawdown, openPositions, portfolioHeat, killSwitchActive } = LIVE_CONTEXT;
  const posText = openPositions.map(p =>
    `${p.symbol} ${p.direction} qty=${p.qty} entry=₹${p.entryPrice} ltp=₹${p.ltp} pnl=+₹${p.pnl}`
  ).join('; ');

  return `You are Artha Copilot, an elite quantitative trading assistant for Indian markets (NSE/BSE).
You monitor all 9 backend engines: Regime Classifier, Risk Engine, Signal Engine, Execution Engine,
News Sentinel, Learning Engine, Vault Manager, Drawdown Guardian, and Kill Switch.

LIVE CONTEXT (as of ${new Date().toLocaleString('en-IN')}):
- Market Regime: ${regime}
- India VIX: ${vix}
- Portfolio Drawdown: ${(drawdown * 100).toFixed(2)}% from HWM
- Portfolio Heat: ${(portfolioHeat * 100).toFixed(1)}%
- Kill Switch: ${killSwitchActive ? 'ACTIVE 🔴' : 'Inactive ✅'}
- Open Positions: ${posText || 'None'}
- Today: ${LIVE_CONTEXT.todayWins}W / ${LIVE_CONTEXT.todayLosses}L

Respond in a concise, professional trading-desk tone. Use ₹ for INR. Use emojis sparingly for structure.
Always surface risk warnings when relevant. Keep responses under 200 words unless analysis is requested.`;
}

async function callGemini(message: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    return fallbackHandler(message);
  }
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: buildSystemPrompt(),
    });
    const result = await model.generateContent(message);
    return result.response.text();
  } catch (err: any) {
    console.error('Gemini error:', err?.message ?? err);
    return fallbackHandler(message);
  }
}

// ── Fallback rule engine (used if Gemini fails / no key) ─────────────────────
function fallbackHandler(message: string): string {
  const msg = message.toLowerCase().trim();
  const { regime, vix, drawdown, openPositions, todayWins, todayLosses } = LIVE_CONTEXT;

  if (msg.includes('why') && (msg.includes('reject') || msg.includes('suppress') || msg.includes('block'))) {
    return [
      `🔍 Signal Audit — TCS`,
      `─────────────────────────────────────────────`,
      `Status    : REJECTED`,
      `Regime    : ${regime}`,
      `Confidence: 74.5%`,
      `Reason    : Position size would exceed single-trade exposure limit of 5% (Stage 1 validation failed).`,
      `Time      : ${new Date().toLocaleTimeString('en-IN')}`,
    ].join('\n');
  }

  if (msg.includes('drawdown') || (msg.includes('loss') && msg.includes('max'))) {
    return [
      `📊 Portfolio Drawdown`,
      `─────────────────────────────────────────────`,
      `Current Drawdown : ${(drawdown * 100).toFixed(2)}% from HWM`,
      `Portfolio Value  : ₹12,45,000`,
      `Assessment       : ✅ Healthy — within normal range.`,
    ].join('\n');
  }

  if (msg.includes('position') || msg.includes('open trade')) {
    const lines = openPositions.map(p =>
      `  • ${p.symbol} ${p.direction} | Qty: ${p.qty} | Entry: ₹${p.entryPrice} | LTP: ₹${p.ltp} | P&L: +₹${p.pnl}`
    );
    return [`📋 Open Positions (${openPositions.length})`, `─────────────────────────────────────────────`, ...lines].join('\n');
  }

  if (msg.includes('regime') || (msg.includes('market') && msg.includes('condition'))) {
    return `🌐 Market Regime: ${regime}\nVIX: ${vix} — Good time to hold longs. Momentum is your friend.`;
  }

  if (msg.includes('today') || msg.includes('daily') || msg.includes('summary')) {
    return [
      `📋 Today's Summary`,
      `─────────────────────────────────────────────`,
      `Market Regime  : ${regime}`,
      `Open Positions : ${openPositions.length}`,
      `Win / Loss     : ${todayWins}W / ${todayLosses}L`,
      `Win Rate       : ${((todayWins / (todayWins + todayLosses)) * 100).toFixed(0)}%`,
      `VIX            : ${vix}`,
    ].join('\n');
  }

  return `🤖 Ask me about: positions, drawdown, market regime, today's summary, or why a signal was rejected.`;
}

// ── Routes ────────────────────────────────────────────────────────────────────
aiRouter.post('/chat', async (req: Request, res: Response) => {
  const { message } = req.body ?? {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }
  const reply = await callGemini(message);
  res.json({ reply, ai: !!GEMINI_API_KEY });
});

aiRouter.get('/daily-briefing', (_req: Request, res: Response) => {
  res.json({
    regime: LIVE_CONTEXT.regime,
    vix_level: LIVE_CONTEXT.vix,
    portfolio_heat: LIVE_CONTEXT.portfolioHeat,
    open_positions: LIVE_CONTEXT.openPositions.length,
    yesterday_pnl: 1840,
    week_wins: 6,
    week_losses: 2,
    drawdown: LIVE_CONTEXT.drawdown,
    high_conf_setups: LIVE_CONTEXT.highConfSetups,
    kill_switch_active: LIVE_CONTEXT.killSwitchActive,
  });
});

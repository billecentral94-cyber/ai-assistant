import { Router, Request, Response } from 'express';

export const tradingRouter = Router();

// ── In-Memory Paper Order Book ────────────────────────────────────────────────
export interface PaperOrder {
  id: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  qty: number;
  price: number;
  orderType: 'MARKET' | 'LIMIT';
  status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  riskScore: number;
  rejectionReason?: string;
  createdAt: string;
  filledAt?: string;
  pnl?: number;
}

export const orderBook: PaperOrder[] = [];
let orderCounter = 1000;

// ── Risk Check (Stage 1 Validation) ──────────────────────────────────────────
function validateOrder(symbol: string, qty: number, price: number): { ok: boolean; reason?: string } {
  const orderValue = qty * price;
  const portfolioValue = 1_245_000; // simulated total portfolio

  // Rule 1: Single trade exposure limit 5%
  if (orderValue / portfolioValue > 0.05) {
    return { ok: false, reason: `Order value ₹${orderValue.toLocaleString('en-IN')} exceeds 5% single-trade exposure limit (max ₹${(portfolioValue * 0.05).toLocaleString('en-IN')})` };
  }

  // Rule 2: Max 3 positions in same sector (simplified — block more than 2 same symbol)
  const existingFilled = orderBook.filter(o => o.symbol === symbol && o.status === 'FILLED');
  if (existingFilled.length >= 2) {
    return { ok: false, reason: `Max position concentration reached for ${symbol}` };
  }

  // Rule 3: Block orders during very high VIX
  // (VIX check omitted here — handled by vault allocator)

  return { ok: true };
}

function generateOrderId(): string {
  orderCounter++;
  return `ORD-${Date.now()}-${orderCounter}`;
}

// ── POST /api/trading/orders — Place a paper order ────────────────────────────
tradingRouter.post('/orders', (req: Request, res: Response) => {
  const { symbol, direction, qty, price, orderType = 'MARKET' } = req.body ?? {};

  if (!symbol || !direction || !qty || !price) {
    return res.status(400).json({ error: 'symbol, direction, qty, price are required' });
  }
  if (!['BUY', 'SELL'].includes(direction)) {
    return res.status(400).json({ error: 'direction must be BUY or SELL' });
  }

  const validation = validateOrder(symbol, Number(qty), Number(price));

  const order: PaperOrder = {
    id: generateOrderId(),
    symbol: String(symbol).toUpperCase(),
    direction,
    qty: Number(qty),
    price: Number(price),
    orderType,
    status: validation.ok ? 'FILLED' : 'REJECTED',
    riskScore: Math.round(Math.random() * 40 + 30), // simulated 30–70 score
    rejectionReason: validation.ok ? undefined : validation.reason,
    createdAt: new Date().toISOString(),
    filledAt: validation.ok ? new Date().toISOString() : undefined,
    pnl: validation.ok ? 0 : undefined,
  };

  orderBook.push(order);

  if (!validation.ok) {
    return res.status(422).json({
      orderId: order.id,
      status: 'REJECTED',
      reason: validation.reason,
      order,
    });
  }

  res.status(201).json({
    orderId: order.id,
    status: 'FILLED',
    message: `Paper order filled: ${direction} ${qty} × ${symbol} @ ₹${price}`,
    order,
  });
});

// ── GET /api/trading/orders — List all orders ─────────────────────────────────
tradingRouter.get('/orders', (_req: Request, res: Response) => {
  res.json({
    orders: [...orderBook].reverse(), // newest first
    summary: {
      total: orderBook.length,
      filled: orderBook.filter(o => o.status === 'FILLED').length,
      rejected: orderBook.filter(o => o.status === 'REJECTED').length,
      cancelled: orderBook.filter(o => o.status === 'CANCELLED').length,
    },
  });
});

// ── DELETE /api/trading/orders/:id — Cancel a pending order ───────────────────
tradingRouter.delete('/orders/:id', (req: Request, res: Response) => {
  const idx = orderBook.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Order not found' });

  const order = orderBook[idx];
  if (order.status !== 'PENDING') {
    return res.status(409).json({ error: `Cannot cancel order in status: ${order.status}` });
  }
  order.status = 'CANCELLED';
  res.json({ message: 'Order cancelled', order });
});

import { Router, Request, Response } from 'express';

export const newsRouter = Router();

// ── Live-ish News Feed (rotates based on time) ────────────────────────────────
const NEWS_POOL = [
  { headline: 'RBI keeps repo rate unchanged at 6.5% — markets rally on liquidity assurance', source: 'Economic Times', sentiment: 'positive', symbol: 'NIFTY50', impact: 'HIGH' },
  { headline: 'TCS Q1 FY27 results beat estimates — revenue up 12.4% YoY, deal wins strong', source: 'Moneycontrol', sentiment: 'positive', symbol: 'TCS', impact: 'HIGH' },
  { headline: 'RELIANCE Industries board approves ₹50,000 Cr capex for Jio 5G expansion', source: 'BSE Disclosure', sentiment: 'positive', symbol: 'RELIANCE', impact: 'MEDIUM' },
  { headline: 'India VIX spikes 8% on global uncertainty — traders advised to reduce leverage', source: 'NSE Analytics', sentiment: 'negative', symbol: 'INDIAVIX', impact: 'HIGH' },
  { headline: 'INFY issues cautious FY27 guidance — IT sector sentiment under pressure', source: 'Reuters India', sentiment: 'negative', symbol: 'INFY', impact: 'MEDIUM' },
  { headline: 'FII net buyers of ₹4,200 Cr in equities — DII also positive, broad market up', source: 'SEBI Flow Data', sentiment: 'positive', symbol: 'NIFTY50', impact: 'MEDIUM' },
  { headline: 'HDFCBANK asset quality steady — NPA ratio at 1.24%, analyst upgrades continue', source: 'BQ Prime', sentiment: 'positive', symbol: 'HDFCBANK', impact: 'LOW' },
  { headline: 'Crude oil below $75 — positive for India macro, reduces CAD pressure', source: 'Bloomberg India', sentiment: 'positive', symbol: 'MACRO', impact: 'MEDIUM' },
  { headline: 'Small-cap index correction 3.2% — profit booking after 18-month rally', source: 'Nifty Signals', sentiment: 'negative', symbol: 'SMALLCAP', impact: 'MEDIUM' },
  { headline: 'SEBI tightens F&O margin norms — effective from next expiry cycle', source: 'SEBI Circular', sentiment: 'neutral', symbol: 'FNO', impact: 'HIGH' },
];

const CORPORATE_EVENTS = [
  { symbol: 'RELIANCE', eventType: 'BOARD_MEETING', date: '2026-07-22', description: 'Q1 Results & dividend consideration', blackoutHours: 48, status: 'ACTIVE' },
  { symbol: 'TCS', eventType: 'EARNINGS', date: '2026-07-25', description: 'Q1 FY27 Earnings Release', blackoutHours: 48, status: 'UPCOMING' },
  { symbol: 'INFY', eventType: 'AGM', date: '2026-07-28', description: 'Annual General Meeting FY27', blackoutHours: 24, status: 'UPCOMING' },
  { symbol: 'HDFCBANK', eventType: 'DIVIDEND', date: '2026-07-30', description: 'Dividend record date ₹19/share', blackoutHours: 24, status: 'UPCOMING' },
  { symbol: 'ABC', eventType: 'SEBI_NOTICE', date: '2026-07-30', description: 'SEBI advisory — insider trading probe', blackoutHours: 72, status: 'ACTIVE' },
];

newsRouter.get('/', (_req: Request, res: Response) => {
  // Return slightly different news based on time to simulate rotation
  const offset = Math.floor(Date.now() / 60000) % NEWS_POOL.length;
  const rotated = [...NEWS_POOL.slice(offset), ...NEWS_POOL.slice(0, offset)];

  res.json({
    items: rotated,
    corporateEvents: CORPORATE_EVENTS,
    lastUpdated: new Date().toISOString(),
    totalItems: rotated.length,
  });
});

newsRouter.get('/events', (_req: Request, res: Response) => {
  res.json({ events: CORPORATE_EVENTS });
});

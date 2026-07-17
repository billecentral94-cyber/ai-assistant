import { Router, Request, Response } from 'express';

export const tradingRouter = Router();

// Phase 6 (Risk Engine) and Phase 7 (Execution Engine) exist only as design
// docs / audits in the project — no implementation code. Stubbed for now.

tradingRouter.get('/orders', (_req: Request, res: Response) => {
  res.json({ stub: true, orders: [] });
});

tradingRouter.post('/orders', (req: Request, res: Response) => {
  res.status(501).json({
    stub: true,
    error: 'Execution engine (Phase 7) not implemented yet — order not placed.',
  });
});

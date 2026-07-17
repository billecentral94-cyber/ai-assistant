import { Router, Request, Response } from 'express';

export const aiRouter = Router();

// Phase 10 (AI Copilot + Learning) has no implementation code yet in the
// project — only audit/design docs. This is a stub so the frontend has
// something to talk to; replace with real LearningEngine wiring later.

aiRouter.post('/chat', (req: Request, res: Response) => {
  const { message } = req.body ?? {};
  res.json({
    reply: `[stub] AI Copilot isn't wired up yet — Phase 10 has no implementation code in the project, only design docs. You said: "${message ?? ''}"`,
    confidence: null,
  });
});

aiRouter.get('/daily-briefing', (_req: Request, res: Response) => {
  res.json({
    stub: true,
    message: 'Daily Briefing (Phase 10) not implemented yet.',
  });
});

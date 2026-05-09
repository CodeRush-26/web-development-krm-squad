import { Router } from 'express';

export function createDistressRouter(geminiService) {
  const router = Router();

  router.get('/probe', (_req, res) =>
    res.json({ status: 'distress route active' })
  );

  router.post('/', async (req, res) => {
    try {
      const { shipId, message } = req.body ?? {};
      const result = await geminiService.analyzeDistressMessage(message);
      return res.json({
        ok: true,
        shipId: shipId ?? null,
        ...result,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error.message || 'Failed to process distress message',
      });
    }
  });

  return router;
}

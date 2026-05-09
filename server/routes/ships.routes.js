import { Router } from 'express';

/**
 * @param {{ getFleetPayload: () => unknown[] }} simulator
 */
export function createShipsRouter(simulator) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(simulator.getFleetPayload());
  });

  return router;
}

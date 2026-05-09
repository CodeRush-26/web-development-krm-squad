import { Router } from 'express';

/**
 * @param {{ getFleetPayload: () => unknown[] }} simulator
 */
export function createShipsRouter(simulator) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(simulator.getFleetPayload());
  });

  router.patch('/:shipId/destination', async (req, res) => {
    const { shipId } = req.params;
    const { destination } = req.body ?? {};
    if (!destination) {
      return res.status(400).json({ ok: false, error: 'destination is required' });
    }
    const updated = await simulator.updateShipDestination(shipId, destination);
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'ship not found' });
    }
    return res.json({ ok: true, shipId, destination });
  });

  return router;
}

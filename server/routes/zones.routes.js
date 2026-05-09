import { Router } from 'express';

/**
 * @param {{
 *   getZonesPayload: () => unknown[];
 *   addRestrictedZone: (feature: any) => string;
 * }} simulator
 */
export function createZonesRouter(simulator) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(simulator.getZonesPayload());
  });

  router.post('/', (req, res) => {
    const feature = req.body;
    if (
      !feature ||
      feature.type !== 'Feature' ||
      feature.geometry?.type !== 'Polygon'
    ) {
      res.status(400).json({ error: 'Invalid GeoJSON Polygon Feature.' });
      return;
    }

    const id = simulator.addRestrictedZone(feature);
    res.status(201).json({ id });
  });

  return router;
}

import * as turf from '@turf/turf';
import Ship from '../models/Ship.js';

const TICK_MS = 1000;
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {import('mongoose').Document | object} doc
 */
function docToRamShip(doc) {
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const [lng, lat] = o.location.coordinates;
  return {
    shipId: o.shipId,
    name: o.name,
    lng,
    lat,
    speed: o.speed,
    heading: o.heading,
    destination: o.destination,
    fuel: o.fuel,
    cargo: o.cargo,
    status: o.status,
    _prevStatus: o.status,
  };
}

function ramToPayload(s) {
  return {
    shipId: s.shipId,
    name: s.name,
    position: [s.lat, s.lng],
    speed: s.speed,
    heading: s.heading,
    destination: s.destination,
    fuel: s.fuel,
    cargo: s.cargo,
    status: s.status,
  };
}

/**
 * @param {number} lng
 * @param {number} lat
 * @param {number} headingDeg
 * @param {number} speedKnots
 */
function moveByHeading(lng, lat, headingDeg, speedKnots) {
  const point = turf.point([lng, lat]);
  const distanceNm = speedKnots / 3600;
  const next = turf.destination(point, distanceNm, headingDeg, {
    units: 'nauticalmiles',
  });
  const [nextLng, nextLat] = next.geometry.coordinates;
  return [nextLng, nextLat];
}

export class Simulator {
  /**
   * @param {{
   *   io: import('socket.io').Server;
   *   navigable: import('geojson').Polygon | import('geojson').Feature<import('geojson').Polygon>;
   *   ships: ReturnType<typeof docToRamShip>[];
   * }} params
   */
  constructor({ io, navigable, ships }) {
    this.io = io;
    /** GeoJSON Polygon or Feature<Polygon> for turf.booleanPointInPolygon */
    this.navigable = navigable;
    this.ships = ships;
    /** @type {ReturnType<typeof setInterval> | null} */
    this.intervalId = null;
    this.running = false;
    this.fuelBurnTonsPerKnotHour = num(
      process.env.FUEL_BURN_TONS_PER_KNOT_HOUR,
      2.5
    );
  }

  /** @param {import('mongoose').Document[]} shipDocs */
  static fromDocuments(shipDocs) {
    return shipDocs.map((d) => docToRamShip(d));
  }

  getFleetPayload() {
    return this.ships.map(ramToPayload);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.intervalId = setInterval(() => {
      void this.tick();
    }, TICK_MS);
    void this.tick();
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    this.running = false;
  }

  isNavigable(lng, lat) {
    const pt = turf.point([lng, lat]);
    return turf.booleanPointInPolygon(pt, this.navigable);
  }

  static canMoveStatus(status) {
    return status === 'normal' || status === 'rerouting';
  }

  applyFuelDrain(ship) {
    if (ship.fuel <= 0) {
      ship.fuel = 0;
      if (ship.status !== 'out_of_fuel') ship.status = 'out_of_fuel';
      return;
    }
    const movingCapable = Simulator.canMoveStatus(ship.status);
    const effectiveSpeed = movingCapable ? ship.speed : 0;
    const tonsPerHour = effectiveSpeed * this.fuelBurnTonsPerKnotHour;
    const drain = tonsPerHour / 3600;
    ship.fuel = Math.max(0, ship.fuel - drain);
    if (ship.fuel <= 0) {
      ship.fuel = 0;
      ship.status = 'out_of_fuel';
    }
  }

  async persistShipSubset(list) {
    if (!list.length) return;
    await Promise.all(
      list.map((s) =>
        Ship.updateOne(
          { shipId: s.shipId },
          {
            $set: {
              'location.coordinates': [s.lng, s.lat],
              fuel: s.fuel,
              status: s.status,
              speed: s.speed,
              heading: s.heading,
              destination: s.destination,
            },
          }
        ).exec()
      )
    );
  }

  async tick() {
    try {
      const statusChanged = [];

      for (const ship of this.ships) {
        this.applyFuelDrain(ship);

        if (
          Simulator.canMoveStatus(ship.status) &&
          ship.fuel > 0 &&
          ship.status !== 'out_of_fuel'
        ) {
          const [nLng, nLat] = moveByHeading(
            ship.lng,
            ship.lat,
            ship.heading,
            ship.speed
          );
          const candidate = turf.point([nLng, nLat]);

          if (turf.booleanPointInPolygon(candidate, this.navigable)) {
            ship.lng = nLng;
            ship.lat = nLat;
          } else {
            ship.status = 'blocked';
            ship.speed = 0;
          }
        }

        if (ship.status !== ship._prevStatus) {
          ship._prevStatus = ship.status;
          statusChanged.push(ship);
        }
      }

      this.io.emit('fleet-update', this.getFleetPayload());

      if (statusChanged.length > 0) {
        await this.persistShipSubset(statusChanged);
      }
    } catch (err) {
      console.error('[Simulator] tick failed:', err);
    }
  }
}

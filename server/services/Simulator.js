import * as turf from '@turf/turf';
import axios from 'axios';
import Ship from '../models/Ship.js';

const TICK_MS = 1000;
const WEATHER_REFRESH_MS = 5 * 60 * 1000;
const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=26.0&longitude=55.0&current=wind_speed_10m,wave_height';
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
  const baseSpeed = Number(o.baseSpeed ?? o.speed ?? 0);
  return {
    shipId: o.shipId,
    name: o.name,
    lng,
    lat,
    speed: baseSpeed,
    baseSpeed,
    heading: o.heading,
    destination: o.destination,
    fuel: o.fuel,
    cargo: o.cargo,
    status: o.status,
    envDragKnots: 0,
    _prevStatus: o.status,
  };
}

function ramToPayload(s) {
  return {
    shipId: s.shipId,
    name: s.name,
    position: [s.lat, s.lng],
    speed: s.speed,
    baseSpeed: s.baseSpeed,
    effectiveSpeed: s.speed,
    envDragKnots: s.envDragKnots,
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
    /** @type {ReturnType<typeof setInterval> | null} */
    this.weatherIntervalId = null;
    this.running = false;
    this.fuelBurnTonsPerKnotHour = num(
      process.env.FUEL_BURN_TONS_PER_KNOT_HOUR,
      2.5
    );
    this.globalWeather = {
      wind: 0,
      waves: 0,
      updatedAt: null,
      source: 'open-meteo',
    };
  }

  /** @param {import('mongoose').Document[]} shipDocs */
  static fromDocuments(shipDocs) {
    return shipDocs.map((d) => docToRamShip(d));
  }

  getFleetPayload() {
    return this.ships.map(ramToPayload);
  }

  getWeatherPayload() {
    return {
      wind: this.globalWeather.wind,
      waves: this.globalWeather.waves,
      updatedAt: this.globalWeather.updatedAt,
      source: this.globalWeather.source,
    };
  }

  async refreshWeather() {
    try {
      const { data } = await axios.get(WEATHER_URL, { timeout: 8000 });
      const wind = num(data?.current?.wind_speed_10m, 0);
      const waves = num(data?.current?.wave_height, 0);
      this.globalWeather = {
        wind,
        waves,
        updatedAt: new Date().toISOString(),
        source: 'open-meteo',
      };
    } catch (error) {
      console.error('[Simulator] weather fetch failed:', error.message);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    void this.refreshWeather();
    this.weatherIntervalId = setInterval(() => {
      void this.refreshWeather();
    }, WEATHER_REFRESH_MS);
    this.intervalId = setInterval(() => {
      void this.tick();
    }, TICK_MS);
    void this.tick();
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.weatherIntervalId) clearInterval(this.weatherIntervalId);
    this.intervalId = null;
    this.weatherIntervalId = null;
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
    const movingCapable =
      Simulator.canMoveStatus(ship.status) && ship.speed > 0;
    const windMultiplier = 1 + this.globalWeather.wind * 0.01;
    const baseRate = movingCapable
      ? ship.baseSpeed * this.fuelBurnTonsPerKnotHour
      : 0;
    const drain = (baseRate * windMultiplier) / 3600;
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
        const waveMultiplier = Math.max(0, 1 - this.globalWeather.waves * 0.05);
        const weatherAdjustedSpeed = Math.max(0, ship.baseSpeed * waveMultiplier);
        ship.envDragKnots = Math.max(0, ship.baseSpeed - weatherAdjustedSpeed);
        ship.speed = Simulator.canMoveStatus(ship.status)
          ? weatherAdjustedSpeed
          : 0;

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
            ship.envDragKnots = ship.baseSpeed;
          }
        }

        this.applyFuelDrain(ship);

        if (ship.status !== ship._prevStatus) {
          ship._prevStatus = ship.status;
          statusChanged.push(ship);
        }
      }

      this.io.emit('fleet-update', {
        ships: this.getFleetPayload(),
        weather: this.getWeatherPayload(),
      });

      if (statusChanged.length > 0) {
        await this.persistShipSubset(statusChanged);
      }
    } catch (err) {
      console.error('[Simulator] tick failed:', err);
    }
  }
}

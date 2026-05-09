import * as turf from '@turf/turf';
import axios from 'axios';
import Ship from '../models/Ship.js';

const TICK_MS = 1000;
const WEATHER_REFRESH_MS = 5 * 60 * 1000;
const PROXIMITY_KM = 2;
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

function normalizeHeading(h) {
  const mod = h % 360;
  return mod < 0 ? mod + 360 : mod;
}

export class Simulator {
  /**
   * @param {{
   *   io: import('socket.io').Server;
   *   navigable: import('geojson').Polygon | import('geojson').Feature<import('geojson').Polygon>;
   *   ships: ReturnType<typeof docToRamShip>[];
   *   portsById?: Record<string, { lng: number; lat: number }>;
   * }} params
   */
  constructor({ io, navigable, ships, portsById = {} }) {
    this.io = io;
    this.navigable = navigable;
    this.ships = ships;
    this.portsById = portsById;
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
    /** @type {{ id: string; feature: import('geojson').Feature<import('geojson').Polygon> }[]} */
    this.restrictedZones = [];
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

  getZonesPayload() {
    return this.restrictedZones.map((z) => ({
      id: z.id,
      ...z.feature,
    }));
  }

  addRestrictedZone(feature) {
    const id = `zone-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    this.restrictedZones.push({ id, feature: { ...feature, type: 'Feature' } });
    this.io.emit('zones-updated', this.getZonesPayload());
    return id;
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

  static isHardCritical(status) {
    return (
      status === 'out_of_fuel' ||
      status === 'stranded' ||
      status === 'geofence_breach'
    );
  }

  isNavigable(lng, lat) {
    const pt = turf.point([lng, lat]);
    return turf.booleanPointInPolygon(pt, this.navigable);
  }

  zoneContaining(lng, lat) {
    const pt = turf.point([lng, lat]);
    for (const zone of this.restrictedZones) {
      if (turf.booleanPointInPolygon(pt, zone.feature)) return zone;
    }
    return null;
  }

  isSegmentBlocked(startLng, startLat, endLng, endLat) {
    const seg = turf.lineString([
      [startLng, startLat],
      [endLng, endLat],
    ]);
    const startPt = turf.point([startLng, startLat]);
    const endPt = turf.point([endLng, endLat]);
    for (const zone of this.restrictedZones) {
      const startInside = turf.booleanPointInPolygon(startPt, zone.feature);
      const endInside = turf.booleanPointInPolygon(endPt, zone.feature);
      if (startInside && !endInside) {
        continue;
      }
      if (turf.booleanIntersects(seg, zone.feature)) return true;
    }
    return false;
  }

  static canMoveStatus(status) {
    return (
      status === 'normal' ||
      status === 'rerouting' ||
      status === 'geofence_breach' ||
      status === 'proximity_warning' ||
      status === 'insufficient_fuel'
    );
  }

  applyFuelAndRangeStatus(ship) {
    const moving = ship.speed > 0 && Simulator.canMoveStatus(ship.status);
    let fuelConsumptionPerSec =
      (ship.baseSpeed * this.fuelBurnTonsPerKnotHour) / 3600;
    if (this.globalWeather.wind > 25 || this.globalWeather.waves > 2) {
      fuelConsumptionPerSec *= 1.3;
    }

    if (moving) {
      ship.fuel = Math.max(0, ship.fuel - fuelConsumptionPerSec);
    }

    if (ship.fuel <= 0) {
      ship.fuel = 0;
      ship.speed = 0;
      ship.status = 'out_of_fuel';
      return;
    }

    const port = this.portsById[ship.destination];
    if (!port || !moving || fuelConsumptionPerSec <= 0) return;

    const distanceToDestinationKm = turf.distance(
      turf.point([ship.lng, ship.lat]),
      turf.point([port.lng, port.lat]),
      { units: 'kilometers' }
    );

    const kmPerSec = (ship.speed * 1.852) / 3600;
    if (kmPerSec <= 0) return;
    const fuelPerKm = fuelConsumptionPerSec / kmPerSec;
    if (fuelPerKm <= 0) return;

    const reachableKm = ship.fuel / fuelPerKm;
    if (
      reachableKm < distanceToDestinationKm &&
      !Simulator.isHardCritical(ship.status)
    ) {
      ship.status = 'insufficient_fuel';
    }
  }

  tryMoveShip(ship) {
    if (!Simulator.canMoveStatus(ship.status) || ship.speed <= 0) return;

    const startLng = ship.lng;
    const startLat = ship.lat;
    let headingCandidate = ship.heading;
    const originalHeading = ship.heading;
    let moved = false;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const [nextLng, nextLat] = moveByHeading(
        startLng,
        startLat,
        headingCandidate,
        ship.speed
      );
      const pointBlocked = Boolean(this.zoneContaining(nextLng, nextLat));
      const pathBlocked = this.isSegmentBlocked(
        startLng,
        startLat,
        nextLng,
        nextLat
      );
      const waterBlocked = !this.isNavigable(nextLng, nextLat);

      if (!pointBlocked && !pathBlocked && !waterBlocked) {
        ship.lng = nextLng;
        ship.lat = nextLat;
        ship.heading = normalizeHeading(headingCandidate);
        moved = true;
        break;
      }
      headingCandidate = normalizeHeading(headingCandidate + 45);
    }

    if (!moved) {
      ship.status = 'stranded';
      ship.speed = 0;
    } else if (
      normalizeHeading(originalHeading) !== normalizeHeading(ship.heading) &&
      !Simulator.isHardCritical(ship.status)
    ) {
      ship.status = 'rerouting';
    }
  }

  computeProximityWarnings() {
    /** @type {Set<string>} */
    const warned = new Set();
    for (let i = 0; i < this.ships.length; i += 1) {
      for (let j = i + 1; j < this.ships.length; j += 1) {
        const shipA = this.ships[i];
        const shipB = this.ships[j];
        const dKm = turf.distance(
          turf.point([shipA.lng, shipA.lat]),
          turf.point([shipB.lng, shipB.lat]),
          { units: 'kilometers' }
        );
        if (dKm < PROXIMITY_KM) {
          warned.add(shipA.shipId);
          warned.add(shipB.shipId);
          this.io.emit('proximity', {
            ships: [shipA.shipId, shipB.shipId],
            distanceKm: Number(dKm.toFixed(3)),
          });
          this.io.emit('alert:proximity', {
            ships: [shipA.shipId, shipB.shipId],
            distanceKm: Number(dKm.toFixed(3)),
          });
        }
      }
    }
    return warned;
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
              speed: s.baseSpeed,
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
        const zone = this.zoneContaining(ship.lng, ship.lat);
        if (zone) {
          if (ship.status !== 'geofence_breach') {
            this.io.emit('geofence', { shipId: ship.shipId, zoneId: zone.id });
            this.io.emit('alert:geofence', {
              shipId: ship.shipId,
              zoneId: zone.id,
            });
          }
          ship.status = 'geofence_breach';
        } else if (
          ship.status === 'geofence_breach' ||
          ship.status === 'proximity_warning' ||
          ship.status === 'rerouting'
        ) {
          ship.status = 'normal';
        }

        const waveMultiplier = Math.max(0, 1 - this.globalWeather.waves * 0.05);
        const weatherAdjustedSpeed = Math.max(0, ship.baseSpeed * waveMultiplier);
        ship.envDragKnots = Math.max(0, ship.baseSpeed - weatherAdjustedSpeed);
        ship.speed = Simulator.canMoveStatus(ship.status)
          ? weatherAdjustedSpeed
          : 0;

        this.tryMoveShip(ship);
        this.applyFuelAndRangeStatus(ship);
      }

      const proximityWarnings = this.computeProximityWarnings();
      for (const ship of this.ships) {
        if (
          proximityWarnings.has(ship.shipId) &&
          !Simulator.isHardCritical(ship.status) &&
          ship.status !== 'insufficient_fuel'
        ) {
          ship.status = 'proximity_warning';
        }
        if (
          !proximityWarnings.has(ship.shipId) &&
          ship.status === 'proximity_warning'
        ) {
          ship.status = 'normal';
        }

        if (ship.status !== ship._prevStatus) {
          ship._prevStatus = ship.status;
          statusChanged.push(ship);
        }
      }

      this.io.emit('fleet-update', {
        ships: this.getFleetPayload(),
        weather: this.getWeatherPayload(),
        zones: this.getZonesPayload(),
      });

      if (statusChanged.length > 0) {
        await this.persistShipSubset(statusChanged);
      }
    } catch (err) {
      console.error('[Simulator] tick failed:', err);
    }
  }
}

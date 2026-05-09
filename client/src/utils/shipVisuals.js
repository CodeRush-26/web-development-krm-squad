import L from 'leaflet';

export function isCriticalStatus(status) {
  return (
    status === 'blocked' ||
    status === 'out_of_fuel' ||
    status === 'geofence_breach' ||
    status === 'stranded'
  );
}

export function statusDotClass(status) {
  if (status === 'normal') return 'dot green';
  if (status === 'proximity_warning') return 'dot orange';
  if (isCriticalStatus(status)) return 'dot red';
  return 'dot amber';
}

export function isWeatherDelayed(ship) {
  return ship?.status === 'normal' && ship?.baseSpeed > 0
    ? ship.effectiveSpeed < ship.baseSpeed * 0.7
    : false;
}

export function displayStatus(ship) {
  if (isWeatherDelayed(ship)) return 'weather delayed';
  return ship?.status ?? 'unknown';
}

export function fuelPercent(ship) {
  const maxFuelForBar = 9000;
  return Math.max(0, Math.min(100, (ship.fuel / maxFuelForBar) * 100));
}

export function createShipIcon(heading, status, highlighted, distressPulse = false) {
  const toneClass =
    status === 'proximity_warning'
      ? 'warning'
      : isCriticalStatus(status)
        ? 'alert'
        : 'normal';
  const highlightedClass = highlighted ? 'highlighted' : '';
  const distressPulseClass = distressPulse ? 'distress-pulse' : '';

  return L.divIcon({
    className: 'ship-icon-wrap',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    html: `
      <div class="ship-marker ${toneClass} ${highlightedClass} ${distressPulseClass}">
        <div class="ship-pulse"></div>
        <div class="ship-rotation" style="transform: rotate(${heading}deg)">
          <svg viewBox="0 0 100 100" class="ship-svg" aria-hidden="true">
            <path d="M50 6 L66 30 L63 72 L50 94 L37 72 L34 30 Z"></path>
            <path d="M34 48 L66 48" class="ship-deck"></path>
          </svg>
        </div>
      </div>
    `,
  });
}

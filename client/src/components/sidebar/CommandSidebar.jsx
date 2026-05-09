import { Gauge, Navigation, Radar, Ship as ShipIcon, Waves } from 'lucide-react';
import {
  displayStatus,
  fuelPercent,
  isCriticalStatus,
  isWeatherDelayed,
  statusDotClass,
} from '../../utils/shipVisuals';

export function CommandSidebar({
  ships,
  selectedShipId,
  onSelectShip,
  setHoveredShipId,
  telemetryPulse,
  socketStatus,
}) {
  return (
    <aside className="sidebar rounded-xl">
      <div className="sidebar-header">
        <span className="sidebar-title">
          <Waves size={16} />
          Command Sidebar
        </span>
        <span className="sidebar-right">
          <ShipIcon size={16} /> {ships.length}
        </span>
      </div>

      <ul className="ship-list">
        {ships.map((ship) => (
          <li key={ship.shipId}>
            <button
              type="button"
              className={`ship-btn rounded-xl ${selectedShipId === ship.shipId ? 'active' : ''}`}
              onClick={() => onSelectShip(ship.shipId)}
              onMouseEnter={() => setHoveredShipId(ship.shipId)}
              onMouseLeave={() => {
                if (selectedShipId === ship.shipId) return;
                setHoveredShipId('');
              }}
            >
              <div className="ship-top">
                <span className="ship-name">{ship.name}</span>
                <span
                  className={`status-chip ${isCriticalStatus(ship.status) ? 'critical' : ''} ${isWeatherDelayed(ship) ? 'weather-delayed' : ''}`}
                >
                  <span className={statusDotClass(isWeatherDelayed(ship) ? 'rerouting' : ship.status)} />
                  {displayStatus(ship)}
                </span>
              </div>

              <div className="telemetry-row">
                <span className="telemetry-label">
                  <Navigation size={12} /> Fuel
                </span>
                <span
                  className={`telemetry-value ${telemetryPulse[ship.shipId]?.fuelChanged ? 'telemetry-flash' : ''}`}
                >
                  {ship.fuel.toFixed(1)} t
                </span>
              </div>
              <div className="fuel-track">
                <div
                  className="fuel-fill"
                  style={{ transform: `scaleX(${fuelPercent(ship) / 100})` }}
                />
              </div>

              <div className="telemetry-row">
                <span className="telemetry-label">
                  <Gauge size={12} /> Speed
                </span>
                <span
                  className={`telemetry-value ${telemetryPulse[ship.shipId]?.speedChanged ? 'telemetry-flash' : ''}`}
                >
                  {ship.speed.toFixed(1)} kn
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <div className="sidebar-footer hud-mono">
        <Radar size={13} /> Tactical sync {socketStatus}
      </div>
    </aside>
  );
}

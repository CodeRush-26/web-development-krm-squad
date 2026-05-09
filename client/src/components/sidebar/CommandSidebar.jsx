import { Gauge, Navigation, Radar, Ship as ShipIcon, Waves } from 'lucide-react';
import { motion } from 'framer-motion';
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
  userRole,
  captainShipId,
  onCaptainShipChange,
  distressMessage,
  onDistressChange,
  onSendDistress,
  allShips = ships,
  isMobile,
  onCloseMobile,
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
        {isMobile ? (
          <button type="button" className="tool-btn mobile-only" onClick={onCloseMobile}>
            Close
          </button>
        ) : null}
      </div>
      {userRole === 'captain' ? (
        <div className="captain-controls">
          <label htmlFor="captainShipSelect">Select Your Ship</label>
          <select
            id="captainShipSelect"
            value={captainShipId}
            onChange={(e) => onCaptainShipChange(e.target.value)}
          >
            <option value="">-- choose ship --</option>
            {allShips.map((s) => (
              <option key={s.shipId} value={s.shipId}>
                {s.name} ({s.shipId})
              </option>
            ))}
          </select>
          <label htmlFor="distressSignal">Distress Signal</label>
          <textarea
            id="distressSignal"
            rows={2}
            placeholder="Type distress message..."
            value={distressMessage}
            onChange={(e) => onDistressChange(e.target.value)}
          />
          <button
            type="button"
            className="tool-btn"
            onClick={onSendDistress}
            disabled={!captainShipId || !distressMessage.trim()}
          >
            Analyze Distress
          </button>
        </div>
      ) : null}

      <ul className="ship-list">
        {ships.map((ship) => (
          <motion.li
            key={ship.shipId}
            initial={{ opacity: 0.7 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
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
          </motion.li>
        ))}
      </ul>

      <div className="sidebar-footer hud-mono">
        <Radar size={13} /> Tactical sync {socketStatus}
      </div>
    </aside>
  );
}

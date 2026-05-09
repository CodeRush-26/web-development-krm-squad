import { Wind } from 'lucide-react';

export function TopLeftHud({ socketStatus, shipsCount }) {
  return (
    <div className="hud-panel hud-top-left rounded-xl">
      <div>
        <strong>Fleet Net:</strong> {socketStatus}
      </div>
      <div>
        <strong>Ships:</strong> {shipsCount}
      </div>
    </div>
  );
}

export function TopCenterHud({ utcClock, windSpeed }) {
  const highWinds = Number(windSpeed ?? 0) > 30;
  return (
    <div className="hud-panel hud-top-center rounded-xl">
      <div className="clock-line">UTC {utcClock}</div>
      <div className={`status-line ${highWinds ? 'status-caution' : ''}`}>
        <span className="status-led" />
        {highWinds ? 'CAUTION: HIGH WINDS' : 'System Status: Online'}
      </div>
    </div>
  );
}

export function BottomLeftHud({ cursorCoords }) {
  return (
    <div className="hud-panel hud-bottom-left rounded-xl hud-mono">
      Lat {cursorCoords[0].toFixed(4)} | Lng {cursorCoords[1].toFixed(4)}
    </div>
  );
}

export function BottomCenterHud({ weather }) {
  return (
    <div className="hud-panel hud-bottom-center rounded-xl hud-mono">
      <Wind size={14} /> Wind: {(weather?.wind ?? 0).toFixed(1)} kts | Waves:{' '}
      {(weather?.waves ?? 0).toFixed(2)} m
    </div>
  );
}

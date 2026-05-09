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

export function TopRightUtcHud({ utcClock }) {
  return (
    <div className="hud-panel hud-utc-card rounded-xl hud-mono" aria-live="polite">
      <div className="utc-card-label">
        <strong>UTC</strong>
      </div>
      <div className="utc-card-time">{utcClock}</div>
    </div>
  );
}

export function TopCenterHud({ windSpeed }) {
  const highWinds = Number(windSpeed ?? 0) > 30;
  return (
    <div className="hud-panel hud-top-center rounded-xl">
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
  const syncIso = weather?.lastSuccessfulSync || weather?.updatedAt;
  const lastSyncLabel = syncIso ? new Date(syncIso).toLocaleTimeString() : 'never';
  return (
    <div className="hud-panel hud-bottom-center rounded-xl hud-mono">
      <Wind size={14} /> Wind: {(weather?.wind ?? 0).toFixed(1)} kts | Waves:{' '}
      {(weather?.waves ?? 0).toFixed(2)} m | Last Sync: {lastSyncLabel}
    </div>
  );
}

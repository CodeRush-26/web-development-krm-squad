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

export function TopCenterHud({ utcClock }) {
  return (
    <div className="hud-panel hud-top-center rounded-xl">
      <div className="clock-line">UTC {utcClock}</div>
      <div className="status-line">
        <span className="status-led" />
        System Status: Online
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

export function BottomCenterHud() {
  return (
    <div className="hud-panel hud-bottom-center rounded-xl hud-mono">
      <Wind size={14} /> Wind: -- kts | Waves: -- m
    </div>
  );
}

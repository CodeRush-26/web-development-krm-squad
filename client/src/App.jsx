import { useEffect, useMemo, useRef, useState } from 'react';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';
import { API_URL, MAP_CENTER, MAP_ZOOM } from './constants/fleet';
import { useInterpolatedFleet } from './hooks/useInterpolatedFleet';
import { useTelemetryPulse } from './hooks/useTelemetryPulse';
import { utcClockString } from './utils/time';
import { ShipMarker } from './components/map/ShipMarker';
import { MapFocusController } from './components/map/MapFocusController';
import { CursorHudController } from './components/map/CursorHudController';
import {
  BottomCenterHud,
  BottomLeftHud,
  TopCenterHud,
  TopLeftHud,
} from './components/hud/HudPanels';
import { CommandSidebar } from './components/sidebar/CommandSidebar';

export default function App() {
  const { ships, socketStatus } = useInterpolatedFleet();
  const telemetryPulse = useTelemetryPulse(ships);

  const [selectedShipId, setSelectedShipId] = useState('');
  const [hoveredShipId, setHoveredShipId] = useState('');
  const [navigableWater, setNavigableWater] = useState(null);
  const [cursorCoords, setCursorCoords] = useState(MAP_CENTER);
  const [utcClock, setUtcClock] = useState(utcClockString());

  const markerRefs = useRef({});

  useEffect(() => {
    const timer = setInterval(() => setUtcClock(utcClockString()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_URL}/api/navigable-water`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setNavigableWater(data);
      })
      .catch((err) => {
        console.error('Failed to load navigable water:', err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedShip = useMemo(
    () => ships.find((s) => s.shipId === selectedShipId) || null,
    [selectedShipId, ships]
  );

  return (
    <div className="layout">
      <div className="map-wrap">
        <TopLeftHud socketStatus={socketStatus} shipsCount={ships.length} />
        <TopCenterHud utcClock={utcClock} />
        <BottomLeftHud cursorCoords={cursorCoords} />
        <BottomCenterHud />

        <MapContainer className="fleet-map" center={MAP_CENTER} zoom={MAP_ZOOM}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CartoDB'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />

          {navigableWater ? (
            <GeoJSON
              data={navigableWater}
              style={{
                color: '#38bdf8',
                weight: 1.4,
                fillColor: '#0ea5e9',
                fillOpacity: 0.14,
              }}
            />
          ) : null}

          {ships.map((ship) => (
            <ShipMarker
              key={ship.shipId}
              ship={ship}
              markerRefs={markerRefs}
              highlighted={hoveredShipId === ship.shipId}
            />
          ))}

          <MapFocusController selectedShip={selectedShip} markerRefs={markerRefs} />
          <CursorHudController onMove={setCursorCoords} />
        </MapContainer>
      </div>

      <CommandSidebar
        ships={ships}
        selectedShipId={selectedShipId}
        setSelectedShipId={setSelectedShipId}
        setHoveredShipId={setHoveredShipId}
        telemetryPulse={telemetryPulse}
        socketStatus={socketStatus}
      />
    </div>
  );
}

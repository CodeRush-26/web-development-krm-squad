import { useEffect, useMemo, useRef, useState } from 'react';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';
import { Compass, LocateFixed, Orbit } from 'lucide-react';
import { API_URL, MAP_CENTER, MAP_ZOOM } from './constants/fleet';
import { useInterpolatedFleet } from './hooks/useInterpolatedFleet';
import { useTelemetryPulse } from './hooks/useTelemetryPulse';
import { utcClockString } from './utils/time';
import { ShipMarker } from './components/map/ShipMarker';
import { MapFocusController } from './components/map/MapFocusController';
import { CursorHudController } from './components/map/CursorHudController';
import { MapActionsController } from './components/map/MapActionsController';
import {
  BottomCenterHud,
  BottomLeftHud,
  TopCenterHud,
  TopLeftHud,
} from './components/hud/HudPanels';
import { CommandSidebar } from './components/sidebar/CommandSidebar';

export default function App() {
  const { ships, socketStatus, weather } = useInterpolatedFleet();
  const telemetryPulse = useTelemetryPulse(ships);

  const [selectedShipId, setSelectedShipId] = useState('');
  const [hoveredShipId, setHoveredShipId] = useState('');
  const [navigableWater, setNavigableWater] = useState(null);
  const [cursorCoords, setCursorCoords] = useState(MAP_CENTER);
  const [utcClock, setUtcClock] = useState(utcClockString());
  const [followSelected, setFollowSelected] = useState(false);

  const markerRefs = useRef({});
  const mapRef = useRef(null);

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

  const maxBounds = useMemo(() => {
    const box = navigableWater?.properties?.boundingBox;
    if (!box) return undefined;
    return [
      [box.south, box.west],
      [box.north, box.east],
    ];
  }, [navigableWater]);

  function goHomeView() {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo(MAP_CENTER, MAP_ZOOM, { animate: true, duration: 1.1 });
  }

  function fitFleetView() {
    const map = mapRef.current;
    if (!map || ships.length === 0) return;
    map.fitBounds(ships.map((ship) => ship.position), {
      animate: true,
      duration: 1.1,
      padding: [35, 35],
    });
  }

  function fitZoneView() {
    const map = mapRef.current;
    if (!map || !navigableWater?.geometry?.coordinates?.[0]) return;
    const latLngs = navigableWater.geometry.coordinates[0].map(([lng, lat]) => [
      lat,
      lng,
    ]);
    map.fitBounds(latLngs, {
      animate: true,
      duration: 1.1,
      padding: [30, 30],
    });
  }

  return (
    <div className="layout">
      <div className="map-wrap">
        <TopLeftHud socketStatus={socketStatus} shipsCount={ships.length} />
        <TopCenterHud utcClock={utcClock} windSpeed={weather.wind} />
        <BottomLeftHud cursorCoords={cursorCoords} />
        <BottomCenterHud weather={weather} />
        <div className="hud-panel hud-top-right rounded-xl map-tools">
          <button
            type="button"
            className="tool-btn"
            onClick={goHomeView}
            disabled={!mapRef.current}
          >
            <Compass size={14} />
            Home
          </button>
          <button
            type="button"
            className="tool-btn"
            onClick={fitFleetView}
            disabled={!mapRef.current || ships.length === 0}
          >
            <LocateFixed size={14} />
            Fit Fleet
          </button>
          <button
            type="button"
            className="tool-btn"
            onClick={fitZoneView}
            disabled={!mapRef.current || !navigableWater}
          >
            <Orbit size={14} />
            Fit Zone
          </button>
          <button
            type="button"
            className={`tool-btn ${followSelected ? 'active' : ''}`}
            onClick={() => setFollowSelected((v) => !v)}
          >
            Follow Selected
          </button>
        </div>

        <MapContainer
          className="fleet-map"
          center={MAP_CENTER}
          zoom={MAP_ZOOM}
          minZoom={6}
          maxZoom={11}
          maxBounds={maxBounds}
          maxBoundsViscosity={0.9}
        >
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

          <MapFocusController
            selectedShip={selectedShip}
            markerRefs={markerRefs}
            followSelected={followSelected}
          />
          <MapActionsController
            onReady={(map) => {
              mapRef.current = map;
            }}
          />
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

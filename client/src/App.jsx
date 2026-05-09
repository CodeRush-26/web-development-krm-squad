import { useEffect, useMemo, useRef, useState } from 'react';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';
import { Compass, LocateFixed, Orbit } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import { API_URL, MAP_CENTER, MAP_ZOOM } from './constants/fleet';
import { useInterpolatedFleet } from './hooks/useInterpolatedFleet';
import { useTelemetryPulse } from './hooks/useTelemetryPulse';
import { utcClockString } from './utils/time';
import { ShipMarker } from './components/map/ShipMarker';
import { MapFocusController } from './components/map/MapFocusController';
import { CursorHudController } from './components/map/CursorHudController';
import { MapActionsController } from './components/map/MapActionsController';
import { DrawZonesController } from './components/map/DrawZonesController';
import {
  BottomCenterHud,
  BottomLeftHud,
  TopCenterHud,
  TopLeftHud,
} from './components/hud/HudPanels';
import { CommandSidebar } from './components/sidebar/CommandSidebar';

export default function App() {
  const { ships, socketStatus, weather, zones, alerts } = useInterpolatedFleet();
  const telemetryPulse = useTelemetryPulse(ships);

  const [userRole, setUserRole] = useState('command');
  const [captainShipId, setCaptainShipId] = useState('');
  const [distressMessage, setDistressMessage] = useState('');
  const [selectedShipId, setSelectedShipId] = useState('');
  const [hoveredShipId, setHoveredShipId] = useState('');
  const [navigableWater, setNavigableWater] = useState(null);
  const [cursorCoords, setCursorCoords] = useState(MAP_CENTER);
  const [utcClock, setUtcClock] = useState(utcClockString());
  const [followSelected, setFollowSelected] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);

  const markerRefs = useRef({});
  const mapRef = useRef(null);
  const lastAlertAtRef = useRef(0);
  const beepRef = useRef(null);

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
  const visibleShips = useMemo(() => {
    if (userRole === 'captain') {
      if (!captainShipId) return [];
      return ships.filter((s) => s.shipId === captainShipId);
    }
    return ships;
  }, [captainShipId, ships, userRole]);

  useEffect(() => {
    if (userRole === 'captain' && captainShipId) {
      handleSelectShip(captainShipId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captainShipId, userRole]);

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

  function handleSelectShip(shipId) {
    setSelectedShipId(shipId);
    setHoveredShipId(shipId);
    setFocusNonce((n) => n + 1);
  }

  async function handleCreateZone(feature) {
    try {
      await fetch(`${API_URL}/api/zones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feature),
      });
      toast.success('Restricted zone added');
    } catch (error) {
      toast.error('Failed to add zone');
    }
  }

  useEffect(() => {
    if (!alerts.length) return;
    const latest = alerts[alerts.length - 1];
    if (!latest || latest.at <= lastAlertAtRef.current) return;
    lastAlertAtRef.current = latest.at;

    if (latest.type === 'proximity') {
      toast.error(
        `Proximity alert: ${latest.payload.ships?.[0]} & ${latest.payload.ships?.[1]}`
      );
    } else if (latest.type === 'geofence') {
      toast.error(`Geofence breach: ${latest.payload.shipId}`);
    }
    if (beepRef.current) {
      beepRef.current.currentTime = 0;
      beepRef.current.play().catch(() => {});
    }
  }, [alerts]);

  return (
    <div className="layout">
      <Toaster position="top-center" />
      <audio
        ref={beepRef}
        preload="auto"
        src="data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YRAAAAAA////AAAA////AAAA"
      />
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
          <div className="role-toggle">
            <button
              type="button"
              className={`tool-btn ${userRole === 'command' ? 'active' : ''}`}
              onClick={() => setUserRole('command')}
            >
              COMMAND
            </button>
            <button
              type="button"
              className={`tool-btn ${userRole === 'captain' ? 'active' : ''}`}
              onClick={() => setUserRole('captain')}
            >
              CAPTAIN
            </button>
          </div>
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

          {visibleShips.map((ship) => (
            <ShipMarker
              key={ship.shipId}
              ship={ship}
              markerRefs={markerRefs}
              highlighted={hoveredShipId === ship.shipId}
              onSelectShip={handleSelectShip}
            />
          ))}

          <DrawZonesController
            userRole={userRole}
            zones={zones}
            onCreateZone={handleCreateZone}
          />
          <MapFocusController
            selectedShip={selectedShip}
            markerRefs={markerRefs}
            followSelected={followSelected}
            focusNonce={focusNonce}
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
        ships={visibleShips}
        allShips={ships}
        selectedShipId={selectedShipId}
        onSelectShip={handleSelectShip}
        setHoveredShipId={setHoveredShipId}
        telemetryPulse={telemetryPulse}
        socketStatus={socketStatus}
        userRole={userRole}
        captainShipId={captainShipId}
        onCaptainShipChange={setCaptainShipId}
        distressMessage={distressMessage}
        onDistressChange={setDistressMessage}
      />
    </div>
  );
}

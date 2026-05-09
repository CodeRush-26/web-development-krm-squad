import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

export function MapFocusController({ selectedShip, markerRefs, followSelected }) {
  const map = useMap();
  const prevShipIdRef = useRef('');

  useEffect(() => {
    if (!selectedShip) return;
    const shipChanged = prevShipIdRef.current !== selectedShip.shipId;
    prevShipIdRef.current = selectedShip.shipId;

    if (!shipChanged && !followSelected) return;

    if (followSelected) {
      map.panTo(selectedShip.position, { animate: true, duration: 0.7 });
    } else {
      map.flyTo(selectedShip.position, Math.max(map.getZoom(), 8), {
        animate: true,
        duration: 1.5,
      });
    }

    const marker = markerRefs.current[selectedShip.shipId];
    if (marker) marker.openPopup();
  }, [followSelected, map, markerRefs, selectedShip]);

  return null;
}

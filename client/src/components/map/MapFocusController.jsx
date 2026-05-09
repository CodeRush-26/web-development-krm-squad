import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

export function MapFocusController({
  selectedShip,
  markerRefs,
  followSelected,
  focusNonce,
}) {
  const map = useMap();
  const prevShipIdRef = useRef('');
  const prevFocusNonceRef = useRef(0);

  useEffect(() => {
    if (!selectedShip) return;
    const shipChanged = prevShipIdRef.current !== selectedShip.shipId;
    const focusRequested = prevFocusNonceRef.current !== focusNonce;
    prevShipIdRef.current = selectedShip.shipId;
    prevFocusNonceRef.current = focusNonce;

    if (!shipChanged && !followSelected && !focusRequested) return;

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

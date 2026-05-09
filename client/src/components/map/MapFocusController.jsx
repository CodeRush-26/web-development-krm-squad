import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

export function MapFocusController({ selectedShip, markerRefs }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedShip) return;

    map.flyTo(selectedShip.position, Math.max(map.getZoom(), 8), {
      animate: true,
      duration: 1.5,
    });

    const marker = markerRefs.current[selectedShip.shipId];
    if (marker) marker.openPopup();
  }, [map, markerRefs, selectedShip]);

  return null;
}

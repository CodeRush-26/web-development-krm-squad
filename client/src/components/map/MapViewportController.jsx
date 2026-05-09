import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Keeps Leaflet rendering stable when responsive layout changes
 * (sidebar drawer open/close, viewport switches).
 */
export function MapViewportController({ sidebarOpen, isMobile }) {
  const map = useMap();

  useEffect(() => {
    const t = setTimeout(() => {
      map.invalidateSize({ pan: false, animate: false });
    }, 240);
    return () => clearTimeout(t);
  }, [isMobile, map, sidebarOpen]);

  useEffect(() => {
    const onResize = () => map.invalidateSize({ pan: false, animate: false });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [map]);

  return null;
}

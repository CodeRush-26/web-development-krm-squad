import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL, TICK_MS } from '../constants/fleet';

export function useInterpolatedFleet() {
  const [socketStatus, setSocketStatus] = useState('connecting');
  const [ships, setShips] = useState([]);
  const framesRef = useRef({});
  const rafRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    function renderFrame(now) {
      const next = Object.values(framesRef.current).map((entry) => {
        const t = Math.max(0, Math.min(1, (now - entry.startedAt) / TICK_MS));
        return {
          ...entry.base,
          position: [
            entry.startLat + (entry.targetLat - entry.startLat) * t,
            entry.startLng + (entry.targetLng - entry.startLng) * t,
          ],
        };
      });

      if (mounted) setShips(next.sort((a, b) => a.shipId.localeCompare(b.shipId)));
      rafRef.current = requestAnimationFrame(renderFrame);
    }

    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => setSocketStatus('connected'));
    socket.on('disconnect', () => setSocketStatus('disconnected'));
    socket.on('fleet-update', (fleet) => {
      if (!Array.isArray(fleet)) return;
      const now = performance.now();

      for (const incoming of fleet) {
        const prev = framesRef.current[incoming.shipId];
        const progress = prev
          ? Math.max(0, Math.min(1, (now - prev.startedAt) / TICK_MS))
          : 1;

        const startLat = prev
          ? prev.startLat + (prev.targetLat - prev.startLat) * progress
          : incoming.position[0];
        const startLng = prev
          ? prev.startLng + (prev.targetLng - prev.startLng) * progress
          : incoming.position[1];

        framesRef.current[incoming.shipId] = {
          base: incoming,
          startLat,
          startLng,
          targetLat: incoming.position[0],
          targetLng: incoming.position[1],
          startedAt: now,
        };
      }
    });

    rafRef.current = requestAnimationFrame(renderFrame);
    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      socket.disconnect();
    };
  }, []);

  return { ships, socketStatus };
}

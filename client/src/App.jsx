import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://127.0.0.1:5050';

export default function App() {
  const [ships, setShips] = useState([]);
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => setStatus('connected'));
    socket.on('disconnect', () => setStatus('disconnected'));
    socket.on('fleet-update', (fleet) => {
      setShips(Array.isArray(fleet) ? fleet : []);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui', padding: '1rem' }}>
      <h1>Fleet (MERN scaffold)</h1>
      <p>
        Socket: <strong>{status}</strong> — updates via <code>fleet-update</code> (1 Hz)
      </p>
      <p>Ships on wire: {ships.length}</p>
      <ul>
        {ships.map((s) => (
          <li key={s.shipId}>
            {s.shipId} {s.name} — pos [{s.position?.[0]?.toFixed(4)},{' '}
            {s.position?.[1]?.toFixed(4)}], {s.speed} kn @ {s.heading}°
          </li>
        ))}
      </ul>
    </div>
  );
}

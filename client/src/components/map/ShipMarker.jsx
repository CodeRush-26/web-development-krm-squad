import { memo, useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { createShipIcon } from '../../utils/shipVisuals';

export const ShipMarker = memo(function ShipMarker({
  ship,
  markerRefs,
  highlighted,
}) {
  const icon = useMemo(
    () => createShipIcon(ship.heading, ship.status, highlighted),
    [ship.heading, ship.status, highlighted]
  );

  return (
    <Marker
      ref={(node) => {
        if (node) markerRefs.current[ship.shipId] = node;
      }}
      position={ship.position}
      icon={icon}
    >
      <Popup>
        <strong>{ship.name}</strong>
        <br />
        Status: {ship.status}
        <br />
        Speed: {ship.speed} kn
        <br />
        Fuel: {ship.fuel.toFixed(1)} t
        <br />
        Destination: {ship.destination}
        <br />
        Cargo: {ship.cargo}
      </Popup>
    </Marker>
  );
});

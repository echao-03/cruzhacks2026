import { useCallback, useState } from 'react';
import DriverRouteMap from './DriverRouteMap';
import { useDriverBookingUpdates } from './hooks/useDriverBookingUpdates';

function DriverNavigationPage({
  tripId,
  driverStart,
  destination,
  initialWaypoints = [],
  onToast,
}) {
  const [waypoints, setWaypoints] = useState(initialWaypoints);

  const handleNewWaypoint = useCallback((waypoint) => {
    setWaypoints((prev) => {
      const exists = prev.some(
        (item) =>
          item.location.lat === waypoint.location.lat &&
          item.location.lng === waypoint.location.lng
      );

      if (exists) {
        return prev;
      }

      return [...prev, waypoint];
    });
  }, []);

  useDriverBookingUpdates({
    tripId,
    onNewWaypoint: handleNewWaypoint,
    onToast,
  });

  return (
    <DriverRouteMap
      driverStart={driverStart}
      destination={destination}
      waypoints={waypoints}
    />
  );
}

export default DriverNavigationPage;

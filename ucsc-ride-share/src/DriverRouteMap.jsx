import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GoogleMap,
  DirectionsService,
  DirectionsRenderer,
} from '@react-google-maps/api';

const defaultMapContainerStyle = {
  width: '100%',
  height: '400px',
};

function DriverRouteMap({
  driverStart,
  destination,
  bookings,
  waypoints,
  mapContainerStyle = defaultMapContainerStyle,
  directionsPanel,
  directionsResponse,
  routeIndex = 0,
  useDirectionsService = true,
}) {
  const [directions, setDirections] = useState(null);

  const resolvedWaypoints = useMemo(() => {
    if (waypoints && waypoints.length > 0) {
      return waypoints;
    }

    return (bookings || []).map((booking) => ({
      location: {
        lat: booking.pickup_lat,
        lng: booking.pickup_lng,
      },
      stopover: true,
    }));
  }, [bookings, waypoints]);

  const directionsOptions = useMemo(
    () => ({
      origin: driverStart,
      destination,
      waypoints: resolvedWaypoints,
      travelMode: 'DRIVING',
    }),
    [driverStart, destination, resolvedWaypoints]
  );

  useEffect(() => {
    setDirections(null);
  }, [directionsOptions]);

  const directionsCallback = useCallback((response) => {
    if (!response) {
      return;
    }

    if (response.status === 'OK') {
      setDirections(response);
    } else {
      console.warn('Directions request failed due to', response.status);
    }
  }, []);

  const mapCenter = driverStart || destination;
  const rendererOptions = useMemo(
    () => (directionsPanel ? { panel: directionsPanel } : undefined),
    [directionsPanel]
  );

  if (!mapCenter) {
    return null;
  }

  return (
    <GoogleMap mapContainerStyle={mapContainerStyle} center={mapCenter} zoom={13}>
      {useDirectionsService && !directionsResponse && driverStart && destination && (
        <DirectionsService
          options={directionsOptions}
          callback={directionsCallback}
        />
      )}
      {(directionsResponse || directions) && (
        <DirectionsRenderer
          directions={directionsResponse || directions}
          options={{ ...rendererOptions, routeIndex }}
        />
      )}
    </GoogleMap>
  );
}

export default DriverRouteMap;

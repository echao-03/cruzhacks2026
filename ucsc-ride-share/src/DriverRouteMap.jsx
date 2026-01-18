import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GoogleMap,
  DirectionsService,
  DirectionsRenderer,
  Polyline,
  Marker,
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
  routePolyline,
  stops,
  mapContainerStyle = defaultMapContainerStyle,
  directionsPanel,
  directionsResponse,
  routeIndex = 0,
  useDirectionsService = true,
  defaultCenter,
}) {
  const [directions, setDirections] = useState(null);

  const decodedPath = useMemo(() => {
    if (
      !routePolyline ||
      !window.google?.maps?.geometry?.encoding?.decodePath
    ) {
      return [];
    }

    const path = window.google.maps.geometry.encoding.decodePath(routePolyline);
    return path.map((point) => ({
      lat: point.lat(),
      lng: point.lng(),
    }));
  }, [routePolyline]);

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

  const mapCenter =
    driverStart ||
    decodedPath[0] ||
    destination ||
    defaultCenter ||
    { lat: 0, lng: 0 };
  const rendererOptions = useMemo(
    () => (directionsPanel ? { panel: directionsPanel } : undefined),
    [directionsPanel]
  );

  return (
    <GoogleMap mapContainerStyle={mapContainerStyle} center={mapCenter} zoom={13}>
      {decodedPath.length > 0 && (
        <Polyline
          key={`route-${routePolyline}`}
          path={decodedPath}
          options={{ strokeColor: '#1e66ff', strokeOpacity: 1, strokeWeight: 4 }}
        />
      )}
      {driverStart && <Marker position={driverStart} />}
      {destination && <Marker position={destination} />}
      {(stops || []).map((stop, index) => (
        <Marker
          key={`${stop.lat}-${stop.lng}-${index}`}
          position={stop}
          label={`${index + 1}`}
        />
      ))}
      {!routePolyline &&
        useDirectionsService &&
        !directionsResponse &&
        driverStart &&
        destination && (
          <DirectionsService
            options={directionsOptions}
            callback={directionsCallback}
          />
        )}
      {!routePolyline && (directionsResponse || directions) && (
        <DirectionsRenderer
          directions={directionsResponse || directions}
          options={{ ...rendererOptions, routeIndex }}
        />
      )}
    </GoogleMap>
  );
}

export default DriverRouteMap;

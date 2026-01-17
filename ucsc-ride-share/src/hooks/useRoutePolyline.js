import { useEffect, useState } from 'react';

function useRoutePolyline({ origin, destination, waypoints }) {
  const [polyline, setPolyline] = useState('');

  useEffect(() => {
    if (!window.google?.maps?.DirectionsService || !origin || !destination) {
      return;
    }

    const service = new window.google.maps.DirectionsService();
    service.route(
      {
        origin,
        destination,
        waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK') {
          const points = result?.routes?.[0]?.overview_polyline?.points ?? '';
          setPolyline(points);
        }
      }
    );
  }, [origin, destination, waypoints]);

  return polyline;
}

export { useRoutePolyline };

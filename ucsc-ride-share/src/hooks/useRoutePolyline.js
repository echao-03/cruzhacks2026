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
          const route = result?.routes?.[0];
          let points = '';

          if (typeof route?.overview_polyline === 'string') {
            points = route.overview_polyline;
          } else if (typeof route?.overview_polyline?.points === 'string') {
            points = route.overview_polyline.points;
          }

          if (
            !points &&
            route?.overview_path &&
            window.google?.maps?.geometry?.encoding?.encodePath
          ) {
            points = window.google.maps.geometry.encoding.encodePath(
              route.overview_path
            );
          }

          setPolyline(points);
        }
      }
    );
  }, [origin, destination, waypoints]);

  return polyline;
}

export { useRoutePolyline };

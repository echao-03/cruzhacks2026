import { useMemo } from 'react';
import { GoogleMap, Marker, Polyline, InfoWindow } from '@react-google-maps/api';
import bananaSlug from './static/banananslug.png';
import bananaFishSlug from './static/bananafiishslug.png';

const defaultMapContainerStyle = {
  width: '100%',
  height: '400px',
};

const routePolylineOptions = {
  strokeColor: '#1e66ff',
  strokeOpacity: 1,
  strokeWeight: 4,
};

const walkingPolylineOptions = {
  strokeOpacity: 0,
  strokeWeight: 3,
  icons: [
    {
      icon: {
        path: 'M 0,-1 0,1',
        strokeOpacity: 1,
        scale: 4,
        strokeColor: '#16a34a',
      },
      offset: '0',
      repeat: '12px',
    },
  ],
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getClosestPointOnSegment = (point, start, end) => {
  const dx = end.lat - start.lat;
  const dy = end.lng - start.lng;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return start;
  }

  const t =
    ((point.lat - start.lat) * dx + (point.lng - start.lng) * dy) /
    lengthSquared;
  const clampedT = clamp(t, 0, 1);

  return {
    lat: start.lat + clampedT * dx,
    lng: start.lng + clampedT * dy,
  };
};

const getSquaredDistance = (a, b) => {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return dLat * dLat + dLng * dLng;
};

const getClosestPointOnPath = (point, path) => {
  if (!point || !path || path.length === 0) {
    return null;
  }

  let closestPoint = path[0];
  let minDistance = getSquaredDistance(point, closestPoint);

  for (let i = 0; i < path.length - 1; i += 1) {
    const candidate = getClosestPointOnSegment(point, path[i], path[i + 1]);
    const distance = getSquaredDistance(point, candidate);

    if (distance < minDistance) {
      minDistance = distance;
      closestPoint = candidate;
    }
  }

  return closestPoint;
};

function RiderSelectionMap({
  riderLocation,
  tripPolyline,
  meetingPoint,
  meetingEtaText,
  defaultCenter,
  mapContainerStyle = defaultMapContainerStyle,
}) {
  const decodedPath = useMemo(() => {
    if (
      !tripPolyline ||
      !window.google?.maps?.geometry?.encoding?.decodePath
    ) {
      return [];
    }

    const path = window.google.maps.geometry.encoding.decodePath(tripPolyline);
    return path.map((point) => ({
      lat: point.lat(),
      lng: point.lng(),
    }));
  }, [tripPolyline]);

  const nearestPoint = useMemo(() => {
    if (meetingPoint) {
      return meetingPoint;
    }
    return getClosestPointOnPath(riderLocation, decodedPath);
  }, [meetingPoint, riderLocation, decodedPath]);

  const iconSet = useMemo(() => {
    if (!window.google?.maps) {
      return { start: undefined, end: undefined };
    }

    const size = 44;
    return {
      start: {
        url: bananaSlug,
        scaledSize: new window.google.maps.Size(size, size),
        anchor: new window.google.maps.Point(size / 2, size),
      },
      end: {
        url: bananaFishSlug,
        scaledSize: new window.google.maps.Size(size, size),
        anchor: new window.google.maps.Point(size / 2, size),
      },
    };
  }, []);

  const mapCenter =
    riderLocation ||
    decodedPath[0] ||
    nearestPoint ||
    defaultCenter ||
    { lat: 0, lng: 0 };

  const routeStart = decodedPath[0];
  const routeEnd = decodedPath[decodedPath.length - 1];

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={mapCenter}
      zoom={14}
    >
      {decodedPath.length > 0 && (
        <Polyline
          key={`route-${tripPolyline}`}
          path={decodedPath}
          options={routePolylineOptions}
        />
      )}

      {riderLocation && (
        <Marker
          position={riderLocation}
          icon={iconSet.start}
        />
      )}

      {routeStart && (
        <Marker position={routeStart} icon={iconSet.start} />
      )}

      {routeEnd && (
        <Marker position={routeEnd} icon={iconSet.end} />
      )}

      {nearestPoint && (
        <>
          <Marker
            position={nearestPoint}
            icon={iconSet.start}
          />
          <InfoWindow position={nearestPoint}>
            <div>
              <div className="font-semibold text-[#2f2a25]">Meet here</div>
              {meetingEtaText && (
                <div className="text-xs text-[#52463b]">
                  Driver ETA: {meetingEtaText}
                </div>
              )}
            </div>
          </InfoWindow>
        </>
      )}

      {riderLocation && nearestPoint && (
        <Polyline
          key={`walk-${riderLocation.lat}-${riderLocation.lng}-${nearestPoint.lat}-${nearestPoint.lng}`}
          path={[riderLocation, nearestPoint]}
          options={walkingPolylineOptions}
        />
      )}
    </GoogleMap>
  );
}

export default RiderSelectionMap;

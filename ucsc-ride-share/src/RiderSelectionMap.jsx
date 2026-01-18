import { useMemo } from 'react';
import { GoogleMap, Marker, Polyline, InfoWindow } from '@react-google-maps/api';

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

  const markerIcons = useMemo(() => {
    if (!window.google?.maps) {
      return { rider: undefined, meet: undefined };
    }

    const riderSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="13" fill="#f4ece0" stroke="#6e5a46" stroke-width="3" />
        <circle cx="18" cy="18" r="6" fill="#6e5a46" />
      </svg>
    `;

    const meetSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
        <path d="M20 3C13.4 3 8 8 8 14.4c0 8.6 12 22.6 12 22.6s12-14 12-22.6C32 8 26.6 3 20 3z" fill="#4f5b4a" stroke="#f7f0e6" stroke-width="2" />
        <circle cx="20" cy="14" r="6" fill="#f7f0e6" />
        <path d="M17.4 17.2v-6.4h5.2v6.4h-1.6v-4.6h-2v4.6z" fill="#4f5b4a" />
      </svg>
    `;

    const makeIcon = (svg, size, anchor) => ({
      url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
      scaledSize: new window.google.maps.Size(size, size),
      anchor: new window.google.maps.Point(anchor.x, anchor.y),
    });

    return {
      rider: makeIcon(riderSvg, 36, { x: 18, y: 18 }),
      meet: makeIcon(meetSvg, 40, { x: 20, y: 38 }),
    };
  }, []);

  const mapCenter =
    riderLocation || decodedPath[0] || nearestPoint || { lat: 0, lng: 0 };

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
          icon={markerIcons.rider}
        />
      )}

      {nearestPoint && (
        <>
          <Marker
            position={nearestPoint}
            icon={markerIcons.meet}
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

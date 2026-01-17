import { useMemo } from 'react';
import { GoogleMap, Marker, Polyline, InfoWindow } from '@react-google-maps/api';
import { useLocation } from 'react-router-dom';

const defaultMapContainerStyle = {
  width: '100%',
  height: '400px',
};

const riderMarkerIcon = {
  url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
};

const pickupMarkerIcon = {
  url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
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
  mapContainerStyle = defaultMapContainerStyle,
}) {
  const location = useLocation();
  const { user, profile } = location.state || {};
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

  const nearestPoint = useMemo(
    () => getClosestPointOnPath(riderLocation, decodedPath),
    [riderLocation, decodedPath]
  );

  const mapCenter =
    riderLocation || decodedPath[0] || nearestPoint || { lat: 0, lng: 0 };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* User Info Header */}
      {profile && (
        <div className="bg-white shadow-md p-4 mb-4">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-800">
              Welcome, {profile.full_name}!
            </h1>
            <div className="mt-2 text-sm text-gray-600">
              <p>Email: {profile.ucsc_email}</p>
              <p>Age: {profile.age} | Gender: {profile.gender}</p>
              {profile.car_model && (
                <p>Vehicle: {profile.car_color} {profile.car_model} ({profile.license_plate})</p>
              )}
            </div>
          </div>
        </div>
      )}

      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={mapCenter}
        zoom={14}
      >
      {decodedPath.length > 0 && (
        <Polyline path={decodedPath} options={routePolylineOptions} />
      )}

      {riderLocation && (
        <Marker position={riderLocation} icon={riderMarkerIcon} />
      )}

      {nearestPoint && (
        <>
          <Marker position={nearestPoint} icon={pickupMarkerIcon} />
          <InfoWindow position={nearestPoint}>
            <div>Walk here to meet driver</div>
          </InfoWindow>
        </>
      )}

      {riderLocation && nearestPoint && (
        <Polyline
          path={[riderLocation, nearestPoint]}
          options={walkingPolylineOptions}
        />
      )}
    </GoogleMap>
    </div>
  );
}

export default RiderSelectionMap;

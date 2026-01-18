import { supabase } from './supabaseClient';

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

async function resolveRiderId(riderId) {
  if (riderId) {
    return riderId;
  }

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }

  return data?.user?.id ?? null;
}

async function handleBookRide({ riderLocation, driverPolyline, tripId, riderId }) {
  if (!supabase) {
    throw new Error('Supabase client not configured.');
  }

  if (!riderLocation || !driverPolyline || !tripId) {
    throw new Error('Missing riderLocation, driverPolyline, or tripId.');
  }

  if (!window.google?.maps?.geometry?.encoding?.decodePath) {
    throw new Error('Google Maps geometry library is not available.');
  }

  const decodedPath = window.google.maps.geometry.encoding
    .decodePath(driverPolyline)
    .map((point) => ({
      lat: point.lat(),
      lng: point.lng(),
    }));

  const pickupPoint = getClosestPointOnPath(riderLocation, decodedPath);

  if (!pickupPoint) {
    throw new Error('Unable to determine pickup point.');
  }

  let walkingDistanceMeters = null;
  if (window.google?.maps?.geometry?.spherical?.computeDistanceBetween) {
    walkingDistanceMeters = Math.round(
      window.google.maps.geometry.spherical.computeDistanceBetween(
        new window.google.maps.LatLng(riderLocation.lat, riderLocation.lng),
        new window.google.maps.LatLng(pickupPoint.lat, pickupPoint.lng)
      )
    );
  }

  const resolvedRiderId = await resolveRiderId(riderId);

  if (!resolvedRiderId) {
    throw new Error('Missing rider id.');
  }

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      trip_id: tripId,
      rider_id: resolvedRiderId,
      pickup_lat: pickupPoint.lat,
      pickup_lng: pickupPoint.lng,
      walking_distance_meters: walkingDistanceMeters,
      status: 'CONFIRMED',
    })
    .select()
    .single();

  if (bookingError) {
    throw bookingError;
  }

  const { error: rpcError } = await supabase.rpc('decrement_seats', {
    trip_id: tripId,
  });

  if (rpcError) {
    throw rpcError;
  }

  return { booking, pickupPoint };
}

export { handleBookRide };

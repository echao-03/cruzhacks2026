import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLoadScript } from '@react-google-maps/api';
import RiderSelectionMap from './RiderSelectionMap';
import DriverCard from './components/DriverCard';
import {
  GlassCard,
  HeaderRow,
  PageFrame,
  SurfaceCard,
} from './components/ui';
import ProfileMenu from './components/ProfileMenu';
import { supabase } from './utils/supabase';
import { useProfile } from './hooks/useProfile';

const libraries = ['geometry'];
const metersPerMinute = 80;

const destinationOptions = [
  { id: 'ANY', label: 'Any destination' },
  { id: 'EAST_REMOTE', label: 'East Remote' },
  { id: 'CORE_WEST', label: 'Core West' },
  { id: 'WEST_REMOTE', label: 'West Remote' },
];

const destinationLabels = {
  EAST_REMOTE: 'East Remote',
  CORE_WEST: 'Core West',
  WEST_REMOTE: 'West Remote',
};

const walkingDistanceOptions = [
  { id: '5', label: 'Up to 5 min walk' },
  { id: '10', label: 'Up to 10 min walk' },
  { id: '15', label: 'Up to 15 min walk' },
];

const timeOptions = [
  { id: 'soonest', label: 'Soonest pickup' },
  { id: '15', label: 'Within 15 min' },
  { id: '30', label: 'Within 30 min' },
];

const formatTime = (value) => {
  if (!value) {
    return 'ASAP';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return 'ASAP';
  }

  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const getMinutesUntil = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const diffMs = parsed.getTime() - Date.now();
  return Math.max(Math.round(diffMs / 60000), 0);
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

const getWalkMetrics = (riderLocation, polyline) => {
  if (
    !riderLocation ||
    !polyline ||
    !window.google?.maps?.geometry?.encoding?.decodePath ||
    !window.google?.maps?.geometry?.spherical
  ) {
    return null;
  }

  const path = window.google.maps.geometry.encoding.decodePath(polyline);
  const coordinates = path.map((point) => ({
    lat: point.lat(),
    lng: point.lng(),
  }));
  const closestPoint = getClosestPointOnPath(riderLocation, coordinates);

  if (!closestPoint) {
    return null;
  }

  const distanceMeters =
    window.google.maps.geometry.spherical.computeDistanceBetween(
      new window.google.maps.LatLng(riderLocation.lat, riderLocation.lng),
      new window.google.maps.LatLng(closestPoint.lat, closestPoint.lng)
    );

  const minutes = Math.max(Math.round(distanceMeters / metersPerMinute), 1);

  return {
    distanceMeters: Math.round(distanceMeters),
    walkMinutes: minutes,
  };
};

function RiderPage() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey,
    libraries,
  });

  const { profile } = useProfile();
  const [riderLocation, setRiderLocation] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [driversLoading, setDriversLoading] = useState(false);
  const [driversError, setDriversError] = useState('');

  const [filters, setFilters] = useState({
    walkingDistance: '10',
    timeWindow: 'soonest',
    destination: 'ANY',
  });

  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [availableTrips, setAvailableTrips] = useState([]);
  const hasSetDefaultsRef = useRef(false);

  useEffect(() => {
    if (!profile || hasSetDefaultsRef.current) {
      return;
    }

    const destinationMatch = destinationOptions.some(
      (option) => option.id === profile.pref_destination
    );

    setFilters((prev) => ({
      walkingDistance: String(profile.pref_walk_minutes ?? prev.walkingDistance),
      timeWindow: String(profile.pref_time_window ?? prev.timeWindow),
      destination: destinationMatch ? profile.pref_destination : prev.destination,
    }));
    hasSetDefaultsRef.current = true;
  }, [profile]);

  useEffect(() => {
    let isActive = true;

    const loadDrivers = async () => {
      setDriversLoading(true);
      setDriversError('');

      let query = supabase
        .from('trips')
        .select(
          'id, driver_id, destination, polyline, departure_time, estimated_arrival_time, total_seats, seats_taken, status, profiles(full_name, username)'
        )
        .eq('status', 'SCHEDULED');

      if (filters.destination !== 'ANY') {
        query = query.eq('destination', filters.destination);
      }

      const { data, error } = await query;

      if (!isActive) {
        return;
      }

      if (error) {
        setDriversError(error.message);
        setAvailableTrips([]);
      } else {
        setAvailableTrips(data || []);
      }

      setDriversLoading(false);
    };

    loadDrivers();

    return () => {
      isActive = false;
    };
  }, [filters.destination]);

  const enrichedTrips = useMemo(() => {
    return availableTrips.map((trip) => {
      const walkMetrics = getWalkMetrics(riderLocation, trip.polyline);
      const arrivalMinutes = getMinutesUntil(trip.estimated_arrival_time);
      const availableSeats = Math.max(trip.total_seats - (trip.seats_taken || 0), 0);
      const profileName =
        trip.profiles?.full_name || trip.profiles?.username || 'Driver';

      return {
        id: trip.id,
        name: profileName,
        destination: destinationLabels[trip.destination] || trip.destination,
        meetTime: `Arrives ${formatTime(trip.estimated_arrival_time)}`,
        availableSeats,
        totalSeats: trip.total_seats || availableSeats,
        routePolyline: trip.polyline || '',
        walkMinutes: walkMetrics?.walkMinutes ?? null,
        arrivalMinutes,
      };
    });
  }, [availableTrips, riderLocation]);

  const filteredDrivers = useMemo(() => {
    return enrichedTrips
      .filter((driver) => {
        if (
          filters.walkingDistance &&
          driver.walkMinutes !== null &&
          driver.walkMinutes > Number(filters.walkingDistance)
        ) {
          return false;
        }

        if (
          filters.timeWindow !== 'soonest' &&
          driver.arrivalMinutes !== null &&
          driver.arrivalMinutes > Number(filters.timeWindow)
        ) {
          return false;
        }

        return driver.availableSeats > 0;
      })
      .sort((a, b) => {
        if (a.arrivalMinutes === null) {
          return 1;
        }
        if (b.arrivalMinutes === null) {
          return -1;
        }
        return a.arrivalMinutes - b.arrivalMinutes;
      });
  }, [enrichedTrips, filters]);

  const selectedDriver = useMemo(
    () => filteredDrivers.find((driver) => driver.id === selectedDriverId) || null,
    [filteredDrivers, selectedDriverId]
  );

  useEffect(() => {
    if (filteredDrivers.length === 0) {
      setSelectedDriverId(null);
      return;
    }

    const stillAvailable = filteredDrivers.some(
      (driver) => driver.id === selectedDriverId
    );

    if (!stillAvailable) {
      setSelectedDriverId(filteredDrivers[0].id);
    }
  }, [filteredDrivers, selectedDriverId]);

  const handleUseLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported in this browser.');
      return;
    }

    setIsLocating(true);
    setLocationError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRiderLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setIsLocating(false);
      },
      (error) => {
        setLocationError(error.message || 'Unable to get current location.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const handleFilterChange = useCallback((key) => (event) => {
    setFilters((prev) => ({ ...prev, [key]: event.target.value }));
  }, []);

  if (!apiKey || loadError || !isLoaded) {
    const message = !apiKey
      ? 'Missing `VITE_GOOGLE_MAPS_API_KEY`.'
      : loadError
        ? 'Unable to load Google Maps.'
        : 'Loading map...';

    return (
      <PageFrame width="full">
        <SurfaceCard className="max-w-lg text-sm text-[#4b4034]">
          {message}
        </SurfaceCard>
      </PageFrame>
    );
  }

  return (
    <PageFrame width="full">
      <HeaderRow
        title="Rider Pickup"
        subtitle="Find a driver and walk to the closest pickup point."
        action={<ProfileMenu />}
      />

      <div className="mt-8 space-y-6">
        <GlassCard className="flex flex-col gap-4 text-[#4b4034] md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#7a6b59]">
              Rider view
            </p>
            <h3 className="text-xl font-semibold text-[#3a3128]">
              Walk-up pickup
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleUseLocation}
              className="rounded-2xl bg-[#4f5b4a] px-4 py-2 text-sm font-semibold text-[#f3efe6] shadow-[0_10px_20px_rgba(65,80,63,0.3)] transition hover:translate-y-[-1px] hover:bg-[#434d3d]"
            >
              {isLocating ? 'Locating...' : 'Use My Location'}
            </button>
            {riderLocation && (
              <span className="text-sm text-[#5a4e41]">
                {riderLocation.lat.toFixed(5)}, {riderLocation.lng.toFixed(5)}
              </span>
            )}
            {locationError && (
              <span className="text-xs font-semibold text-[#9b3f2f]">
                {locationError}
              </span>
            )}
          </div>
        </GlassCard>

        <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] lg:items-start">
          <SurfaceCard className="flex h-[640px] flex-col">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6f604f]">
                  Available drivers
                </p>
                <p className="text-lg font-semibold text-[#3a3128]">
                  Choose a ride
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFilterOpen((prev) => !prev)}
                className="rounded-2xl border border-[#c9b7a3] px-4 py-2 text-sm font-semibold text-[#5b4b3a] transition hover:bg-[#efe5d8]"
              >
                {isFilterOpen ? 'Hide Filters' : 'Filters'}
              </button>
            </div>

            {isFilterOpen && (
              <div className="mt-4 rounded-2xl border border-[#d7c5b1] bg-[#f4ece0] p-4 text-sm text-[#5d5044]">
                <div className="grid gap-4">
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]">
                    Walking distance
                    <select
                      value={filters.walkingDistance}
                      onChange={handleFilterChange('walkingDistance')}
                      className="rounded-2xl border border-[#c9b7a3] bg-[#f9f3ea] px-4 py-2 text-sm font-semibold text-[#3a3128] focus:border-[#6f604f] focus:outline-none"
                    >
                      {walkingDistanceOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]">
                    Time window
                    <select
                      value={filters.timeWindow}
                      onChange={handleFilterChange('timeWindow')}
                      className="rounded-2xl border border-[#c9b7a3] bg-[#f9f3ea] px-4 py-2 text-sm font-semibold text-[#3a3128] focus:border-[#6f604f] focus:outline-none"
                    >
                      {timeOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]">
                    Destination sorting
                    <select
                      value={filters.destination}
                      onChange={handleFilterChange('destination')}
                      className="rounded-2xl border border-[#c9b7a3] bg-[#f9f3ea] px-4 py-2 text-sm font-semibold text-[#3a3128] focus:border-[#6f604f] focus:outline-none"
                    >
                      {destinationOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}

            <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-2">
              {driversLoading && (
                <p className="text-sm text-[#6a5c4b]">Loading drivers...</p>
              )}
              {!driversLoading && driversError && (
                <p className="text-sm text-[#9b3f2f]">{driversError}</p>
              )}
              {!driversLoading && !driversError && filteredDrivers.length === 0 && (
                <p className="text-sm text-[#6a5c4b]">
                  No drivers available yet.
                </p>
              )}
              {!driversLoading &&
                !driversError &&
                filteredDrivers.map((driver) => (
                  <DriverCard
                    key={driver.id}
                    driver={driver}
                    onSelect={() => setSelectedDriverId(driver.id)}
                    isSelected={driver.id === selectedDriverId}
                  />
                ))}
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-4">
            {riderLocation && selectedDriver?.routePolyline ? (
              <RiderSelectionMap
                riderLocation={riderLocation}
                tripPolyline={selectedDriver.routePolyline}
                mapContainerStyle={{ width: '100%', height: '640px' }}
              />
            ) : (
              <div className="flex h-[640px] items-center justify-center text-sm text-[#6a5c4b]">
                Enable location and select a driver to view your pickup route.
              </div>
            )}
          </SurfaceCard>
        </div>
      </div>
    </PageFrame>
  );
}

export default RiderPage;

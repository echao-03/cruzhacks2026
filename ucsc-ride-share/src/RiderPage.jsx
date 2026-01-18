import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLoadScript } from '@react-google-maps/api';
import { Link } from 'react-router-dom';
import RiderSelectionMap from './RiderSelectionMap';
import DriverCard from './components/DriverCard';
import { HeaderRow, PageFrame, SurfaceCard } from './components/ui';
import ProfileMenu from './components/ProfileMenu';
import { supabase } from './utils/supabase';
import { useProfile } from './hooks/useProfile';

const libraries = ['geometry', 'places'];
const metersPerMinute = 80;
const riderLocationStorageKey = 'slugrider.riderLocation';
const tripStartGraceMs = 5 * 60 * 1000;

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

const toFixedCoord = (value) => Number(value).toFixed(6);

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
    return { point: start, t: 0 };
  }

  const t =
    ((point.lat - start.lat) * dx + (point.lng - start.lng) * dy) /
    lengthSquared;
  const clampedT = clamp(t, 0, 1);

  return {
    point: {
      lat: start.lat + clampedT * dx,
      lng: start.lng + clampedT * dy,
    },
    t: clampedT,
  };
};

const getSquaredDistance = (a, b) => {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return dLat * dLat + dLng * dLng;
};

const getClosestPointOnPath = (point, path) => {
  if (!point || !path || path.length < 2) {
    return null;
  }

  let closestPoint = path[0];
  let minDistance = getSquaredDistance(point, closestPoint);
  let closestSegmentIndex = 0;
  let closestT = 0;

  for (let i = 0; i < path.length - 1; i += 1) {
    const { point: candidate, t } = getClosestPointOnSegment(
      point,
      path[i],
      path[i + 1]
    );
    const distance = getSquaredDistance(point, candidate);

    if (distance < minDistance) {
      minDistance = distance;
      closestPoint = candidate;
      closestSegmentIndex = i;
      closestT = t;
    }
  }

  return {
    point: closestPoint,
    segmentIndex: closestSegmentIndex,
    t: closestT,
  };
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

  if (coordinates.length < 2) {
    return null;
  }

  const closest = getClosestPointOnPath(riderLocation, coordinates);

  if (!closest) {
    return null;
  }

  let totalRouteDistance = 0;
  const segmentDistances = [];

  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const distance = window.google.maps.geometry.spherical.computeDistanceBetween(
      new window.google.maps.LatLng(coordinates[i].lat, coordinates[i].lng),
      new window.google.maps.LatLng(coordinates[i + 1].lat, coordinates[i + 1].lng)
    );
    segmentDistances.push(distance);
    totalRouteDistance += distance;
  }

  let distanceAlongRoute = 0;
  for (let i = 0; i < closest.segmentIndex; i += 1) {
    distanceAlongRoute += segmentDistances[i] || 0;
  }
  distanceAlongRoute +=
    (segmentDistances[closest.segmentIndex] || 0) * closest.t;

  const distanceMeters =
    window.google.maps.geometry.spherical.computeDistanceBetween(
      new window.google.maps.LatLng(riderLocation.lat, riderLocation.lng),
      new window.google.maps.LatLng(closest.point.lat, closest.point.lng)
    );

  const minutes = Math.max(Math.round(distanceMeters / metersPerMinute), 1);

  return {
    distanceMeters: Math.round(distanceMeters),
    walkMinutes: minutes,
    meetingPoint: closest.point,
    distanceAlongRouteMeters: distanceAlongRoute,
    routeDistanceMeters: Math.round(totalRouteDistance),
  };
};

const computeMeetingEta = (
  departureTime,
  arrivalTime,
  routeDistanceMeters,
  meetingDistanceMeters
) => {
  if (!departureTime || !arrivalTime || !routeDistanceMeters) {
    return '';
  }

  const depart = new Date(departureTime);
  const arrive = new Date(arrivalTime);
  const totalDurationMs = arrive.getTime() - depart.getTime();

  if (Number.isNaN(depart.getTime()) || Number.isNaN(arrive.getTime())) {
    return '';
  }

  if (totalDurationMs <= 0) {
    return arrive.toISOString();
  }

  const safeRoute = Math.max(routeDistanceMeters || 0, 1);
  const safeMeeting = Math.min(
    Math.max(meetingDistanceMeters || 0, 0),
    safeRoute
  );
  const ratio = clamp(safeMeeting / safeRoute, 0, 1);
  return new Date(depart.getTime() + totalDurationMs * ratio).toISOString();
};

function RiderPage() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey,
    libraries,
  });

  const { profile } = useProfile();
  const [riderLocation, setRiderLocation] = useState(null);
  const [riderLocationLabel, setRiderLocationLabel] = useState('');
  const [locationMode, setLocationMode] = useState('current');
  const [locationAddress, setLocationAddress] = useState('');
  const [locationError, setLocationError] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [meetingPointLabel, setMeetingPointLabel] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [driversLoading, setDriversLoading] = useState(false);
  const [driversError, setDriversError] = useState('');
  const [meetingEtaOverrides, setMeetingEtaOverrides] = useState({});

  const [filters, setFilters] = useState({
    walkingDistance: '10',
    timeWindow: 'soonest',
    destination: 'ANY',
  });

  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [availableTrips, setAvailableTrips] = useState([]);
  const [activeBooking, setActiveBooking] = useState(null);
  const [bookingError, setBookingError] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [startNotice, setStartNotice] = useState('');
  const [tripStartOverrides, setTripStartOverrides] = useState({});
  const [walkingEstimates, setWalkingEstimates] = useState({});
  const hasSetDefaultsRef = useRef(false);
  const locationInputRef = useRef(null);
  const locationAutocompleteRef = useRef(null);
  const lastAutocompletePredictionRef = useRef(null);
  const defaultMapCenter = useMemo(
    () => ({ lat: 36.9969, lng: -122.0552 }),
    []
  );
  const riderLocationKey = useMemo(() => {
    if (!riderLocation) {
      return '';
    }
    return `${toFixedCoord(riderLocation.lat)},${toFixedCoord(riderLocation.lng)}`;
  }, [riderLocation]);

  const reverseGeocode = useCallback(
    (lat, lng, onSuccess) => {
      if (!isLoaded || !window.google?.maps?.Geocoder) {
        return;
      }

      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === 'OK' && results?.[0]?.formatted_address) {
          onSuccess(results[0].formatted_address);
        }
      });
    },
    [isLoaded]
  );

  useEffect(() => {
    const stored = localStorage.getItem(riderLocationStorageKey);

    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      if (
        typeof parsed?.lat === 'number' &&
        typeof parsed?.lng === 'number'
      ) {
        setRiderLocation({ lat: parsed.lat, lng: parsed.lng });
      }
    } catch (error) {
      localStorage.removeItem(riderLocationStorageKey);
    }
  }, []);

  useEffect(() => {
    if (riderLocation) {
      localStorage.setItem(
        riderLocationStorageKey,
        JSON.stringify(riderLocation)
      );
    } else {
      localStorage.removeItem(riderLocationStorageKey);
      setRiderLocationLabel('');
    }
  }, [riderLocation]);

  useEffect(() => {
    if (!riderLocation || riderLocationLabel) {
      return;
    }

    reverseGeocode(riderLocation.lat, riderLocation.lng, setRiderLocationLabel);
  }, [riderLocation, riderLocationLabel, reverseGeocode]);

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

  const loadDrivers = useCallback(() => {
    let isActive = true;

    const run = async () => {
      setDriversLoading(true);
      setDriversError('');

      let query = supabase
        .from('trips')
        .select(
          'id, driver_id, destination, polyline, departure_time, estimated_arrival_time, total_seats, seats_taken, status, start_lat, start_lng, profiles(full_name, username)'
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

    run();

    return () => {
      isActive = false;
    };
  }, [filters.destination]);

  useEffect(() => {
    const cancel = loadDrivers();
    return () => {
      if (typeof cancel === 'function') {
        cancel();
      }
    };
  }, [loadDrivers]);

  useEffect(() => {
    const channel = supabase
      .channel('rider-trips')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips' },
        () => {
          loadDrivers();
        }
      );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadDrivers]);

  useEffect(() => {
    if (!activeBooking?.tripId) {
      return undefined;
    }

    const channel = supabase
      .channel(`rider-active-trip:${activeBooking.tripId}`)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'trips',
          filter: `id=eq.${activeBooking.tripId}`,
        },
        () => {
          setActiveBooking(null);
          setSelectedDriverId(null);
          setBookingError('Your ride was cancelled by the driver.');
          loadDrivers();
        }
      );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeBooking?.tripId, loadDrivers]);

  useEffect(() => {
    if (!activeBooking?.bookingId) {
      return undefined;
    }

    const channel = supabase
      .channel(`rider-booking:${activeBooking.bookingId}`)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${activeBooking.bookingId}`,
        },
        () => {
          setActiveBooking(null);
          setSelectedDriverId(null);
          setBookingError('Your seat was released.');
          loadDrivers();
        }
      );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeBooking?.bookingId, loadDrivers]);

  const buildDriverSummary = useCallback(
    (trip) => {
      if (!trip) {
        return null;
      }

      const startOverride = tripStartOverrides[trip.id];
      let effectiveDeparture = startOverride || trip.departure_time || '';
      let effectiveArrival = trip.estimated_arrival_time || '';

      if (startOverride && trip.departure_time) {
        const base = new Date(trip.departure_time);
        const override = new Date(startOverride);
        if (!Number.isNaN(base.getTime()) && !Number.isNaN(override.getTime())) {
          const delta = override.getTime() - base.getTime();
          const arrivalDate = new Date(effectiveArrival);
          if (!Number.isNaN(arrivalDate.getTime())) {
            effectiveArrival = new Date(arrivalDate.getTime() + delta).toISOString();
          }
          effectiveDeparture = override.toISOString();
        }
      }

      const walkMetrics = getWalkMetrics(riderLocation, trip.polyline);
      const meetingEta = walkMetrics?.meetingPoint
        ? computeMeetingEta(
            effectiveDeparture,
            effectiveArrival,
            walkMetrics.routeDistanceMeters,
            walkMetrics.distanceAlongRouteMeters
          )
        : '';
      const meetingTimeText = meetingEta ? formatTime(meetingEta) : '';
      const arrivalTimeText = effectiveArrival ? formatTime(effectiveArrival) : '';
      const arrivalMinutes = getMinutesUntil(meetingEta || effectiveArrival);
      const availableSeats = Math.max(
        trip.total_seats - (trip.seats_taken || 0),
        0
      );
      const profileName =
        trip.profiles?.full_name || trip.profiles?.username || 'Driver';

      return {
        id: trip.id,
        name: profileName,
        departure_time: effectiveDeparture,
        estimated_arrival_time: effectiveArrival,
        destination: destinationLabels[trip.destination] || trip.destination,
        meetTime: meetingTimeText
          ? `Meet by ${meetingTimeText}`
          : 'Meet time pending',
        arrivalTime: arrivalTimeText,
        availableSeats,
        totalSeats: trip.total_seats || availableSeats,
        routePolyline: trip.polyline || '',
        walkMinutes: walkMetrics?.walkMinutes ?? null,
        walkDistanceMeters: walkMetrics?.distanceMeters ?? null,
        meetingPoint: walkMetrics?.meetingPoint || null,
        meetingEta: meetingEta || '',
        routeDistanceMeters: walkMetrics?.routeDistanceMeters ?? null,
        distanceAlongRouteMeters: walkMetrics?.distanceAlongRouteMeters ?? null,
        arrivalMinutes,
        status: trip.status || 'SCHEDULED',
        startLat: trip.start_lat ?? null,
        startLng: trip.start_lng ?? null,
      };
    },
    [riderLocation, tripStartOverrides]
  );

  const enrichedTrips = useMemo(
    () =>
      availableTrips
        .map((trip) => {
          const base = buildDriverSummary(trip);
          if (!base) {
            return null;
          }
          const override = meetingEtaOverrides[trip.id];
          return override ? { ...base, meetingEta: override } : base;
        })
        .filter(Boolean),
    [availableTrips, buildDriverSummary, meetingEtaOverrides]
  );

  useEffect(() => {
    setTripStartOverrides((prev) => {
      let next = prev;
      let changed = false;

      enrichedTrips.forEach((trip) => {
        if (trip.status === 'IN_PROGRESS' && !prev[trip.id]) {
          next = next === prev ? { ...prev } : next;
          next[trip.id] = new Date().toISOString();
          changed = true;
        } else if (trip.status !== 'IN_PROGRESS' && prev[trip.id]) {
          next = next === prev ? { ...prev } : next;
          delete next[trip.id];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [enrichedTrips]);

  const tripsWithWalkingOverrides = useMemo(
    () =>
      enrichedTrips.map((trip) => {
        const override = walkingEstimates[trip.id];
        if (override && override.walkMinutes !== null) {
          return {
            ...trip,
            walkMinutes: override.walkMinutes,
            walkDistanceMeters:
              override.walkDistanceMeters ?? trip.walkDistanceMeters,
          };
        }
        return trip;
      }),
    [enrichedTrips, walkingEstimates]
  );

  const filteredDrivers = useMemo(() => {
    return tripsWithWalkingOverrides
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
  }, [tripsWithWalkingOverrides, filters]);

  const selectedDriver = useMemo(() => {
    const fromList =
      filteredDrivers.find((driver) => driver.id === selectedDriverId) || null;

    if (fromList) {
      return fromList;
    }

    if (activeBooking && activeBooking.tripId === selectedDriverId) {
      return activeBooking.driver;
    }

    return null;
  }, [filteredDrivers, selectedDriverId, activeBooking]);

  useEffect(() => {
    setWalkingEstimates({});
  }, [riderLocationKey]);

  useEffect(() => {
    const tripId = activeBooking?.tripId;
    const status = activeBooking?.driver?.status;
    if (!tripId) {
      return;
    }

    setTripStartOverrides((prev) => {
      if (status === 'IN_PROGRESS' && !prev[tripId]) {
        return { ...prev, [tripId]: new Date().toISOString() };
      }
      if (status !== 'IN_PROGRESS' && prev[tripId]) {
        const next = { ...prev };
        delete next[tripId];
        return next;
      }
      return prev;
    });
  }, [activeBooking?.tripId, activeBooking?.driver?.status]);

  useEffect(() => {
    if (
      !isLoaded ||
      !riderLocation ||
      !window.google?.maps?.DirectionsService ||
      !window.google?.maps?.TravelMode
    ) {
      return;
    }

    let cancelled = false;
    const origin = riderLocation;
    const originKey = riderLocationKey;
    const service = new window.google.maps.DirectionsService();

    filteredDrivers.forEach((driver) => {
      if (!driver.meetingPoint) {
        return;
      }

      if (walkingEstimates[driver.id]?.originKey === originKey) {
        return;
      }

      service.route(
        {
          origin,
          destination: driver.meetingPoint,
          travelMode: window.google.maps.TravelMode.WALKING,
        },
        (result, status) => {
          if (cancelled) {
            return;
          }

          if (status === 'OK' && result?.routes?.[0]?.legs?.[0]) {
            const leg = result.routes[0].legs[0];
            const distance = leg.distance?.value ?? null;
            const minutes = leg.duration
              ? Math.max(Math.round(leg.duration.value / 60), 1)
              : null;

            setWalkingEstimates((prev) => {
              if (prev[driver.id]?.originKey === originKey) {
                return prev;
              }
              return {
                ...prev,
                [driver.id]: {
                  originKey,
                  walkDistanceMeters: distance,
                  walkMinutes: minutes,
                },
              };
            });
          }
        }
      );
    });

    return () => {
      cancelled = true;
    };
  }, [
    filteredDrivers,
    isLoaded,
    riderLocation,
    riderLocationKey,
    walkingEstimates,
  ]);

  const refreshActiveTrip = useCallback(
    async (tripId) => {
      if (!tripId) {
        return;
      }

      const { data, error } = await supabase
        .from('trips')
        .select(
          'id, driver_id, destination, polyline, departure_time, estimated_arrival_time, total_seats, seats_taken, status, profiles(full_name, username)'
        )
        .eq('id', tripId)
        .maybeSingle();

      if (error) {
        return;
      }

      if (!data) {
        setActiveBooking(null);
        setSelectedDriverId(null);
        setBookingError('Your ride is no longer available.');
        return;
      }

      const updatedDriver = buildDriverSummary(data);
      if (!updatedDriver) {
        return;
      }

      setActiveBooking((prev) => {
        if (!prev) {
          return prev;
        }

        return {
          ...prev,
          driver: updatedDriver,
          meetingPoint: updatedDriver.meetingPoint,
          meetingEta: updatedDriver.meetingEta,
          walkMinutes: updatedDriver.walkMinutes,
          walkDistanceMeters: updatedDriver.walkDistanceMeters,
        };
      });
    },
    [buildDriverSummary]
  );

  useEffect(() => {
    if (!activeBooking?.tripId) {
      return undefined;
    }

    refreshActiveTrip(activeBooking.tripId);

    const channel = supabase
      .channel(`rider-trip-status:${activeBooking.tripId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'trips',
          filter: `id=eq.${activeBooking.tripId}`,
        },
        () => {
          refreshActiveTrip(activeBooking.tripId);
        }
      );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeBooking?.tripId, refreshActiveTrip]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadDrivers();
      if (activeBooking?.tripId) {
        refreshActiveTrip(activeBooking.tripId);
      }
    }, 25000);

    return () => {
      clearInterval(interval);
    };
  }, [loadDrivers, refreshActiveTrip, activeBooking?.tripId]);

  useEffect(() => {
    if (activeBooking?.driver?.status === 'IN_PROGRESS') {
      setStartNotice((prev) =>
        prev
          ? prev
          : 'Your driver has departed. Head to your pickup point; times are adjusted.'
      );
    } else if (!activeBooking) {
      setStartNotice('');
    }
  }, [activeBooking]);

  useEffect(() => {
    if (!activeBooking?.tripId) {
      return;
    }

    const updated = tripsWithWalkingOverrides.find(
      (trip) => trip.id === activeBooking.tripId
    );

    if (!updated) {
      return;
    }

    setActiveBooking((prev) => {
      if (!prev) {
        return prev;
      }

      return {
        ...prev,
        driver: updated,
        meetingPoint: updated.meetingPoint,
        meetingEta: updated.meetingEta,
        walkMinutes: updated.walkMinutes,
        walkDistanceMeters: updated.walkDistanceMeters,
      };
    });
  }, [activeBooking?.tripId, tripsWithWalkingOverrides]);

  useEffect(() => {
    if (!activeBooking?.tripId) {
      return;
    }

    const startOverride = tripStartOverrides[activeBooking.tripId];
    if (!startOverride) {
      return;
    }

    setActiveBooking((prev) => {
      if (!prev) {
        return prev;
      }
      const driver = prev.driver;
      if (!driver) {
        return prev;
      }

      const baseDeparture = driver.departure_time || '';
      const baseArrival = driver.estimated_arrival_time || '';
      const baseDepartureDate = new Date(baseDeparture);
      const overrideDate = new Date(startOverride);
      let effectiveArrival = baseArrival;

      if (!Number.isNaN(baseDepartureDate.getTime()) && !Number.isNaN(overrideDate.getTime())) {
        const delta = overrideDate.getTime() - baseDepartureDate.getTime();
        const arrivalDate = new Date(baseArrival);
        if (!Number.isNaN(arrivalDate.getTime())) {
          effectiveArrival = new Date(arrivalDate.getTime() + delta).toISOString();
        }
      }

      const meetingEta = driver.meetingPoint
        ? computeMeetingEta(
            startOverride,
            effectiveArrival,
            driver.routeDistanceMeters,
            driver.distanceAlongRouteMeters
          )
        : prev.meetingEta;

      return {
        ...prev,
        meetingEta: meetingEta || prev.meetingEta,
        driver: {
          ...driver,
          departure_time: startOverride,
          estimated_arrival_time: effectiveArrival,
          meetingEta: meetingEta || driver.meetingEta,
        },
      };
    });
  }, [activeBooking?.tripId, tripStartOverrides]);

  useEffect(() => {
    if (filteredDrivers.length === 0) {
      if (!activeBooking) {
        setSelectedDriverId(null);
      }
      return;
    }

    const stillAvailable = filteredDrivers.some(
      (driver) => driver.id === selectedDriverId
    );

    if (!stillAvailable && !activeBooking) {
      setSelectedDriverId(null);
    }
  }, [filteredDrivers, selectedDriverId, activeBooking]);

  useEffect(() => {
    setBookingError('');
  }, [selectedDriverId]);

  const handleUseLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported in this browser.');
      return;
    }

    setIsLocating(true);
    setLocationError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setRiderLocation(nextLocation);
        reverseGeocode(nextLocation.lat, nextLocation.lng, setRiderLocationLabel);
        setIsLocating(false);
        setIsLocationPickerOpen(false);
      },
      (error) => {
        setLocationError(error.message || 'Unable to get current location.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [reverseGeocode]);

  const handleUseAddress = useCallback(() => {
    if (!locationAddress.trim()) {
      setLocationError('Enter an address to continue.');
      return;
    }

    if (!window.google?.maps?.Geocoder) {
      setLocationError('Google Maps is not ready.');
      return;
    }

    setIsGeocoding(true);
    setLocationError('');

    const applyResult = (result, labelOverride) => {
      const location = result?.geometry?.location;
      if (location) {
        const formatted =
          labelOverride || result.formatted_address || locationAddress;
        setRiderLocation({ lat: location.lat(), lng: location.lng() });
        setRiderLocationLabel(formatted);
        setIsLocationPickerOpen(false);
        setIsGeocoding(false);
        setLocationError('');
        return true;
      }
      return false;
    };

    const usePrediction = (prediction) => {
      if (!prediction) {
        return false;
      }

      if (prediction.geometry?.location) {
        return applyResult(prediction, prediction.formatted_address);
      }

      if (!prediction.place_id) {
        return false;
      }

      if (!window.google?.maps?.places?.PlacesService) {
        return false;
      }

      const placesService = new window.google.maps.places.PlacesService(
        document.createElement('div')
      );
      placesService.getDetails(
        { placeId: prediction.place_id, fields: ['geometry', 'formatted_address'] },
        (placeResult, placeStatus) => {
          if (placeStatus === 'OK' && applyResult(placeResult)) {
            return;
          }
          setLocationError(
            'Unable to find that address. Please pick from suggestions.'
          );
          setRiderLocation(null);
          setRiderLocationLabel('');
          setIsGeocoding(false);
        }
      );
      return true;
    };

    if (usePrediction(lastAutocompletePredictionRef.current)) {
      return;
    }

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode(
      {
        address: locationAddress,
        region: 'us',
      },
      (results, status) => {
        if (status === 'OK' && results?.[0] && applyResult(results[0])) {
          return;
        }

        if (window.google?.maps?.places?.AutocompleteService) {
          const autoService = new window.google.maps.places.AutocompleteService();
          autoService.getPlacePredictions(
            {
              input: locationAddress,
              region: 'us',
            },
            (predictions, autoStatus) => {
              if (
                autoStatus === 'OK' &&
                Array.isArray(predictions) &&
                predictions.length > 0
              ) {
                lastAutocompletePredictionRef.current = predictions[0];
                if (usePrediction(predictions[0])) {
                  return;
                }
              }

              setLocationError(
                'Unable to find that address. Please pick from suggestions.'
              );
              setRiderLocation(null);
              setRiderLocationLabel('');
              setIsGeocoding(false);
            }
          );
          return;
        }

        setLocationError('Unable to find that address. Please pick from suggestions.');
        setRiderLocation(null);
        setRiderLocationLabel('');
        setIsGeocoding(false);
      }
    );
  }, [locationAddress]);

  useEffect(() => {
    if (!isLoaded || locationMode !== 'address' || !isLocationPickerOpen) {
      if (locationAutocompleteRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(
          locationAutocompleteRef.current
        );
      }
      locationAutocompleteRef.current = null;
      return;
    }

    if (!window.google?.maps?.places?.Autocomplete || !locationInputRef.current) {
      return;
    }

    const autocomplete = new window.google.maps.places.Autocomplete(
      locationInputRef.current,
      {
        fields: ['formatted_address', 'geometry', 'place_id'],
      }
    );

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      const location = place?.geometry?.location;

      if (!location) {
        setLocationError('Select a valid address from the suggestions.');
        setRiderLocation(null);
        setRiderLocationLabel('');
        return;
      }

      lastAutocompletePredictionRef.current = place;
      const formattedAddress = place.formatted_address || locationAddress;
      setLocationAddress(formattedAddress);
      setRiderLocation({ lat: location.lat(), lng: location.lng() });
      setRiderLocationLabel(formattedAddress);
      setLocationError('');
      setIsLocationPickerOpen(false);
    });

    locationAutocompleteRef.current = autocomplete;

    return () => {
      if (locationAutocompleteRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(
          locationAutocompleteRef.current
        );
      }
    };
  }, [isLoaded, isLocationPickerOpen, locationMode]);

  const handleFilterChange = useCallback((key) => (event) => {
    setFilters((prev) => ({ ...prev, [key]: event.target.value }));
  }, []);

  const handleRefreshDrivers = useCallback(async () => {
    setBookingError('');
    loadDrivers();

    if (!activeBooking?.bookingId) {
      return;
    }

    const { data, error } = await supabase
      .from('bookings')
      .select('id')
      .eq('id', activeBooking.bookingId);

    if (error) {
      setBookingError(error.message || 'Unable to refresh your booking.');
      return;
    }

    if (!data || data.length === 0) {
      setActiveBooking(null);
      setSelectedDriverId(null);
      setBookingError('Your ride is no longer available.');
    }
  }, [activeBooking?.bookingId, loadDrivers]);

  const mapDriver = selectedDriver || activeBooking?.driver || null;
  const hasRideSelection = Boolean(activeBooking || selectedDriver);
  const riderMapContainerStyle = useMemo(
    () => ({ width: '100%', height: '100%', borderRadius: '24px' }),
    []
  );
  useEffect(() => {
    const fetchEta = async () => {
      if (
        !isLoaded ||
        !mapDriver?.startLat ||
        !mapDriver?.startLng ||
        !mapDriver?.meetingPoint
      ) {
        return;
      }

      const origin = {
        lat: Number(mapDriver.startLat),
        lng: Number(mapDriver.startLng),
      };
      const destination = mapDriver.meetingPoint;

      if (
        Number.isNaN(origin.lat) ||
        Number.isNaN(origin.lng) ||
        Number.isNaN(destination.lat) ||
        Number.isNaN(destination.lng)
      ) {
        return;
      }

      const departTime =
        tripStartOverrides[mapDriver.id] || mapDriver.departure_time || '';

      const service = new window.google.maps.DirectionsService();
      service.route(
        {
          origin,
          destination,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (
            status === 'OK' &&
            result?.routes?.[0]?.legs?.[0]?.duration?.value
          ) {
            const departDate = new Date(departTime);
            if (Number.isNaN(departDate.getTime())) {
              return;
            }

            const durationSeconds = result.routes[0].legs[0].duration.value;
            const etaDate = new Date(
              departDate.getTime() + durationSeconds * 1000
            );

            if (Number.isNaN(etaDate.getTime())) {
              return;
            }

            setMeetingEtaOverrides((prev) => ({
              ...prev,
              [mapDriver.id]: etaDate.toISOString(),
            }));
          }
        }
      );
    };

    fetchEta();
  }, [isLoaded, mapDriver, tripStartOverrides]);
  const riderMeetupMapsUrl = useMemo(() => {
    if (!mapDriver?.meetingPoint) {
      return '';
    }

    const destination = `${toFixedCoord(mapDriver.meetingPoint.lat)},${toFixedCoord(
      mapDriver.meetingPoint.lng
    )}`;
    const origin = riderLocation
      ? `${toFixedCoord(riderLocation.lat)},${toFixedCoord(riderLocation.lng)}`
      : '';
    const originParam = origin ? `&origin=${origin}` : '';

    return `https://www.google.com/maps/dir/?api=1${originParam}&destination=${destination}&travelmode=walking`;
  }, [mapDriver, riderLocation]);

  useEffect(() => {
    if (!mapDriver?.meetingPoint) {
      setMeetingPointLabel('');
      return;
    }

    reverseGeocode(
      mapDriver.meetingPoint.lat,
      mapDriver.meetingPoint.lng,
      setMeetingPointLabel
    );
  }, [mapDriver?.meetingPoint, reverseGeocode]);

  const handleBookRide = useCallback(async () => {
    setBookingError('');

    if (!riderLocation) {
      setBookingError('Set your location to pick a meeting point.');
      return;
    }

    if (!selectedDriver) {
      setBookingError('Select a driver first.');
      return;
    }

    if (!selectedDriver.meetingPoint) {
      setBookingError('Unable to compute your meeting point for this route.');
      return;
    }

    setBookingLoading(true);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      const riderId = userData?.user?.id;

      if (!riderId) {
        throw new Error('You must be logged in to book a ride.');
      }

      const { data: tripRow, error: tripError } = await supabase
        .from('trips')
        .select('seats_taken, total_seats')
        .eq('id', selectedDriver.id)
        .single();

      if (tripError) {
        throw tripError;
      }

      if ((tripRow?.seats_taken ?? 0) >= (tripRow?.total_seats ?? 0)) {
        throw new Error('No seats left for this ride.');
      }

      const { data: bookingRow, error: bookingInsertError } = await supabase
        .from('bookings')
        .insert({
          trip_id: selectedDriver.id,
          rider_id: riderId,
          pickup_lat: selectedDriver.meetingPoint.lat,
          pickup_lng: selectedDriver.meetingPoint.lng,
          walking_distance_meters: selectedDriver.walkDistanceMeters ?? null,
        })
        .select('id')
        .single();

      if (bookingInsertError) {
        throw bookingInsertError;
      }

      const { error: updateError } = await supabase
        .from('trips')
        .update({ seats_taken: (tripRow?.seats_taken || 0) + 1 })
        .eq('id', selectedDriver.id)
        .eq('seats_taken', tripRow?.seats_taken || 0);

      if (updateError) {
        await supabase.from('bookings').delete().eq('id', bookingRow.id);
        throw updateError;
      }

      setActiveBooking({
        tripId: selectedDriver.id,
        bookingId: bookingRow.id,
        meetingPoint: selectedDriver.meetingPoint,
        meetingEta: selectedDriver.meetingEta,
        walkMinutes: selectedDriver.walkMinutes,
        walkDistanceMeters: selectedDriver.walkDistanceMeters,
        driver: selectedDriver,
      });
      setSelectedDriverId(selectedDriver.id);
      loadDrivers();
    } catch (err) {
      setBookingError(err?.message || 'Unable to book this ride.');
    } finally {
      setBookingLoading(false);
    }
  }, [loadDrivers, riderLocation, selectedDriver]);

  const handleCancelRide = useCallback(async () => {
    if (!activeBooking) {
      return;
    }

    setBookingError('');
    setBookingLoading(true);

    try {
      if (activeBooking.bookingId) {
        await supabase.from('bookings').delete().eq('id', activeBooking.bookingId);
      }

      const { data: tripRow } = await supabase
        .from('trips')
        .select('seats_taken')
        .eq('id', activeBooking.tripId)
        .single();

      const newSeats = Math.max((tripRow?.seats_taken || 1) - 1, 0);

      await supabase
        .from('trips')
        .update({ seats_taken: newSeats })
        .eq('id', activeBooking.tripId);

      setActiveBooking(null);
      setSelectedDriverId(null);
      loadDrivers();
    } catch (err) {
      setBookingError(err?.message || 'Unable to cancel your ride.');
    } finally {
      setBookingLoading(false);
    }
  }, [activeBooking, loadDrivers]);

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
        title="Catch a Cruise"
        action={
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setLocationError('');
                setIsLocationPickerOpen(true);
              }}
              className="rounded-2xl bg-[#6e5a46] px-4 py-2 text-sm font-semibold text-[#f7f0e6] transition hover:bg-[#5c4a39]"
            >
              Set pickup
            </button>
            <Link
              to="/driver"
              className="rounded-2xl border border-[#c9b7a3] bg-[#f7f0e6] px-4 py-2 text-sm font-semibold text-[#5b4b3a] shadow-[0_12px_24px_rgba(68,54,41,0.18)] transition hover:bg-[#efe5d8]"
            >
              Switch to Driver
            </Link>
            <ProfileMenu />
          </div>
        }
      />

      <div className="mt-8 space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(340px,440px)_minmax(0,1.1fr)] lg:items-start">
          <SurfaceCard className="flex h-[700px] flex-col">
            <div
              className={`flex w-full items-start gap-3 ${
                hasRideSelection ? 'justify-end' : 'justify-between'
              }`}
            >
              {!hasRideSelection && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6f604f]">
                    Available drivers
                  </p>
                  <p className="text-lg font-semibold text-[#3a3128]">
                    Choose a ride
                  </p>
                </div>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefreshDrivers}
                  disabled={driversLoading}
                  className="rounded-2xl border border-[#c9b7a3] px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#5b4b3a] transition hover:bg-[#efe5d8] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {driversLoading ? 'Refreshing...' : 'Refresh'}
                </button>
                {!hasRideSelection && (
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen((prev) => !prev)}
                    className="rounded-2xl border border-[#c9b7a3] px-4 py-2 text-sm font-semibold text-[#5b4b3a] transition hover:bg-[#efe5d8]"
                  >
                    {isFilterOpen ? 'Hide Filters' : 'Filters'}
                  </button>
                )}
              </div>
            </div>

            {isFilterOpen && !hasRideSelection && (
              <div className="mt-4 rounded-2xl border border-[#d7c5b1] bg-[#f4ece0] p-4 text-sm text-[#5d5044]">
                <div className="grid gap-4">
                  <label
                    htmlFor="filter-walk-distance"
                    className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]"
                  >
                    Walking distance
                    <select
                      id="filter-walk-distance"
                      name="walkingDistance"
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
                  <label
                    htmlFor="filter-time-window"
                    className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]"
                  >
                    Time window
                    <select
                      id="filter-time-window"
                      name="timeWindow"
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
                  <label
                    htmlFor="filter-destination"
                    className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]"
                  >
                    Destination sorting
                    <select
                      id="filter-destination"
                      name="destination"
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

            {!hasRideSelection && (
              <div className="mt-4 flex-1 space-y-4 overflow-x-visible overflow-y-auto rounded-3xl bg-[#f7f0e6] px-5 pb-5 pt-5">
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
            )}

            {(activeBooking || selectedDriver) && (
              <div className="relative mt-4 rounded-2xl border border-[#d7c5b1] bg-[#f4ece0] p-4">
                {activeBooking ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 pr-8">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#6f604f]">
                          Ride reserved
                        </p>
                        <p className="text-sm text-[#5d5044]">
                          Meet by {formatTime(activeBooking.meetingEta)} · Walk{' '}
                          {activeBooking.walkMinutes ?? '—'} min
                        </p>
                        {activeBooking.meetingPoint && (
                          <p className="text-xs text-[#756856]">
                            {meetingPointLabel ||
                              `${activeBooking.meetingPoint.lat.toFixed(
                                5
                              )}, ${activeBooking.meetingPoint.lng.toFixed(5)}`}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {riderMeetupMapsUrl && (
                          <a
                            href={riderMeetupMapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-2xl border border-[#6a5a48] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#5b4b3a] transition hover:bg-[#efe5d8]"
                          >
                            Open in Google Maps
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={handleCancelRide}
                          disabled={bookingLoading}
                          className="rounded-2xl border border-[#b45d4f] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#9b3f2f] transition hover:bg-[#f5d9d4] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {bookingLoading ? 'Cancelling...' : 'Cancel ride'}
                        </button>
                      </div>
                    </div>
                    {bookingError && (
                      <p className="text-xs font-semibold text-[#9b3f2f]">
                        {bookingError}
                      </p>
                    )}
                    <DriverCard
                      driver={activeBooking.driver}
                      isSelected
                      actionLabel="Reserved"
                    />
                    {startNotice && (
                      <div className="flex items-start gap-3 rounded-2xl border border-[#8b9a86] bg-[#e9f0e6] px-3 py-2 text-xs font-semibold text-[#4f5b4a]">
                        <span>{startNotice}</span>
                        <button
                          type="button"
                          onClick={() => setStartNotice('')}
                          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#c9b7a3] text-[10px] font-semibold text-[#5b4b3a] transition hover:bg-[#dfe8da]"
                          aria-label="Dismiss notice"
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-end gap-3 pr-8">
                      <button
                        type="button"
                        onClick={() => setSelectedDriverId(null)}
                        aria-label="Close selected driver"
                        className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#c9b7a3] text-[10px] font-semibold text-[#5b4b3a] transition hover:bg-[#efe5d8]"
                      >
                        x
                      </button>
                      <div className="flex flex-wrap gap-2">
                        {riderMeetupMapsUrl && (
                          <a
                            href={riderMeetupMapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-2xl border border-[#6a5a48] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#5b4b3a] transition hover:bg-[#efe5d8]"
                          >
                            Open in Google Maps
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={handleBookRide}
                          disabled={
                            bookingLoading ||
                            !selectedDriver ||
                            !riderLocation ||
                            !selectedDriver.meetingPoint
                          }
                          className="rounded-2xl bg-[#4f5b4a] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#f3efe6] transition hover:bg-[#434d3d] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {bookingLoading ? 'Booking...' : 'Confirm ride'}
                        </button>
                      </div>
                    </div>
                    {bookingError && (
                      <p className="text-xs font-semibold text-[#9b3f2f]">
                        {bookingError}
                      </p>
                    )}
                    <DriverCard
                      driver={selectedDriver}
                      isSelected
                      actionLabel="Selected"
                    />
                  </div>
                )}
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard className="h-[700px] overflow-hidden p-0">
            <div className="relative h-full w-full">
              <RiderSelectionMap
                key={mapDriver?.id || 'rider-map'}
                riderLocation={riderLocation}
                tripPolyline={mapDriver?.routePolyline || ''}
                meetingPoint={mapDriver?.meetingPoint || activeBooking?.meetingPoint}
                meetingEtaText={
                  mapDriver?.meetingEta
                    ? formatTime(mapDriver.meetingEta)
                    : activeBooking?.meetingEta
                      ? formatTime(activeBooking.meetingEta)
                      : ''
                }
                defaultCenter={defaultMapCenter}
                mapContainerStyle={riderMapContainerStyle}
              />
              {(!riderLocation || !mapDriver?.routePolyline) && (
                <div className="absolute bottom-6 left-6 inline-flex w-fit max-w-[70%] rounded-2xl border border-[#d7c5b1] bg-[#f7f0e6]/95 px-4 py-3 text-xs font-semibold text-[#5b4b3a] shadow-[0_12px_20px_rgba(68,54,41,0.2)]">
                  Set your pickup location and select a driver to see your route.
                </div>
              )}
            </div>
          </SurfaceCard>
        </div>
      </div>

      {isLocationPickerOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-6 py-8">
          <SurfaceCard className="w-full max-w-2xl space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6f604f]">
                  Pickup location
                </p>
                <p className="text-lg font-semibold text-[#3a3128]">
                  Choose where you will be waiting.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsLocationPickerOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d7c5b1] text-xs font-semibold text-[#6a5c4b]"
                aria-label="Close location picker"
              >
                x
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLocationMode('current')}
                  className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${
                    locationMode === 'current'
                      ? 'border-[#7a5d46] bg-[#efe5d8] text-[#3b3127]'
                      : 'border-[#c9b7a3] text-[#5b4b3a]'
                  }`}
                >
                  Your location
                </button>
                <button
                  type="button"
                  onClick={() => setLocationMode('address')}
                  className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${
                    locationMode === 'address'
                      ? 'border-[#7a5d46] bg-[#efe5d8] text-[#3b3127]'
                      : 'border-[#c9b7a3] text-[#5b4b3a]'
                  }`}
                >
                  Address
                </button>
              </div>

              {locationMode === 'current' ? (
                <button
                  type="button"
                  onClick={handleUseLocation}
                  className="rounded-2xl bg-[#4f5b4a] px-4 py-2 text-sm font-semibold text-[#f3efe6] shadow-[0_10px_20px_rgba(65,80,63,0.3)] transition hover:translate-y-[-1px] hover:bg-[#434d3d]"
                >
                  {isLocating ? 'Locating...' : 'Use my location'}
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    ref={locationInputRef}
                    value={locationAddress}
                    onChange={(event) => setLocationAddress(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleUseAddress();
                      }
                    }}
                    placeholder="Search an address"
                    className="w-72 rounded-2xl border border-[#c9b7a3] bg-[#f3ece3] px-4 py-2 text-sm font-semibold text-[#3a3128] focus:border-[#6f604f] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleUseAddress}
                    className="rounded-2xl border border-[#c9b7a3] px-3 py-2 text-sm font-semibold text-[#5b4b3a] transition hover:bg-[#efe5d8]"
                  >
                    {isGeocoding ? 'Searching...' : 'Use this address'}
                  </button>
                </div>
              )}

              {riderLocation && (
                <p className="text-xs text-[#5a4e41]">
                  Location saved. You can update it anytime.
                </p>
              )}
              {locationError && (
                <p className="text-xs font-semibold text-[#9b3f2f]">
                  {locationError}
                </p>
              )}
            </div>
          </SurfaceCard>
        </div>
      )}
    </PageFrame>
  );
}

export default RiderPage;

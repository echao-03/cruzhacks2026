import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLoadScript } from '@react-google-maps/api';
import DriverRouteMap from './DriverRouteMap';
import DriverCard from './components/DriverCard';
import { HeaderRow, PageFrame, SurfaceCard } from './components/ui';
import ProfileMenu from './components/ProfileMenu';
import { supabase } from './utils/supabase';
import { useProfile } from './hooks/useProfile';

const libraries = ['geometry', 'places'];
const driverStartStorageKey = 'slugrider.driverStart';
const tripStartStorageKey = 'slugrider.tripStartTimes';

const destinationOptions = [
  {
    id: 'EAST_REMOTE',
    label: 'East Remote',
    location: { lat: 36.990889, lng: -122.052833 },
  },
  {
    id: 'CORE_WEST',
    label: 'Core West',
    location: { lat: 36.999155, lng: -122.064145 },
  },
  {
    id: 'WEST_REMOTE',
    label: 'West Remote',
    location: { lat: 36.988587, lng: -122.066252 },
  },
];

const destinationLabels = {
  EAST_REMOTE: 'East Remote',
  CORE_WEST: 'Core West',
  WEST_REMOTE: 'West Remote',
};

const normalizePolyline = (overviewPolyline) => {
  if (!overviewPolyline) {
    return '';
  }

  if (typeof overviewPolyline === 'string') {
    return overviewPolyline;
  }

  return typeof overviewPolyline.points === 'string'
    ? overviewPolyline.points
    : '';
};

const encodeOverviewPath = (overviewPath) => {
  if (!overviewPath || !window.google?.maps?.geometry?.encoding?.encodePath) {
    return '';
  }

  return window.google.maps.geometry.encoding.encodePath(overviewPath);
};

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

const formatLocalDateTimeInput = (value) => {
  const pad = (num) => String(num).padStart(2, '0');
  const year = value.getFullYear();
  const month = pad(value.getMonth() + 1);
  const day = pad(value.getDate());
  const hours = pad(value.getHours());
  const minutes = pad(value.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const computeArrivalTime = (departureTime, durationSeconds) => {
  if (!departureTime || !durationSeconds) {
    return '';
  }

  const departure = new Date(departureTime);

  if (Number.isNaN(departure.getTime())) {
    return '';
  }

  return new Date(departure.getTime() + durationSeconds * 1000).toISOString();
};

function DriverNavigationPage() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const debugSchedule = import.meta.env.VITE_ROUTE_DEBUG === 'true';
  const logDebug = useCallback(
    (...args) => {
      if (debugSchedule) {
        console.info('[DriverNavigation]', ...args);
      }
    },
    [debugSchedule]
  );
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey,
    libraries,
  });

  const { profile } = useProfile();
  const [driverId, setDriverId] = useState(null);
  const [driverStart, setDriverStart] = useState(null);
  const [driverStartLabel, setDriverStartLabel] = useState('');
  const [scheduledTrips, setScheduledTrips] = useState([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [tripsError, setTripsError] = useState('');
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [tripActionError, setTripActionError] = useState('');
  const [tripActionMessage, setTripActionMessage] = useState('');
  const [tripActionLoading, setTripActionLoading] = useState(false);
  const [tripStartTimes, setTripStartTimes] = useState({});
  const [tripStops, setTripStops] = useState([]);
  const [stopsLoading, setStopsLoading] = useState(false);
  const [stopsError, setStopsError] = useState('');
  const [stopLabels, setStopLabels] = useState({});

  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    startMode: 'current',
    startAddress: '',
    destinationId: 'EAST_REMOTE',
    passengerCount: 2,
    departureTime: '',
  });
  const [isLocating, setIsLocating] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [routeOptions, setRouteOptions] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(null);
  const [selectedRoutePolyline, setSelectedRoutePolyline] = useState('');
  const [selectedRouteDuration, setSelectedRouteDuration] = useState(0);
  const [directionsResponse, setDirectionsResponse] = useState(null);
  const [routeError, setRouteError] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [isRouting, setIsRouting] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const addressInputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const departureWindow = useMemo(() => {
    const now = new Date();
    const max = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return {
      min: formatLocalDateTimeInput(now),
      max: formatLocalDateTimeInput(max),
    };
  }, []);

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
    const stored = localStorage.getItem(driverStartStorageKey);

    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      if (
        typeof parsed?.lat === 'number' &&
        typeof parsed?.lng === 'number'
      ) {
        setDriverStart({ lat: parsed.lat, lng: parsed.lng });
      }
    } catch (error) {
      localStorage.removeItem(driverStartStorageKey);
    }
  }, []);

  useEffect(() => {
    if (driverStart) {
      localStorage.setItem(driverStartStorageKey, JSON.stringify(driverStart));
    } else {
      localStorage.removeItem(driverStartStorageKey);
      setDriverStartLabel('');
    }
  }, [driverStart]);

  useEffect(() => {
    const stored = localStorage.getItem(tripStartStorageKey);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        setTripStartTimes(parsed);
      }
    } catch (error) {
      localStorage.removeItem(tripStartStorageKey);
    }
  }, []);

  useEffect(() => {
    const keys = Object.keys(tripStartTimes);
    if (keys.length === 0) {
      localStorage.removeItem(tripStartStorageKey);
      return;
    }

    localStorage.setItem(tripStartStorageKey, JSON.stringify(tripStartTimes));
  }, [tripStartTimes]);

  useEffect(() => {
    if (!driverStart || driverStartLabel) {
      return;
    }

    reverseGeocode(driverStart.lat, driverStart.lng, setDriverStartLabel);
  }, [driverStart, driverStartLabel, reverseGeocode]);

  const destination = useMemo(
    () =>
      destinationOptions.find((option) => option.id === scheduleForm.destinationId)
        ?.location || destinationOptions[0].location,
    [scheduleForm.destinationId]
  );

  useEffect(() => {
    setRouteOptions([]);
    setSelectedRouteIndex(null);
    setSelectedRoutePolyline('');
    setSelectedRouteDuration(0);
    setDirectionsResponse(null);
  }, [driverStart, scheduleForm.destinationId]);

  useEffect(() => {
    if (
      !destinationOptions.some((option) => option.id === scheduleForm.destinationId)
    ) {
      setScheduleForm((prev) => ({
        ...prev,
        destinationId: destinationOptions[0].id,
      }));
    }
  }, [scheduleForm.destinationId]);

  const selectedRoute = useMemo(
    () => routeOptions.find((route) => route.index === selectedRouteIndex) || null,
    [routeOptions, selectedRouteIndex]
  );

  useEffect(() => {
    if (selectedRoute?.polyline) {
      setScheduleError('');
    }
  }, [selectedRoute]);

  const estimatedArrivalTime = useMemo(
    () => computeArrivalTime(scheduleForm.departureTime, selectedRouteDuration),
    [scheduleForm.departureTime, selectedRouteDuration]
  );

  useEffect(() => {
    if (profile?.default_passengers) {
      const normalized = Number(profile.default_passengers);
      setScheduleForm((prev) => ({
        ...prev,
        passengerCount: Number.isNaN(normalized) ? prev.passengerCount : normalized,
      }));
    }
    if (
      profile?.pref_destination &&
      destinationOptions.some((option) => option.id === profile.pref_destination)
    ) {
      setScheduleForm((prev) => ({
        ...prev,
        destinationId: profile.pref_destination,
      }));
    }
  }, [profile]);

  const resolveCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setRouteError('Geolocation is not supported in this browser.');
      return;
    }

    setIsLocating(true);
    setRouteError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextStart = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setDriverStart(nextStart);
        reverseGeocode(nextStart.lat, nextStart.lng, setDriverStartLabel);
        setIsLocating(false);
      },
      (error) => {
        setRouteError(error.message || 'Unable to get current location.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [reverseGeocode]);

  const resolveAddressLocation = useCallback(async () => {
    if (!scheduleForm.startAddress.trim()) {
      setRouteError('Enter a start address to continue.');
      return;
    }

    if (!window.google?.maps?.Geocoder) {
      setRouteError('Google Maps is not ready.');
      return;
    }

    setIsGeocoding(true);
    setRouteError('');

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: scheduleForm.startAddress }, (results, status) => {
      if (status === 'OK' && results?.[0]?.geometry?.location) {
        const location = results[0].geometry.location;
        setDriverStart({ lat: location.lat(), lng: location.lng() });
        setDriverStartLabel(results[0].formatted_address || scheduleForm.startAddress);
      } else {
        setRouteError('Unable to find that address.');
        setDriverStart(null);
        setDriverStartLabel('');
      }
      setIsGeocoding(false);
    });
  }, [scheduleForm.startAddress]);

  useEffect(() => {
    if (!isLoaded || scheduleForm.startMode !== 'address') {
      if (autocompleteRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(
          autocompleteRef.current
        );
      }
      autocompleteRef.current = null;
      return;
    }

    if (!window.google?.maps?.places?.Autocomplete || !addressInputRef.current) {
      return;
    }

    const autocomplete = new window.google.maps.places.Autocomplete(
      addressInputRef.current,
      {
        fields: ['formatted_address', 'geometry'],
      }
    );

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      const location = place?.geometry?.location;

      if (!location) {
        setRouteError('Select a valid address from the suggestions.');
        setDriverStart(null);
        setDriverStartLabel('');
        return;
      }

      setScheduleForm((prev) => ({
        ...prev,
        startAddress: place.formatted_address || prev.startAddress,
      }));
      setDriverStart({ lat: location.lat(), lng: location.lng() });
      setDriverStartLabel(place.formatted_address || scheduleForm.startAddress);
      setRouteError('');
    });

    autocompleteRef.current = autocomplete;

    return () => {
      if (autocompleteRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(
          autocompleteRef.current
        );
      }
      autocompleteRef.current = null;
    };
  }, [isLoaded, scheduleForm.startMode]);

  const computeRoutes = useCallback(() => {
    if (!driverStart) {
      setRouteError('Set a start location first.');
      return;
    }

    if (!window.google?.maps?.DirectionsService) {
      setRouteError('Google Maps is not ready.');
      return;
    }

    logDebug('computeRoutes:start', { driverStart, destination });
    setIsRouting(true);
    setRouteError('');

    const service = new window.google.maps.DirectionsService();
    service.route(
      {
        origin: driverStart,
        destination,
        provideRouteAlternatives: true,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status !== 'OK' || !result?.routes?.length) {
          logDebug('computeRoutes:error', { status, result });
          setRouteError(
            status && status !== 'OK'
              ? `Unable to compute routes (${status}).`
              : 'Unable to compute routes.'
          );
          setIsRouting(false);
          return;
        }

        const mappedRoutes = result.routes
          .map((route, index) => {
            const leg = route.legs?.[0];
            let polyline = normalizePolyline(route.overview_polyline);

            if (!polyline && route.overview_path) {
              polyline = encodeOverviewPath(route.overview_path);
            }

            return {
              index,
              summary: route.summary || `Route ${index + 1}`,
              duration: leg?.duration?.value || 0,
              durationText: leg?.duration?.text || '—',
              distance: leg?.distance?.value || 0,
              distanceText: leg?.distance?.text || '—',
              polyline,
            };
          })
          .sort((a, b) => a.duration - b.duration);

        const baseline = mappedRoutes[0];
        const similarRoutes = mappedRoutes.filter(
          (route) =>
            route.duration <= baseline.duration * 1.2 &&
            route.distance <= baseline.distance * 1.2
        );
        const trimmedRoutes =
          similarRoutes.length >= 2
            ? similarRoutes.slice(0, 2)
            : similarRoutes.length === 1
              ? similarRoutes.slice(0, 1)
              : mappedRoutes.slice(0, 1);

        logDebug('computeRoutes:success', {
          status,
          routes: mappedRoutes,
          trimmedRoutes,
        });
        setRouteOptions(trimmedRoutes);
        setSelectedRouteIndex(trimmedRoutes[0]?.index ?? null);
        setSelectedRoutePolyline(trimmedRoutes[0]?.polyline || '');
        setSelectedRouteDuration(trimmedRoutes[0]?.duration || 0);
        setDirectionsResponse(result);
        setIsRouting(false);
      }
    );
  }, [driverStart, destination, logDebug]);

  useEffect(() => {
    if (
      !isScheduleOpen ||
      !isLoaded ||
      !driverStart ||
      isRouting ||
      routeOptions.length > 0
    ) {
      return;
    }

    computeRoutes();
  }, [
    isScheduleOpen,
    isLoaded,
    driverStart,
    isRouting,
    routeOptions.length,
    computeRoutes,
  ]);

  useEffect(() => {
    if (!isLoaded || !driverStart) {
      return;
    }

    computeRoutes();
  }, [computeRoutes, driverStart, isLoaded]);

  const refreshScheduledTrips = useCallback(async () => {
    setTripsLoading(true);
    setTripsError('');

    let currentDriverId = driverId;

    if (!currentDriverId) {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError) {
        setTripsError(userError.message);
        setTripsLoading(false);
        return null;
      }

      currentDriverId = userData?.user?.id;
      if (currentDriverId) {
        setDriverId(currentDriverId);
      }
    }

    if (!currentDriverId) {
      setTripsLoading(false);
      return null;
    }

    const { data, error } = await supabase
      .from('trips')
      .select(
        'id, destination, departure_time, estimated_arrival_time, total_seats, seats_taken, status, start_lat, start_lng, polyline'
      )
      .eq('driver_id', currentDriverId)
      .order('departure_time', { ascending: false });

    if (error) {
      setTripsError(error.message);
      setScheduledTrips([]);
    } else {
      setScheduledTrips(data || []);
    }

    setTripsLoading(false);
    return data || [];
  }, [driverId]);

  useEffect(() => {
    refreshScheduledTrips();
  }, [refreshScheduledTrips]);

  useEffect(() => {
    if (!driverId) {
      return undefined;
    }

    const channel = supabase
      .channel(`driver-trips:${driverId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips', filter: `driver_id=eq.${driverId}` },
        () => {
          refreshScheduledTrips();
        }
      );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, refreshScheduledTrips]);

  const selectedTrip = useMemo(
    () => scheduledTrips.find((trip) => trip.id === selectedTripId) || null,
    [scheduledTrips, selectedTripId]
  );

  useEffect(() => {
    if (scheduledTrips.length === 0) {
      setSelectedTripId(null);
      return;
    }

    if (
      selectedTripId &&
      !scheduledTrips.some((trip) => trip.id === selectedTripId)
    ) {
      setSelectedTripId(null);
    }
  }, [scheduledTrips, selectedTripId]);

  useEffect(() => {
    setTripStartTimes((prev) => {
      const prevKeys = Object.keys(prev);
      if (prevKeys.length === 0) {
        return prev;
      }

      const next = {};
      scheduledTrips.forEach((trip) => {
        if (prev[trip.id]) {
          next[trip.id] = prev[trip.id];
        }
      });

      const nextKeys = Object.keys(next);
      if (
        prevKeys.length === nextKeys.length &&
        prevKeys.every((key) => next[key] === prev[key])
      ) {
        return prev;
      }

      return next;
    });
  }, [scheduledTrips]);

  useEffect(() => {
    setTripActionError('');
    setTripActionMessage('');
  }, [selectedTripId]);

  const loadTripStops = useCallback(
    async (tripId) => {
      if (!tripId) {
        setTripStops([]);
        return;
      }

      setStopsLoading(true);
      setStopsError('');

      const { data, error } = await supabase
        .from('bookings')
        .select('id, pickup_lat, pickup_lng, created_at, status')
        .eq('trip_id', tripId)
        .eq('status', 'CONFIRMED')
        .order('created_at', { ascending: true });

      if (error) {
        setStopsError(error.message);
        setTripStops([]);
      } else {
        const uniqueStops = new Map();
        (data || []).forEach((stop) => {
          if (stop?.id && !uniqueStops.has(stop.id)) {
            uniqueStops.set(stop.id, stop);
          }
        });
        setTripStops(Array.from(uniqueStops.values()));
      }

      setStopsLoading(false);
    },
    []
  );

  useEffect(() => {
    if (!selectedTrip?.id) {
      setTripStops([]);
      setStopLabels({});
      return;
    }

    loadTripStops(selectedTrip.id);
  }, [selectedTrip?.id, loadTripStops]);

  useEffect(() => {
    if (!selectedTrip?.id) {
      return undefined;
    }

    const channel = supabase
      .channel(`trip-bookings:${selectedTrip.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `trip_id=eq.${selectedTrip.id}` },
        () => {
          loadTripStops(selectedTrip.id);
        }
      );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTrip?.id, loadTripStops]);

  useEffect(() => {
    if (!isLoaded || tripStops.length === 0) {
      return;
    }

    tripStops.forEach((stop) => {
      if (!stop?.id || stopLabels[stop.id]) {
        return;
      }

      const lat = Number(stop.pickup_lat);
      const lng = Number(stop.pickup_lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return;
      }

      reverseGeocode(lat, lng, (label) => {
        setStopLabels((prev) => {
          if (prev[stop.id]) {
            return prev;
          }
          return { ...prev, [stop.id]: label };
        });
      });
    });
  }, [tripStops, stopLabels, reverseGeocode, isLoaded]);

  const handleStartTrip = useCallback(async () => {
    if (!selectedTrip) {
      return;
    }

    setTripActionError('');
    setTripActionMessage('');
    setTripActionLoading(true);

    try {
      const { error } = await supabase
        .from('trips')
        .update({ status: 'IN_PROGRESS' })
        .eq('id', selectedTrip.id);

      if (error) {
        throw error;
      }

      setTripStartTimes((prev) => ({
        ...prev,
        [selectedTrip.id]: new Date().toISOString(),
      }));
      setTripActionMessage('Ride started. Riders can no longer book this trip.');
      refreshScheduledTrips();
    } catch (err) {
      setTripActionError(err?.message || 'Unable to start this ride.');
    } finally {
      setTripActionLoading(false);
    }
  }, [selectedTrip, refreshScheduledTrips]);

  const handleEndTrip = useCallback(async () => {
    if (!selectedTrip) {
      return;
    }

    setTripActionError('');
    setTripActionMessage('');
    setTripActionLoading(true);

    try {
      const { error: bookingsError } = await supabase
        .from('bookings')
        .delete()
        .eq('trip_id', selectedTrip.id);

      if (bookingsError) {
        throw bookingsError;
      }

      const { error } = await supabase
        .from('trips')
        .delete()
        .eq('id', selectedTrip.id);

      if (error) {
        throw error;
      }

      setTripStartTimes((prev) => {
        if (!prev[selectedTrip.id]) {
          return prev;
        }
        const next = { ...prev };
        delete next[selectedTrip.id];
        return next;
      });
      setTripActionMessage('Ride ended.');
      setSelectedTripId(null);
      refreshScheduledTrips();
    } catch (err) {
      setTripActionError(err?.message || 'Unable to end this ride.');
    } finally {
      setTripActionLoading(false);
    }
  }, [selectedTrip, refreshScheduledTrips]);

  const handleCancelTrip = useCallback(async () => {
    if (!selectedTrip) {
      return;
    }

    setTripActionError('');
    setTripActionMessage('');
    setTripActionLoading(true);

    try {
      const { error: bookingsError } = await supabase
        .from('bookings')
        .delete()
        .eq('trip_id', selectedTrip.id);

      if (bookingsError) {
        throw bookingsError;
      }

      const { error } = await supabase
        .from('trips')
        .delete()
        .eq('id', selectedTrip.id);

      if (error) {
        throw error;
      }

      setTripStartTimes((prev) => {
        if (!prev[selectedTrip.id]) {
          return prev;
        }
        const next = { ...prev };
        delete next[selectedTrip.id];
        return next;
      });
      setTripActionMessage('Ride canceled.');
      setSelectedTripId(null);
      refreshScheduledTrips();
    } catch (err) {
      setTripActionError(err?.message || 'Unable to cancel this ride.');
    } finally {
      setTripActionLoading(false);
    }
  }, [selectedTrip, refreshScheduledTrips]);

  const handleRefreshTrips = useCallback(async () => {
    await refreshScheduledTrips();
    if (selectedTripId) {
      await loadTripStops(selectedTripId);
    }
  }, [refreshScheduledTrips, selectedTripId, loadTripStops]);

  const handleScheduleDrive = useCallback(async () => {
    setScheduleError('');
    setScheduleMessage('');

    logDebug('schedule:start', {
      driverStart,
      scheduleForm,
      selectedRouteIndex,
      selectedRoute,
      selectedRoutePolyline,
      selectedRouteDuration,
      directionsRoutes: directionsResponse?.routes?.length || 0,
      routeError,
    });

    if (!driverStart) {
      setScheduleError('Set a start location before scheduling.');
      return;
    }

    if (!scheduleForm.departureTime) {
      setScheduleError('Choose a departure time.');
      return;
    }

    const resolvedRouteIndex =
      selectedRoute?.index ?? selectedRouteIndex ?? 0;
    const fallbackRoute = directionsResponse?.routes?.[resolvedRouteIndex];
    const fallbackPolyline =
      normalizePolyline(fallbackRoute?.overview_polyline) ||
      encodeOverviewPath(fallbackRoute?.overview_path);
    const resolvedPolyline =
      selectedRoute?.polyline ||
      selectedRoutePolyline ||
      fallbackPolyline ||
      '';
    const resolvedDuration =
      selectedRoute?.duration ||
      selectedRouteDuration ||
      fallbackRoute?.legs?.[0]?.duration?.value ||
      0;

    logDebug('schedule:resolved-route', {
      resolvedRouteIndex,
      resolvedPolylineLength: resolvedPolyline?.length || 0,
      resolvedDuration,
    });

    if (!resolvedPolyline) {
      logDebug('schedule:missing-polyline', {
        routeError,
        fallbackRoute,
      });
      setScheduleError(
        routeError || 'Missing route data. Set a start location and try again.'
      );
      return;
    }

    if (!scheduleForm.passengerCount || Number(scheduleForm.passengerCount) < 1) {
      setScheduleError('Passenger count must be at least 1.');
      return;
    }

    if (!scheduleForm.departureTime) {
      setScheduleError('Select a departure time within the next 24 hours.');
      return;
    }

    const departureDate = new Date(scheduleForm.departureTime);
    if (Number.isNaN(departureDate.getTime())) {
      setScheduleError('Select a valid departure time.');
      return;
    }

    const now = Date.now();
    const maxDeparture = now + 24 * 60 * 60 * 1000;
    if (
      departureDate.getTime() < now ||
      departureDate.getTime() > maxDeparture
    ) {
      setScheduleError('Departure time must be within the next 24 hours.');
      return;
    }

    const estimatedArrival = computeArrivalTime(
      scheduleForm.departureTime,
      resolvedDuration
    );

    if (!estimatedArrival) {
      setScheduleError('Unable to calculate estimated arrival time.');
      return;
    }

    setIsScheduling(true);

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      const driverId = userData?.user?.id;

      if (!driverId) {
        throw new Error('You must be logged in to schedule a drive.');
      }

      const payload = {
        driver_id: driverId,
        destination: scheduleForm.destinationId,
        start_lat: driverStart.lat,
        start_lng: driverStart.lng,
        polyline: resolvedPolyline,
        departure_time: new Date(scheduleForm.departureTime).toISOString(),
        estimated_arrival_time: estimatedArrival,
        total_seats: Number(scheduleForm.passengerCount),
        seats_taken: 0,
        status: 'SCHEDULED',
      };

      const { error: insertError } = await supabase.from('trips').insert(payload);

      if (insertError) {
        throw insertError;
      }

      setScheduleMessage('Drive scheduled. Riders can now see your trip.');
      setIsScheduleOpen(false);
      refreshScheduledTrips();
    } catch (err) {
      setScheduleError(err?.message || 'Unable to schedule drive.');
    } finally {
      setIsScheduling(false);
    }
  }, [
    debugSchedule,
    driverStart,
    scheduleForm,
    routeError,
    selectedRoute,
    selectedRouteIndex,
    directionsResponse,
    selectedRoutePolyline,
    selectedRouteDuration,
    refreshScheduledTrips,
  ]);

  const scheduledTripCards = useMemo(() => {
    return scheduledTrips.map((trip) => ({
      id: trip.id,
      name: profile?.full_name || profile?.username || 'You',
      destination: destinationLabels[trip.destination] || trip.destination,
      meetTime:
        trip.status === 'IN_PROGRESS'
          ? 'In progress'
          : `Departs ${formatTime(trip.departure_time)}`,
      arrivalTime: trip.estimated_arrival_time
        ? formatTime(trip.estimated_arrival_time)
        : '',
      availableSeats: Math.max(trip.total_seats - (trip.seats_taken || 0), 0),
      totalSeats: trip.total_seats || 0,
    }));
  }, [scheduledTrips, profile]);

  const selectedTripCard = useMemo(
    () =>
      scheduledTripCards.find((trip) => trip.id === selectedTripId) || null,
    [scheduledTripCards, selectedTripId]
  );

  const selectedTripDestination = useMemo(() => {
    if (!selectedTrip?.destination) {
      return null;
    }

    return (
      destinationOptions.find(
        (option) => option.id === selectedTrip.destination
      ) || null
    );
  }, [selectedTrip]);

  const driverStartDisplay = useMemo(() => {
    if (!driverStart) {
      return '';
    }

    return (
      driverStartLabel ||
      `${toFixedCoord(driverStart.lat)}, ${toFixedCoord(driverStart.lng)}`
    );
  }, [driverStart, driverStartLabel]);

  const selectedTripStops = useMemo(
    () =>
      tripStops
        .map((stop) => ({
          lat: Number(stop.pickup_lat),
          lng: Number(stop.pickup_lng),
        }))
        .filter((stop) => !Number.isNaN(stop.lat) && !Number.isNaN(stop.lng)),
    [tripStops]
  );

  const selectedTripStart = useMemo(() => {
    if (
      !selectedTrip ||
      selectedTrip.start_lat == null ||
      selectedTrip.start_lng == null
    ) {
      return null;
    }

    return {
      lat: Number(selectedTrip.start_lat),
      lng: Number(selectedTrip.start_lng),
    };
  }, [selectedTrip]);

  const selectedTripWaypoints = useMemo(() => {
    if (tripStops.length === 0) {
      return '';
    }

    return tripStops
      .map((stop) => `${toFixedCoord(stop.pickup_lat)},${toFixedCoord(stop.pickup_lng)}`)
      .join('|');
  }, [tripStops]);

  const selectedTripGoogleMapsUrl = useMemo(() => {
    if (
      !selectedTrip ||
      selectedTrip.start_lat == null ||
      selectedTrip.start_lng == null ||
      !selectedTripDestination?.location
    ) {
      return '';
    }

    const waypointsParam = selectedTripWaypoints
      ? `&waypoints=${encodeURIComponent(selectedTripWaypoints)}`
      : '';

    return `https://www.google.com/maps/dir/?api=1&origin=${toFixedCoord(
      selectedTrip.start_lat
    )},${toFixedCoord(selectedTrip.start_lng)}&destination=${toFixedCoord(
      selectedTripDestination.location.lat
    )},${toFixedCoord(
      selectedTripDestination.location.lng
    )}&travelmode=driving${waypointsParam}`;
  }, [selectedTrip, selectedTripDestination, selectedTripWaypoints]);

  const selectedTripStartTime = useMemo(() => {
    if (!selectedTrip?.id) {
      return '';
    }

    return typeof tripStartTimes[selectedTrip.id] === 'string'
      ? tripStartTimes[selectedTrip.id]
      : '';
  }, [selectedTrip, tripStartTimes]);

  const selectedTripDurationSeconds = useMemo(() => {
    if (!selectedTrip?.departure_time || !selectedTrip?.estimated_arrival_time) {
      return 0;
    }

    const depart = new Date(selectedTrip.departure_time);
    const arrival = new Date(selectedTrip.estimated_arrival_time);

    if (Number.isNaN(depart.getTime()) || Number.isNaN(arrival.getTime())) {
      return 0;
    }

    const seconds = Math.round((arrival.getTime() - depart.getTime()) / 1000);
    return seconds > 0 ? seconds : 0;
  }, [selectedTrip]);

  const selectedTripEtaTime = useMemo(() => {
    if (!selectedTripStartTime || !selectedTripDurationSeconds) {
      return '';
    }

    const started = new Date(selectedTripStartTime);
    if (Number.isNaN(started.getTime())) {
      return '';
    }

    return new Date(
      started.getTime() + selectedTripDurationSeconds * 1000
    ).toISOString();
  }, [selectedTripStartTime, selectedTripDurationSeconds]);

  const selectedTripEtaMessage = useMemo(() => {
    if (!selectedTrip) {
      return '';
    }

    if (selectedTrip.status === 'SCHEDULED') {
      return 'Waiting for scheduled time before starting trip.';
    }

    if (selectedTrip.status === 'IN_PROGRESS') {
      if (selectedTripEtaTime) {
        return `Started ${formatTime(
          selectedTripStartTime
        )} · ETA ${formatTime(selectedTripEtaTime)}`;
      }

      return 'Ride started. ETA pending.';
    }

    return '';
  }, [selectedTrip, selectedTripStartTime, selectedTripEtaTime]);

  const isTripStartDue = useMemo(() => {
    if (!selectedTrip?.departure_time || selectedTrip.status !== 'SCHEDULED') {
      return false;
    }

    const depart = new Date(selectedTrip.departure_time);
    if (Number.isNaN(depart.getTime())) {
      return false;
    }

    return depart.getTime() <= Date.now();
  }, [selectedTrip]);

  const defaultDriverMapCenter = useMemo(
    () => ({ lat: 36.9969, lng: -122.0552 }),
    []
  );
  const driverMapContainerStyle = useMemo(
    () => ({ width: '100%', height: '100%', borderRadius: '24px' }),
    []
  );

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
        title="Snag a Slug"
        action={
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsScheduleOpen(true)}
              className="rounded-2xl bg-[#6e5a46] px-4 py-2 text-sm font-semibold text-[#f7f0e6] transition hover:bg-[#5c4a39]"
            >
              Schedule drive
            </button>
            <Link
              to="/rider"
              className="rounded-2xl border border-[#c9b7a3] bg-[#f7f0e6] px-4 py-2 text-sm font-semibold text-[#5b4b3a] shadow-[0_12px_24px_rgba(68,54,41,0.18)] transition hover:bg-[#efe5d8]"
            >
              Switch to Rider
            </Link>
            <ProfileMenu />
          </div>
        }
      />

      <div className="mt-8 space-y-6">
        {(scheduleError || scheduleMessage) && (
          <SurfaceCard className="text-sm text-[#5a4e41]">
            {scheduleError && (
              <p className="text-sm font-semibold text-[#9b3f2f]">
                {scheduleError}
              </p>
            )}
            {scheduleMessage && <p>{scheduleMessage}</p>}
          </SurfaceCard>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2.3fr)_minmax(280px,1fr)]">
          <SurfaceCard className="h-[700px] overflow-hidden p-0">
            <div className="relative h-full w-full">
              {selectedTrip && selectedTrip.polyline ? (
                <DriverRouteMap
                  key={`trip-${selectedTrip.id}`}
                  driverStart={selectedTripStart}
                  destination={selectedTripDestination?.location}
                  routePolyline={selectedTrip.polyline}
                  stops={selectedTripStops}
                  useDirectionsService={false}
                  mapContainerStyle={driverMapContainerStyle}
                />
              ) : isScheduleOpen && driverStart && directionsResponse ? (
                <DriverRouteMap
                  key={`draft-${selectedRoute?.index ?? 'none'}`}
                  driverStart={driverStart}
                  destination={destination}
                  directionsResponse={directionsResponse}
                  routeIndex={selectedRoute?.index ?? 0}
                  useDirectionsService={false}
                  mapContainerStyle={driverMapContainerStyle}
                />
              ) : (
                <DriverRouteMap
                  key="driver-map"
                  defaultCenter={defaultDriverMapCenter}
                  useDirectionsService={false}
                  mapContainerStyle={driverMapContainerStyle}
                />
              )}
              {!selectedTrip && !isScheduleOpen && (
                <div className="absolute bottom-6 left-6 inline-flex w-fit max-w-[70%] rounded-2xl border border-[#d7c5b1] bg-[#f7f0e6]/95 px-4 py-3 text-xs font-semibold text-[#5b4b3a] shadow-[0_12px_20px_rgba(68,54,41,0.2)]">
                  Select a scheduled trip or open Schedule drive to preview a route.
                </div>
              )}
            </div>
          </SurfaceCard>

          <SurfaceCard className="flex h-[700px] flex-col">
            <div className="flex w-full items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6f604f]">
                  Scheduled trips
                </p>
                <p className="text-lg font-semibold text-[#3a3128]">
                  Your upcoming drives
                </p>
              </div>
              <button
                type="button"
                onClick={handleRefreshTrips}
                disabled={tripsLoading}
                className="rounded-2xl border border-[#c9b7a3] px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#5b4b3a] transition hover:bg-[#efe5d8] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {tripsLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            {!selectedTrip && (
              <div className="mt-4 flex-1 space-y-4 overflow-x-visible overflow-y-auto rounded-3xl bg-[#f7f0e6] px-5 pb-5 pt-5">
                {tripsLoading && (
                  <p className="text-sm text-[#6a5c4b]">Loading trips...</p>
                )}
                {!tripsLoading && tripsError && (
                  <p className="text-sm text-[#9b3f2f]">{tripsError}</p>
                )}
                {!tripsLoading && !tripsError && scheduledTripCards.length === 0 && (
                  <p className="text-sm text-[#6a5c4b]">
                    No scheduled trips yet.
                  </p>
                )}
                {!tripsLoading &&
                  !tripsError &&
                  scheduledTripCards.map((trip) => (
                    <DriverCard
                      key={trip.id}
                      driver={trip}
                      onSelect={() => setSelectedTripId(trip.id)}
                      isSelected={trip.id === selectedTripId}
                    />
                  ))}
              </div>
            )}
            {selectedTrip && (
              <div className="mt-4 rounded-2xl border border-[#d7c5b1] bg-[#f4ece0] p-4 relative">
                <button
                  type="button"
                  onClick={() => setSelectedTripId(null)}
                  aria-label="Close selected trip"
                  className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#c9b7a3] text-xs font-semibold text-[#5b4b3a] transition hover:bg-[#efe5d8]"
                >
                  x
                </button>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#6f604f]">
                        Selected trip
                      </p>
                      {isTripStartDue && (
                        <p className="text-xs font-semibold text-[#9b3f2f]">
                          Departure time passed. Start the ride now.
                        </p>
                      )}
                      {selectedTrip.status !== 'SCHEDULED' && (
                        <p className="text-xs text-[#6a5c4b]">
                          Status: {selectedTrip.status}
                        </p>
                      )}
                      {selectedTripEtaMessage && (
                        <p className="text-xs text-[#5a4e41]">
                          {selectedTripEtaMessage}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedTripGoogleMapsUrl && (
                        <a
                          href={selectedTripGoogleMapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-2xl border border-[#6a5a48] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#5b4b3a] transition hover:bg-[#efe5d8]"
                        >
                          Open in Google Maps
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={
                          selectedTrip.status === 'IN_PROGRESS'
                            ? handleEndTrip
                            : handleStartTrip
                        }
                        disabled={
                          tripActionLoading ||
                          (selectedTrip.status === 'SCHEDULED' && !isTripStartDue)
                        }
                        className="rounded-2xl bg-[#4f5b4a] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#f3efe6] transition hover:bg-[#434d3d] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {tripActionLoading
                          ? selectedTrip.status === 'IN_PROGRESS'
                            ? 'Ending...'
                            : 'Starting...'
                          : selectedTrip.status === 'IN_PROGRESS'
                            ? 'End ride'
                            : 'Start ride'}
                      </button>
                      {selectedTrip.status === 'SCHEDULED' && (
                        <button
                          type="button"
                          onClick={handleCancelTrip}
                          disabled={tripActionLoading}
                          className="rounded-2xl border border-[#b45d4f] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#9b3f2f] transition hover:bg-[#f5d9d4] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {tripActionLoading ? 'Canceling...' : 'Cancel ride'}
                        </button>
                      )}
                    </div>
                  </div>
                  {selectedTripCard && (
                    <DriverCard
                      driver={selectedTripCard}
                      isSelected
                      actionLabel={
                        selectedTrip.status === 'IN_PROGRESS'
                          ? 'In progress'
                          : 'Scheduled'
                      }
                    />
                  )}
                  <div className="rounded-2xl border border-[#d7c5b1] bg-[#f9f3ea] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6f604f]">
                      Stops
                    </p>
                    {stopsLoading && (
                      <p className="text-xs text-[#6a5c4b]">Loading stops...</p>
                    )}
                    {!stopsLoading && stopsError && (
                      <p className="text-xs font-semibold text-[#9b3f2f]">
                        {stopsError}
                      </p>
                    )}
                    {!stopsLoading && !stopsError && (
                      <div className="space-y-1">
                        {tripStops.length > 0 ? (
                          tripStops.map((stop, index) => (
                            <p key={stop.id} className="text-xs text-[#5a4e41]">
                              Stop {index + 1}:{' '}
                              {stopLabels[stop.id] ||
                                `${toFixedCoord(stop.pickup_lat)}, ${toFixedCoord(
                                  stop.pickup_lng
                                )}`}
                            </p>
                          ))
                        ) : (
                          <p className="text-xs text-[#6a5c4b]">
                            No pickup stops yet. Riders walk to your route.
                          </p>
                        )}
                        {selectedTripDestination && (
                          <p className="text-xs font-semibold text-[#3a3128]">
                            Destination: {selectedTripDestination.label}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  {tripActionError && (
                    <p className="text-xs font-semibold text-[#9b3f2f]">
                      {tripActionError}
                    </p>
                  )}
                  {tripActionMessage && (
                    <p className="text-xs font-semibold text-[#4f5b4a]">
                      {tripActionMessage}
                    </p>
                  )}
                </div>
              </div>
            )}
          </SurfaceCard>
        </div>
      </div>

      {isScheduleOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-6 py-8">
          <SurfaceCard className="w-full max-w-3xl space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6f604f]">
                  Schedule a drive
                </p>
                <p className="text-lg font-semibold text-[#3a3128]">
                  Set your route details
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsScheduleOpen(false)}
                className="rounded-full border border-[#d7c5b1] px-3 py-1 text-xs font-semibold text-[#6a5c4b]"
              >
                Close
              </button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]">
                    Start location
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setScheduleForm((prev) => ({
                          ...prev,
                          startMode: 'current',
                        }))
                      }
                      className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${
                        scheduleForm.startMode === 'current'
                          ? 'border-[#7a5d46] bg-[#efe5d8] text-[#3b3127]'
                          : 'border-[#c9b7a3] text-[#5b4b3a]'
                      }`}
                    >
                      Current
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setScheduleForm((prev) => ({
                          ...prev,
                          startMode: 'address',
                        }))
                      }
                      className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${
                        scheduleForm.startMode === 'address'
                          ? 'border-[#7a5d46] bg-[#efe5d8] text-[#3b3127]'
                          : 'border-[#c9b7a3] text-[#5b4b3a]'
                      }`}
                    >
                      Address
                    </button>
                  </div>
                  {scheduleForm.startMode === 'current' ? (
                    <button
                      type="button"
                      onClick={resolveCurrentLocation}
                      className="rounded-2xl bg-[#4f5b4a] px-4 py-2 text-sm font-semibold text-[#f3efe6] shadow-[0_10px_20px_rgba(65,80,63,0.3)] transition hover:translate-y-[-1px] hover:bg-[#434d3d]"
                    >
                      {isLocating ? 'Locating...' : 'Use current location'}
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <label
                        htmlFor="driver-start-address"
                        className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]"
                      >
                        Start address
                        <input
                          id="driver-start-address"
                          name="startAddress"
                          type="text"
                          ref={addressInputRef}
                          value={scheduleForm.startAddress}
                          onChange={(event) =>
                            setScheduleForm((prev) => ({
                              ...prev,
                              startAddress: event.target.value,
                            }))
                          }
                          placeholder="Enter a start address"
                          className="w-full rounded-2xl border border-[#c9b7a3] bg-[#f3ece3] px-4 py-2 text-sm font-semibold text-[#3a3128] focus:border-[#6f604f] focus:outline-none"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={resolveAddressLocation}
                        className="rounded-2xl border border-[#c9b7a3] px-4 py-2 text-sm font-semibold text-[#5b4b3a] transition hover:bg-[#efe5d8]"
                      >
                        {isGeocoding ? 'Searching...' : 'Use this address'}
                      </button>
                    </div>
                  )}
                  {driverStart && (
                    <p className="text-xs text-[#5a4e41]">
                      Selected: {driverStartDisplay}
                    </p>
                  )}
                </div>

                <label
                  htmlFor="driver-destination"
                  className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]"
                >
                  Destination
                  <select
                    id="driver-destination"
                    name="destinationId"
                    value={scheduleForm.destinationId}
                    onChange={(event) =>
                      setScheduleForm((prev) => ({
                        ...prev,
                        destinationId: event.target.value,
                      }))
                    }
                    className="rounded-2xl border border-[#c9b7a3] bg-[#f3ece3] px-4 py-2 text-sm font-semibold text-[#3a3128] focus:border-[#6f604f] focus:outline-none"
                  >
                    {destinationOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label
                  htmlFor="driver-departure-time"
                  className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]"
                >
                  Departure time
                  <input
                    id="driver-departure-time"
                    name="departureTime"
                    type="datetime-local"
                    value={scheduleForm.departureTime}
                    min={departureWindow.min}
                    max={departureWindow.max}
                    onChange={(event) =>
                      setScheduleForm((prev) => ({
                        ...prev,
                        departureTime: event.target.value,
                      }))
                    }
                    className="rounded-2xl border border-[#c9b7a3] bg-[#f3ece3] px-4 py-2 text-sm font-semibold text-[#3a3128] focus:border-[#6f604f] focus:outline-none"
                  />
                </label>

                <label
                  htmlFor="driver-passenger-count"
                  className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]"
                >
                  Passengers
                  <input
                    id="driver-passenger-count"
                    name="passengerCount"
                    type="number"
                    min="1"
                    max="6"
                    value={scheduleForm.passengerCount}
                    onChange={(event) =>
                      setScheduleForm((prev) => ({
                        ...prev,
                        passengerCount: event.target.value,
                      }))
                    }
                    className="rounded-2xl border border-[#c9b7a3] bg-[#f3ece3] px-4 py-2 text-sm font-semibold text-[#3a3128] focus:border-[#6f604f] focus:outline-none"
                  />
                </label>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]">
                      Route options
                    </p>
                    <p className="text-sm text-[#5d5044]">
                      Auto-populates once the start location is set.
                    </p>
                  </div>
                  {isRouting && (
                    <span className="text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]">
                      Finding routes...
                    </span>
                  )}
                </div>

                {routeError && (
                  <p className="text-xs font-semibold text-[#9b3f2f]">
                    {routeError}
                  </p>
                )}

                {routeOptions.length > 0 ? (
                  <div className="space-y-3">
                    {routeOptions.map((route) => (
                      <button
                        key={route.index}
                        type="button"
                        onClick={() => {
                          setSelectedRouteIndex(route.index);
                          setSelectedRoutePolyline(route.polyline || '');
                          setSelectedRouteDuration(route.duration || 0);
                        }}
                        className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                          route.index === selectedRouteIndex
                            ? 'border-[#7a5d46] bg-[#efe5d8] text-[#3b3127]'
                          : 'border-[#c9b7a3] text-[#5b4b3a] hover:bg-[#f7efe6]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{route.summary}</span>
                          <span className="text-xs text-[#6a5c4b]">
                            {route.distanceText}
                          </span>
                        </div>
                        <p className="text-xs text-[#6a5c4b]">
                          {route.durationText} · Similar route
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#6a5c4b]">
                    No route options yet. Set a start location to continue.
                  </p>
                )}

                <div className="rounded-2xl border border-[#d7c5b1] bg-[#f4ece0] p-4 text-sm text-[#5d5044]">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]">
                    Estimated arrival
                  </p>
                  <p className="text-lg font-semibold text-[#3a3128]">
                    {estimatedArrivalTime
                      ? formatTime(estimatedArrivalTime)
                      : '—'}
                  </p>
                  {selectedRoute?.duration && scheduleForm.departureTime && (
                    <p className="text-xs text-[#6a5c4b]">
                      Drive time {selectedRoute.durationText}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-[#6a5c4b]">
                {driverStart ? 'Start set' : 'Start not set'} ·{' '}
                {scheduleForm.departureTime ? 'Departure set' : 'Departure pending'}
              </div>
              {scheduleError && (
                <p className="text-xs font-semibold text-[#9b3f2f]">
                  {scheduleError}
                </p>
              )}
              <button
                type="button"
                onClick={handleScheduleDrive}
                disabled={isScheduling}
                className="rounded-2xl bg-[#6e5a46] px-4 py-2 text-sm font-semibold text-[#f7f0e6] transition hover:bg-[#5c4a39] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isScheduling ? 'Scheduling...' : 'Confirm schedule'}
              </button>
            </div>
          </SurfaceCard>
        </div>
      )}
    </PageFrame>
  );
}

export default DriverNavigationPage;

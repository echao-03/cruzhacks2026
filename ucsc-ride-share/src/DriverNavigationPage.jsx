import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLoadScript } from '@react-google-maps/api';
import DriverRouteMap from './DriverRouteMap';
import DriverCard from './components/DriverCard';
import { HeaderRow, PageFrame, SurfaceCard } from './components/ui';
import ProfileMenu from './components/ProfileMenu';
import { supabase } from './utils/supabase';
import { useProfile } from './hooks/useProfile';

const libraries = ['geometry'];

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

const formatDateTime = (value) => {
  if (!value) {
    return 'Not set';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return 'Not set';
  }

  return parsed.toLocaleString([], { hour: 'numeric', minute: '2-digit' });
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
  const [driverStart, setDriverStart] = useState(null);
  const [scheduledTrips, setScheduledTrips] = useState([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [tripsError, setTripsError] = useState('');

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

  const scheduleSummary = useMemo(() => {
    const destinationLabel =
      destinationLabels[scheduleForm.destinationId] || 'Destination';

    return {
      destinationLabel,
      departureTime: scheduleForm.departureTime,
      passengerCount: scheduleForm.passengerCount,
    };
  }, [scheduleForm]);

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

  const googleMapsUrl = useMemo(() => {
    if (!driverStart) {
      return '';
    }

    return `https://www.google.com/maps/dir/?api=1&origin=${toFixedCoord(
      driverStart.lat
    )},${toFixedCoord(driverStart.lng)}&destination=${toFixedCoord(
      destination.lat
    )},${toFixedCoord(destination.lng)}&travelmode=driving`;
  }, [driverStart, destination]);

  const appleMapsUrl = useMemo(() => {
    if (!driverStart) {
      return '';
    }

    return `https://maps.apple.com/?saddr=${toFixedCoord(
      driverStart.lat
    )},${toFixedCoord(driverStart.lng)}&daddr=${toFixedCoord(
      destination.lat
    )},${toFixedCoord(destination.lng)}&dirflg=d`;
  }, [driverStart, destination]);

  const resolveCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setRouteError('Geolocation is not supported in this browser.');
      return;
    }

    setIsLocating(true);
    setRouteError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDriverStart({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setIsLocating(false);
      },
      (error) => {
        setRouteError(error.message || 'Unable to get current location.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

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
      } else {
        setRouteError('Unable to find that address.');
      }
      setIsGeocoding(false);
    });
  }, [scheduleForm.startAddress]);

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

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError) {
      setTripsError(userError.message);
      setTripsLoading(false);
      return;
    }

    const driverId = userData?.user?.id;

    if (!driverId) {
      setTripsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('trips')
      .select(
        'id, destination, departure_time, estimated_arrival_time, total_seats, seats_taken, status'
      )
      .eq('driver_id', driverId)
      .order('departure_time', { ascending: false });

    if (error) {
      setTripsError(error.message);
      setScheduledTrips([]);
    } else {
      setScheduledTrips(data || []);
    }

    setTripsLoading(false);
  }, []);

  useEffect(() => {
    refreshScheduledTrips();
  }, [refreshScheduledTrips]);

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
      meetTime: `Departs ${formatTime(trip.departure_time)}`,
      availableSeats: Math.max(trip.total_seats - (trip.seats_taken || 0), 0),
      totalSeats: trip.total_seats || 0,
    }));
  }, [scheduledTrips, profile]);

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
        title="Driver Navigation"
        subtitle="Schedule a drive and share your route with riders."
        action={<ProfileMenu />}
      />

      <div className="mt-8 space-y-6">
        <SurfaceCard className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6f604f]">
              Current plan
            </p>
            <p className="text-sm font-semibold text-[#3a3128]">
              {scheduleSummary.destinationLabel} · {formatDateTime(scheduleSummary.departureTime)}
            </p>
            {driverStart ? (
              <p className="text-xs text-[#5a4e41]">
                Start: {toFixedCoord(driverStart.lat)}, {toFixedCoord(driverStart.lng)}
              </p>
            ) : (
              <p className="text-xs text-[#5a4e41]">Start: Not set</p>
            )}
            {selectedRoute?.durationText && (
              <p className="text-xs text-[#5a4e41]">
                ETA: {selectedRoute.durationText} · Arrive {formatTime(estimatedArrivalTime)}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setIsScheduleOpen(true)}
              className="rounded-2xl bg-[#6e5a46] px-4 py-2 text-sm font-semibold text-[#f7f0e6] transition hover:bg-[#5c4a39]"
            >
              Schedule drive
            </button>
            <a
              href={googleMapsUrl || '#'}
              target="_blank"
              rel="noreferrer"
              className={`rounded-2xl border px-4 py-2 text-sm font-semibold ${
                driverStart
                  ? 'border-[#6a5a48] text-[#5b4b3a] transition hover:bg-[#efe5d8]'
                  : 'cursor-not-allowed border-[#d8c9b9] text-[#b3a494]'
              }`}
            >
              Open in Google Maps
            </a>
            <a
              href={appleMapsUrl || '#'}
              target="_blank"
              rel="noreferrer"
              className={`rounded-2xl bg-[#4f5b4a] px-4 py-2 text-sm font-semibold text-[#f3efe6] transition hover:bg-[#434d3d] ${
                driverStart ? '' : 'pointer-events-none opacity-60'
              }`}
            >
              Open in Apple Maps
            </a>
          </div>
        </SurfaceCard>

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
          <SurfaceCard className="h-[640px] p-0">
            {driverStart && directionsResponse ? (
              <DriverRouteMap
                driverStart={driverStart}
                destination={destination}
                directionsResponse={directionsResponse}
                routeIndex={selectedRoute?.index ?? 0}
                useDirectionsService={false}
                mapContainerStyle={{ width: '100%', height: '100%' }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[#6a5c4b]">
                Set a start location to see your route here.
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard className="flex h-[640px] flex-col">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6f604f]">
                  Scheduled trips
                </p>
                <p className="text-lg font-semibold text-[#3a3128]">
                  Your upcoming drives
                </p>
              </div>
            </div>
            <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-2">
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
                  <DriverCard key={trip.id} driver={trip} />
                ))}
            </div>
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
                      Selected: {toFixedCoord(driverStart.lat)}, {toFixedCoord(driverStart.lng)}
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

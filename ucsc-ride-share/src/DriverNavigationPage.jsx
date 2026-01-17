import { useCallback, useMemo, useState } from 'react';
import { useLoadScript } from '@react-google-maps/api';
import DriverRouteMap from './DriverRouteMap';
import {
  HeaderRow,
  PageFrame,
  ProfileButton,
  SurfaceCard,
} from './components/ui';

const libraries = ['geometry'];

const destinationOptions = [
  {
    id: 'east-remote',
    label: 'East Remote',
    location: { lat: 36.990889, lng: -122.052833 },
  },
  {
    id: 'core-west',
    label: 'Core West',
    location: { lat: 36.999155, lng: -122.064145 },
  },
  {
    id: 'west-remote',
    label: 'West Remote',
    location: { lat: 36.988587, lng: -122.066252 },
  },
];

const toFixedCoord = (value) => Number(value).toFixed(6);

function DriverNavigationPage() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey,
    libraries,
  });

  const [destinationId, setDestinationId] = useState('east-remote');
  const [driverStart, setDriverStart] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [isLocating, setIsLocating] = useState(false);

  const destination = useMemo(
    () =>
      destinationOptions.find((option) => option.id === destinationId)
        ?.location || destinationOptions[0].location,
    [destinationId]
  );


  const handleUseLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported in this browser.');
      return;
    }

    setIsLocating(true);
    setLocationError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDriverStart({
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
        // subtitle="Live route guidance with map-based navigation."
        action={<ProfileButton />}
      />

      <div className="mt-8 space-y-6">
        <SurfaceCard className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6f604f]">
              Start here
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleUseLocation}
                className="rounded-2xl bg-[#4f5b4a] px-4 py-2 text-sm font-semibold text-[#f3efe6] shadow-[0_10px_20px_rgba(65,80,63,0.3)] transition hover:translate-y-[-1px] hover:bg-[#434d3d]"
              >
                {isLocating ? 'Locating...' : 'Use My Location'}
              </button>
              {driverStart && (
                <span className="text-sm text-[#5a4e41]">
                  {toFixedCoord(driverStart.lat)}, {toFixedCoord(driverStart.lng)}
                </span>
              )}
            </div>
            {locationError && (
              <p className="text-xs font-semibold text-[#9b3f2f]">
                {locationError}
              </p>
            )}
          </div>

          <label className="flex w-full max-w-xs flex-col gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]">
            Destination
            <select
              value={destinationId}
              onChange={(event) => setDestinationId(event.target.value)}
              className="rounded-2xl border border-[#c9b7a3] bg-[#f3ece3] px-4 py-2 text-sm font-semibold text-[#3a3128] focus:border-[#6f604f] focus:outline-none"
            >
              {destinationOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-3">
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
              className={`rounded-2xl bg-[#6e5a46] px-4 py-2 text-sm font-semibold text-[#f7f0e6] transition hover:bg-[#5c4a39] ${
                driverStart ? '' : 'pointer-events-none opacity-50'
              }`}
            >
              Open in Apple Maps
            </a>
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-4">
          <DriverRouteMap
            driverStart={driverStart}
            destination={destination}
            mapContainerStyle={{ width: '100%', height: '640px' }}
          />
        </SurfaceCard>
      </div>
    </PageFrame>
  );
}

export default DriverNavigationPage;

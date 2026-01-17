import { useCallback, useMemo, useState } from 'react';
import { useLoadScript } from '@react-google-maps/api';
import RiderSelectionMap from './RiderSelectionMap';
import DriverCard from './components/DriverCard';
import {
  GlassCard,
  HeaderRow,
  PageFrame,
  ProfileButton,
  SurfaceCard,
} from './components/ui';

const libraries = ['geometry'];

const destinationOptions = [
  { id: 'any', label: 'Any destination' },
  { id: 'east-remote', label: 'East Remote' },
  { id: 'core-west', label: 'Core West' },
  { id: 'west-remote', label: 'West Remote' },
];

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

function RiderPage() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey,
    libraries,
  });

  const [riderLocation, setRiderLocation] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [filters, setFilters] = useState({
    walkingDistance: '10',
    timeWindow: 'soonest',
    destination: 'any',
  });

  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [availableDrivers] = useState([]);

  const selectedDriver = useMemo(
    () => availableDrivers.find((driver) => driver.id === selectedDriverId) || null,
    [availableDrivers, selectedDriverId]
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
        // subtitle="Find a driver and walk to the closest pickup point."
        action={<ProfileButton />}
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
            {/* <p className="text-sm text-[#5d5044]">
              We match you to the closest point on the driver route.
            </p> */}
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
                    Time
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
              {availableDrivers.length === 0 ? (
                <p className="text-sm text-[#6a5c4b]">
                  No drivers available yet.
                </p>
              ) : (
                availableDrivers.map((driver) => (
                  <DriverCard
                    key={driver.id}
                    driver={driver}
                    onSelect={() => setSelectedDriverId(driver.id)}
                    isSelected={driver.id === selectedDriverId}
                  />
                ))
              )}
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-4">
            {riderLocation ? (
              <RiderSelectionMap
                riderLocation={riderLocation}
                tripPolyline={selectedDriver?.routePolyline || ''}
                mapContainerStyle={{ width: '100%', height: '640px' }}
              />
            ) : (
              <div className="flex h-[640px] items-center justify-center text-sm text-[#6a5c4b]">
                Enable location to see your pickup route.
              </div>
            )}
          </SurfaceCard>
        </div>
      </div>
    </PageFrame>
  );
}

export default RiderPage;

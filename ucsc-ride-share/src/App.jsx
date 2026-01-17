import { useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useLoadScript } from '@react-google-maps/api';
import Landing from './Landing';
import SignUp from './SignUp';
import Login from './Login';
import DriverRouteMap from './DriverRouteMap';
import RiderSelectionMap from './RiderSelectionMap';
import { GlassCard, PageFrame, PageHeader, SurfaceCard, cx } from './components/ui';
import { useRoutePolyline } from './hooks/useRoutePolyline';

const libraries = ['geometry'];

const demoDriverStart = { lat: 36.9741, lng: -122.0308 };
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
const demoDestination =
  destinationOptions.find((option) => option.id === 'east-remote')?.location ||
  destinationOptions[0].location;
const demoBookings = [
  { pickup_lat: 36.9814, pickup_lng: -122.0415 },
  { pickup_lat: 36.9862, pickup_lng: -122.0498 },
];

const demoRiderLocation = { lat: 36.9762, lng: -122.0296 };

function MapShell({ title, subtitle, children, contentClassName, width = 'wide' }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey,
    libraries,
  });

  if (!apiKey || loadError || !isLoaded) {
    const message = !apiKey
      ? 'Missing `VITE_GOOGLE_MAPS_API_KEY`.'
      : loadError
        ? 'Unable to load Google Maps.'
        : 'Loading map...';

    return (
      <PageFrame width={width}>
        <SurfaceCard className="max-w-lg text-sm text-[#4b4034]">
          {message}
        </SurfaceCard>
      </PageFrame>
    );
  }

  return (
    <PageFrame width={width}>
      <PageHeader title={title} subtitle={subtitle} />
      <div className={cx('mt-8', contentClassName)}>{children}</div>
    </PageFrame>
  );
}

function MapDemo() {
  const demoRouteWaypoints = useMemo(
    () =>
      demoBookings.map((booking) => ({
        location: { lat: booking.pickup_lat, lng: booking.pickup_lng },
        stopover: true,
      })),
    [demoBookings]
  );
  const demoRoutePolyline = useRoutePolyline({
    origin: demoDriverStart,
    destination: demoDestination,
    waypoints: demoRouteWaypoints,
  });

  return (
    <MapShell
      title="Route Previews"
      subtitle="Driver and rider views side by side."
      contentClassName="grid gap-6 lg:grid-cols-2"
    >
      <SurfaceCard className="space-y-4">
        <h3 className="text-lg font-semibold">Driver Route</h3>
        <DriverRouteMap
          driverStart={demoDriverStart}
          destination={demoDestination}
          bookings={demoBookings}
        />
      </SurfaceCard>
      <SurfaceCard className="space-y-4">
        <h3 className="text-lg font-semibold">Rider Pickup</h3>
        <RiderSelectionMap
          riderLocation={demoRiderLocation}
          tripPolyline={demoRoutePolyline}
        />
      </SurfaceCard>
    </MapShell>
  );
}

function DriverDemo() {
  const [directionsPanel, setDirectionsPanel] = useState(null);
  const directionsPanelRef = useRef(null);
  const [destinationId, setDestinationId] = useState('east-remote');

  const selectedDestination =
    destinationOptions.find((option) => option.id === destinationId) ||
    destinationOptions[0];

  useEffect(() => {
    if (directionsPanelRef.current) {
      setDirectionsPanel(directionsPanelRef.current);
    }
  }, []);

  return (
    <MapShell
      title="Driver Route"
      subtitle="Turn-by-turn guidance with a live route preview."
      contentClassName="space-y-6"
      width="full"
    >
      <SurfaceCard className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6f604f]">
            Destination
          </p>
          <p className="text-lg font-semibold text-[#3a3128]">
            Choose the endpoint
          </p>
        </div>
        <label className="flex w-full max-w-xs flex-col gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]">
          End point
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
      </SurfaceCard>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2.3fr)_minmax(280px,1fr)]">
        <SurfaceCard className="p-4">
          <DriverRouteMap
            driverStart={demoDriverStart}
            destination={selectedDestination.location}
            bookings={demoBookings}
            directionsPanel={directionsPanel}
            mapContainerStyle={{ width: '100%', height: '620px' }}
          />
        </SurfaceCard>
        <SurfaceCard className="flex h-[620px] flex-col bg-[#f1e5d8] text-sm text-[#3b3127]">
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6f604f]">
              Turn-by-turn
            </p>
            <p className="text-lg font-semibold text-[#3a3128]">
              Driving instructions
            </p>
          </div>
          <div
            ref={directionsPanelRef}
            className="directions-panel grow overflow-y-auto pr-2 text-sm"
          />
        </SurfaceCard>
      </div>
    </MapShell>
  );
}

function RiderDemo() {
  const [destinationId, setDestinationId] = useState('east-remote');
  const selectedDestination =
    destinationOptions.find((option) => option.id === destinationId) ||
    destinationOptions[0];
  const routeWaypoints = useMemo(
    () =>
      demoBookings.map((booking) => ({
        location: { lat: booking.pickup_lat, lng: booking.pickup_lng },
        stopover: true,
      })),
    [demoBookings]
  );

  const routePolyline = useRoutePolyline({
    origin: demoDriverStart,
    destination: selectedDestination.location,
    waypoints: routeWaypoints,
  });

  return (
    <MapShell
      title="Rider Pickup Spot"
      subtitle="Closest walk-up point along the driver route."
      contentClassName="grid gap-6 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] lg:items-start"
      width="full"
    >
      <GlassCard className="space-y-5 text-[#4b4034]">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#7a6b59]">
            Rider view
          </p>
          <h3 className="text-xl font-semibold text-[#3a3128]">Pickup spot</h3>
        </div>
        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]">
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
        <div className="space-y-3 text-sm text-[#5d5044]">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-[#c73f2f]" />
            Rider location
          </div>
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-[#2f7a46]" />
            Meet-up point
          </div>
          <div className="flex items-center gap-3">
            <span className="h-0.5 w-8 bg-[#3a6dd9]" />
            Driver route
          </div>
        </div>
      </GlassCard>
      <SurfaceCard className="p-4">
        <RiderSelectionMap
          riderLocation={demoRiderLocation}
          tripPolyline={routePolyline}
          mapContainerStyle={{ width: '100%', height: '620px' }}
        />
      </SurfaceCard>
    </MapShell>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/login" element={<Login />} />
      <Route path="/maps-demo" element={<MapDemo />} />
      <Route path="/driver-demo" element={<DriverDemo />} />
      <Route path="/rider-demo" element={<RiderDemo />} />
    </Routes>
  );
}

export default App;

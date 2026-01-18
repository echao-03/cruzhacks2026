import { useEffect, useMemo, useRef, useState } from 'react';
import { useProfile } from '../hooks/useProfile';
import { ProfileButton, SurfaceCard } from './ui';

const defaultPreferences = {
  preferredRole: 'rider',
  defaultPassengers: 2,
  walkingDistance: '10',
  timeWindow: 'soonest',
  destination: 'ANY',
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

const destinationOptions = [
  { id: 'ANY', label: 'Any destination' },
  { id: 'EAST_REMOTE', label: 'East Remote' },
  { id: 'CORE_WEST', label: 'Core West' },
  { id: 'WEST_REMOTE', label: 'West Remote' },
];

function ProfileMenu() {
  const { profile, error, updateProfile } = useProfile();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [formState, setFormState] = useState(defaultPreferences);

  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!profile) {
      return;
    }

    setFormState({
      preferredRole: profile.preferred_role || defaultPreferences.preferredRole,
      defaultPassengers:
        profile.default_passengers ?? defaultPreferences.defaultPassengers,
      walkingDistance:
        String(profile.pref_walk_minutes ?? defaultPreferences.walkingDistance),
      timeWindow: String(profile.pref_time_window ?? defaultPreferences.timeWindow),
      destination: profile.pref_destination || defaultPreferences.destination,
    });
  }, [profile]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const initials = useMemo(() => {
    const name = profile?.full_name || profile?.username || 'User';
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }, [profile]);

  const handleChange = (key) => (event) => {
    setFormState((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const handleRoleChange = (role) => {
    setFormState((prev) => ({ ...prev, preferredRole: role }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError('');

    try {
      await updateProfile({
        preferred_role: formState.preferredRole,
        default_passengers: Number(formState.defaultPassengers),
        pref_walk_minutes: Number(formState.walkingDistance),
        pref_time_window: formState.timeWindow,
        pref_destination: formState.destination,
      });
      setIsOpen(false);
    } catch (err) {
      setSaveError(err?.message || 'Unable to save preferences.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <ProfileButton
        label="Profile"
        initials={initials}
        onClick={() => setIsOpen((prev) => !prev)}
      />
      {isOpen && (
        <div className="absolute right-0 top-full z-20 mt-3 w-80">
          <SurfaceCard className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6f604f]">
                Profile settings
              </p>
              <p className="text-sm font-semibold text-[#3a3128]">
                {profile?.full_name || profile?.username || 'User'}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]">
                Mode
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleRoleChange('rider')}
                  className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${
                    formState.preferredRole === 'rider'
                      ? 'border-[#7a5d46] bg-[#efe5d8] text-[#3b3127]'
                      : 'border-[#c9b7a3] text-[#5b4b3a]'
                  }`}
                >
                  Rider
                </button>
                <button
                  type="button"
                  onClick={() => handleRoleChange('driver')}
                  className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${
                    formState.preferredRole === 'driver'
                      ? 'border-[#7a5d46] bg-[#efe5d8] text-[#3b3127]'
                      : 'border-[#c9b7a3] text-[#5b4b3a]'
                  }`}
                >
                  Driver
                </button>
              </div>
            </div>

            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]">
              Default passengers
              <input
                type="number"
                min="1"
                max="6"
                value={formState.defaultPassengers}
                onChange={handleChange('defaultPassengers')}
                className="rounded-2xl border border-[#c9b7a3] bg-[#f9f3ea] px-4 py-2 text-sm font-semibold text-[#3a3128] focus:border-[#6f604f] focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]">
              Walking distance
              <select
                value={formState.walkingDistance}
                onChange={handleChange('walkingDistance')}
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
                value={formState.timeWindow}
                onChange={handleChange('timeWindow')}
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
              Destination preference
              <select
                value={formState.destination}
                onChange={handleChange('destination')}
                className="rounded-2xl border border-[#c9b7a3] bg-[#f9f3ea] px-4 py-2 text-sm font-semibold text-[#3a3128] focus:border-[#6f604f] focus:outline-none"
              >
                {destinationOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {(saveError || error) && (
              <p className="text-xs font-semibold text-[#9b3f2f]">
                {saveError || error}
              </p>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="w-full rounded-2xl bg-[#4f5b4a] px-4 py-2 text-sm font-semibold text-[#f3efe6] shadow-[0_10px_20px_rgba(65,80,63,0.3)] transition hover:bg-[#434d3d] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSaving ? 'Saving...' : 'Save preferences'}
            </button>
          </SurfaceCard>
        </div>
      )}
    </div>
  );
}

export default ProfileMenu;

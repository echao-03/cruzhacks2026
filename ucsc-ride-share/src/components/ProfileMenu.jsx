import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useProfile } from '../hooks/useProfile';
import { ProfileButton, SurfaceCard } from './ui';

function ProfileMenu() {
  const { profile } = useProfile();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const wrapperRef = useRef(null);
  const navigate = useNavigate();

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

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setSignOutError('');

    const { error } = await supabase.auth.signOut();

    if (error) {
      setSignOutError(error.message);
    } else {
      setIsOpen(false);
      localStorage.removeItem('supabase_session');
      navigate('/', { replace: true });
    }

    setIsSigningOut(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <ProfileButton
        label="Profile"
        initials={initials}
        onClick={() => setIsOpen((prev) => !prev)}
      />
      {isOpen && (
        <div className="absolute right-0 top-full z-20 mt-3 w-72">
          <SurfaceCard className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6f604f]">
                Profile
              </p>
              <p className="text-sm font-semibold text-[#3a3128]">
                {profile?.full_name || profile?.username || 'User'}
              </p>
            </div>

            {signOutError && (
              <p className="text-xs font-semibold text-[#9b3f2f]">
                {signOutError}
              </p>
            )}

            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="w-full rounded-2xl bg-[#4f5b4a] px-4 py-2 text-sm font-semibold text-[#f3efe6] shadow-[0_10px_20px_rgba(65,80,63,0.3)] transition hover:bg-[#434d3d] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSigningOut ? 'Signing out...' : 'Log out'}
            </button>
          </SurfaceCard>
        </div>
      )}
    </div>
  );
}

export default ProfileMenu;

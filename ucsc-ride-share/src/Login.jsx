import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageFrame, PageHeader, SurfaceCard } from './components/ui';
import { supabase } from './utils/supabase';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const inputClassName =
    'rounded-2xl border border-[#c9b7a3] bg-[#f9f3ea] px-4 py-2 text-sm font-semibold text-[#3a3128] focus:border-[#6f604f] focus:outline-none';
  const labelClassName =
    'text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let emailToUse = username;

      // First, try to find the user by username in the profiles table
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('ucsc_email')
        .eq('username', username)
        .single();

      if (!profileError && profileData) {
        // Username found, use the associated email
        emailToUse = profileData.ucsc_email;
      }
      // If username not found, assume the input is an email and proceed

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      // Fetch user profile data
      const { data: profile, error: profileError2 } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileError2) {
        setError('Login successful but failed to load profile data.');
        return;
      }

      localStorage.setItem('supabase_session', JSON.stringify(data.session));
      
      // Navigate to rider selection map with user data
      navigate('/rider', { 
        state: { 
          user: data.user, 
          profile: profile 
        } 
      });
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageFrame>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:items-center">
        <div className="space-y-6">
          <PageHeader
            title="Welcome back to SlugCruise."
            subtitle="Log in to reserve your ride or manage driver schedules."
          />
          <div className="flex flex-wrap gap-3">
            <Link
              to="/"
              className="rounded-full border border-[#4d4135] px-5 py-2 text-sm font-semibold text-[#4d4135] transition hover:bg-[#4d4135] hover:text-[#f5efe6]"
            >
              Back to Home
            </Link>
            <Link
              to="/signup"
              className="rounded-full bg-[#6e5a46] px-5 py-2 text-sm font-semibold text-[#f7f0e6] transition hover:bg-[#5c4a39]"
            >
              Create Account
            </Link>
          </div>
        </div>

        <SurfaceCard className="space-y-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6f604f]">
              Log in
            </p>
            <p className="text-sm text-[#5a4e41]">
              Use your username or UCSC email to continue.
            </p>
          </div>
          {error && (
            <p className="rounded-2xl border border-[#e1b5ad] bg-[#f5d9d4] px-4 py-3 text-sm font-semibold text-[#9b3f2f]">
              {error}
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <label htmlFor="username" className="flex flex-col gap-2">
              <span className={labelClassName}>Username or Email</span>
              <input
                type="text"
                id="username"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClassName}
                required
              />
            </label>
            <label htmlFor="password" className="flex flex-col gap-2">
              <span className={labelClassName}>Password</span>
              <input
                type="password"
                id="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClassName}
                required
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-[#4f5b4a] px-4 py-3 text-sm font-semibold text-[#f3efe6] shadow-[0_10px_20px_rgba(65,80,63,0.3)] transition hover:translate-y-[-1px] hover:bg-[#434d3d] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Logging In...' : 'Log In'}
            </button>
          </form>
        </SurfaceCard>
      </div>
    </PageFrame>
  );
}

export default Login;

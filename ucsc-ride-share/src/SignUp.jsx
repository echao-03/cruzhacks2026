import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageFrame, PageHeader, SurfaceCard } from './components/ui';
import { supabase } from './utils/supabase';

function SignUp() {
  const [fullName, setFullName] = useState('');
  const [ucscEmail, setUcscEmail] = useState('');
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [carModel, setCarModel] = useState('');
  const [carColor, setCarColor] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userName, setUserName] = useState('');
  const inputClassName =
    'rounded-2xl border border-[#c9b7a3] bg-[#f9f3ea] px-4 py-2 text-sm font-semibold text-[#3a3128] focus:border-[#6f604f] focus:outline-none';
  const labelClassName =
    'text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const normalizedEmail = ucscEmail.trim().toLowerCase();
      if (!normalizedEmail.endsWith('.ucsc.edu')) {
        setError('Please use your .ucsc.edu email address to sign up.');
        return;
      }

      // Sign up with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        username: userName,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      const userId = authData?.user?.id;

      if (!userId) {
        setError(
          'Sign-up succeeded, but no session is available yet. Please confirm your email and log in.'
        );
        return;
      }

      // Insert profile data
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          full_name: fullName,
          ucsc_email: ucscEmail,
          gender,
          age: parseInt(age),
          car_model: carModel || null,
          car_color: carColor || null,
          license_plate: licensePlate || null,
          password: password || null,
          username: userName || null,
        });

      if (profileError) {
        setError(
          profileError.message ||
            'Account created but profile setup failed. Please contact support.'
        );
        return;
      }

      // Optionally redirect to login
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageFrame>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] lg:items-start">
        <div className="space-y-6">
          <PageHeader
            title="Create your SlugCruise profile."
            subtitle="Set your ride preferences now and tweak them later."
          />
          <div className="flex flex-wrap gap-3">
            <Link
              to="/login"
              className="rounded-full bg-[#6e5a46] px-5 py-2 text-sm font-semibold text-[#f7f0e6] transition hover:bg-[#5c4a39]"
            >
              Log In
            </Link>
          </div>
        </div>

        <SurfaceCard className="space-y-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6f604f]">
              Sign up
            </p>
            <p className="text-sm text-[#5a4e41]">
              All fields required unless marked optional.
            </p>
          </div>
          {error && (
            <p className="rounded-2xl border border-[#e1b5ad] bg-[#f5d9d4] px-4 py-3 text-sm font-semibold text-[#9b3f2f]">
              {error}
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label htmlFor="userName" className="flex flex-col gap-2">
                <span className={labelClassName}>Username</span>
                <input
                  type="text"
                  id="userName"
                  name="userName"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className={inputClassName}
                  required
                />
              </label>
              <label htmlFor="fullName" className="flex flex-col gap-2">
                <span className={labelClassName}>Full Name</span>
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClassName}
                  required
                />
              </label>
              <label htmlFor="ucscEmail" className="flex flex-col gap-2 sm:col-span-2">
                <span className={labelClassName}>UCSC Email</span>
                <input
                  type="email"
                  id="ucscEmail"
                  name="ucscEmail"
                  value={ucscEmail}
                  onChange={(e) => setUcscEmail(e.target.value)}
                  className={inputClassName}
                  required
                />
              </label>
              <label htmlFor="password" className="flex flex-col gap-2 sm:col-span-2">
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
              <label htmlFor="gender" className="flex flex-col gap-2">
                <span className={labelClassName}>Gender</span>
                <select
                  id="gender"
                  name="gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className={inputClassName}
                  required
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </label>
              <label htmlFor="age" className="flex flex-col gap-2">
                <span className={labelClassName}>Age</span>
                <input
                  type="number"
                  id="age"
                  name="age"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className={inputClassName}
                  required
                  min="18"
                  max="100"
                />
              </label>
            </div>

            <div className="space-y-4 rounded-2xl border border-[#d7c5b1] bg-[#f4ece0] p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#6f604f]">
                  Driver details
                </p>
                <p className="text-xs text-[#6a5c4b]">Optional information for drivers.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label htmlFor="carModel" className="flex flex-col gap-2">
                  <span className={labelClassName}>Car Model</span>
                  <input
                    type="text"
                    id="carModel"
                    name="carModel"
                    value={carModel}
                    onChange={(e) => setCarModel(e.target.value)}
                    className={inputClassName}
                  />
                </label>
                <label htmlFor="carColor" className="flex flex-col gap-2">
                  <span className={labelClassName}>Car Color</span>
                  <input
                    type="text"
                    id="carColor"
                    name="carColor"
                    value={carColor}
                    onChange={(e) => setCarColor(e.target.value)}
                    className={inputClassName}
                  />
                </label>
                <label
                  htmlFor="licensePlate"
                  className="flex flex-col gap-2 sm:col-span-2"
                >
                  <span className={labelClassName}>License Plate</span>
                  <input
                    type="text"
                    id="licensePlate"
                    name="licensePlate"
                    value={licensePlate}
                    onChange={(e) => setLicensePlate(e.target.value)}
                    className={inputClassName}
                  />
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-[#4f5b4a] px-4 py-3 text-sm font-semibold text-[#f3efe6] shadow-[0_10px_20px_rgba(65,80,63,0.3)] transition hover:translate-y-[-1px] hover:bg-[#434d3d] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Signing Up...' : 'Sign Up'}
            </button>
          </form>
        </SurfaceCard>
      </div>
    </PageFrame>
  );
}

export default SignUp;

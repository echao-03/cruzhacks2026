import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from './utils/supabase';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

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

      alert('Login successful!');
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
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Log In</h2>
        {error && <p className="text-red-500 text-center mb-4">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="username">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline"
              required
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              type="submit"
              disabled={loading}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50"
            >
              {loading ? 'Logging In...' : 'Log In'}
            </button>
            <Link to="/" className="inline-block align-baseline font-bold text-sm text-blue-500 hover:text-blue-800">
              Back to Home
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;
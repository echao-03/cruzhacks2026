import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';

function useProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError('');

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError) {
      setError(userError.message);
      setLoading(false);
      return;
    }

    const userId = userData?.user?.id;

    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError) {
      setError(profileError.message);
      setProfile(null);
    } else {
      setProfile(data);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const updateProfile = useCallback(async (updates) => {
    setError('');

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError) {
      setError(userError.message);
      throw userError;
    }

    const userId = userData?.user?.id;

    if (!userId) {
      const authError = new Error('Missing user id.');
      setError(authError.message);
      throw authError;
    }

    const { data, error: updateError } = await supabase
      .from('profiles')
      .upsert({ id: userId, ...updates })
      .select()
      .single();

    if (updateError) {
      setError(updateError.message);
      throw updateError;
    }

    setProfile(data);
    return data;
  }, []);

  return { profile, loading, error, refresh: loadProfile, updateProfile };
}

export { useProfile };

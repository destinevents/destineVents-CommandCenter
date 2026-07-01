(function () {
  const SUPABASE_URL = 'https://mgyucjvsjaaraeawblwt.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1neXVjanZzamFhcmFlYXdibHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjMwMTIsImV4cCI6MjA5NzQzOTAxMn0.kOjFQ5P8pWfZX3anq7soVoFC5ltILN554rrMazEbWno';

  const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  window.signIn = async function (email, password) {
    try {
      const { data, error } = await _sb.auth.signInWithPassword({ email, password });
      if (error) return { data: null, error };
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  };

  window.signUp = async function (email, password, meta) {
    try {
      const { data, error } = await _sb.auth.signUp({
        email,
        password,
        options: { data: meta || {} },
      });
      if (error) return { data: null, error };
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  };

  window.signOut = async function () {
    await _sb.auth.signOut();
  };

  window.getSession = async function () {
    try {
      const {
        data: { session },
      } = await _sb.auth.getSession();
      return session;
    } catch (err) {
      return null;
    }
  };
})();

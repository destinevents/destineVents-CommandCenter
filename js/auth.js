(function () {
  const SUPABASE_URL = 'https://mgyucjvsjaaraeawblwt.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1neXVjanZzamFhcmFlYXdibHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjMwMTIsImV4cCI6MjA5NzQzOTAxMn0.kOjFQ5P8pWfZX3anq7soVoFC5ltILN554rrMazEbWno';

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Expose sb globally so all plain-JS service files (clientService, userService, etc.) can use it
  window.sb = sb;

  window.signIn = async function (email, password) {
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return { data: null, error };
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  };

  window.signUp = async function (email, password, meta) {
    try {
      const { data, error } = await sb.auth.signUp({
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
    await sb.auth.signOut();
  };

  window.getSession = async function () {
    try {
      const {
        data: { session },
      } = await sb.auth.getSession();
      return session;
    } catch (err) {
      return null;
    }
  };

  window.getCurrentUser = async function () {
    try {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (!session?.user) return null;
      const { data: profile } = await sb
        .from('intern_users')
        .select('*')
        .eq('id', session.user.id)
        .single();
      return {
        ...session.user,
        ...(profile || {}),
        id: session.user.id,
        name: profile?.name || session.user.user_metadata?.name || null,
        role: profile?.role || 'intern',
      };
    } catch (err) {
      return null;
    }
  };
})();

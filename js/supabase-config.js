/**
 * Supabase Client Configuration
 *
 * Explicit auth options so the session reliably survives page reloads / tab
 * close-and-reopen without the user having to log in again. Default Supabase
 * v2 already has all of these on — making them explicit guards against any
 * future SDK upgrade silently changing defaults.
 */
window.GC = window.GC || {};

GC.SUPABASE_URL = 'https://oixcigvkswgzrnvkbrwk.supabase.co';
GC.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9peGNpZ3Zrc3dnenJudmticndrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1ODY3MjksImV4cCI6MjA5MTE2MjcyOX0.M7PwZnaNKtHJaDhPAQ9IEu8LgUBg3LB_lehF8C-gjy8';

GC.supabase = window.supabase.createClient(GC.SUPABASE_URL, GC.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,        // store tokens in localStorage
    autoRefreshToken: true,      // silently refresh access token before expiry
    detectSessionInUrl: true,    // handle magic-link / OAuth callbacks
    storage: window.localStorage,
    storageKey: 'yxd-auth-v1',   // unique key — never collide with other apps
    flowType: 'pkce',            // more resilient on flaky networks
  },
});

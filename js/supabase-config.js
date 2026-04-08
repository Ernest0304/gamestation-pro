/**
 * Supabase Client Configuration
 */
window.GC = window.GC || {};

GC.SUPABASE_URL = 'https://oixcigvkswgzrnvkbrwk.supabase.co';
GC.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9peGNpZ3Zrc3dnenJudmticndrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1ODY3MjksImV4cCI6MjA5MTE2MjcyOX0.M7PwZnaNKtHJaDhPAQ9IEu8LgUBg3LB_lehF8C-gjy8';

GC.supabase = window.supabase.createClient(GC.SUPABASE_URL, GC.SUPABASE_ANON_KEY);

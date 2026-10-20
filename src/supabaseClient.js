import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://wnxeuhdxqfmeflyohsto.supabase.co"
const supabaseKey = "sb_publishable_UxihUApkQt7pJDQoZxDRrw_481AVJxj"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndueGV1aGR4cWZtZWZseW9oc3RvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTE1ODQsImV4cCI6MjA5NzI4NzU4NH0.MJonrtpTEtemigQRmzsXKbxAXVoaP_PMDzI8yOV_FE8"

export const supabase = createClient(supabaseUrl, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
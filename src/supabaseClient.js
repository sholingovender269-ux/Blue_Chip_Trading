import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://wnxeuhdxqfmeflyohsto.supabase.co"
const supabaseKey = "sb_publishable_UxihUApkQt7pJDQoZxDRrw_481AVJxj"

export const supabase = createClient(supabaseUrl, supabaseKey)
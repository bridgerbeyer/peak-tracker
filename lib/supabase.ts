import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type Issue = {
  id: number
  created_at: string
  area: string
  unit: string | null
  category: string
  priority: 'Normal' | 'High' | 'Critical'
  description: string
  status: 'Open' | 'In progress' | 'Done'
  photos: string[]
  ai_insight: string | null
  logged_by: string | null
}

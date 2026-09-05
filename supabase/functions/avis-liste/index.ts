// =====================================================
// SANCTUARYS · Edge Function · avis-liste
// Renvoie les avis publies par les clientes (livre d'or public).
// Ne renvoie jamais d'email, uniquement le prenom et l'avis.
// =====================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data, error } = await admin
      .from('avis_clientes')
      .select('client_prenom, ressenti, avis_text, created_at')
      .eq('publie', true)
      .not('avis_text', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) return json({ error: error.message }, 500)

    return json({ success: true, avis: data || [] })
  } catch (err: any) {
    console.error('avis-liste error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

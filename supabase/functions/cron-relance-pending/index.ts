// =====================================================
// SANCTUARYS · Edge Function · cron-relance-pending
// Tourne chaque jour, relance auto les Fondatrices pending depuis 48h+
// Maximum 3 relances par signup, espacées de 4 jours
// =====================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    // Trouve les Fondatrices à relancer :
    // 1. status = pending
    // 2. créée il y a plus de 48h
    // 3. JAMAIS relancée (relance_count = 0)
    // → Une seule relance dans la vie d'un signup, pas de spam
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    const { data: candidates, error } = await admin
      .from('club_signups')
      .select('id, prenom, nom, email, created_at, relance_count, last_relance_at')
      .eq('status', 'pending')
      .lt('created_at', cutoff48h)
      .eq('relance_count', 0)
      .order('created_at')

    if (error) {
      console.error('Query error:', error)
      return json({ error: error.message }, 500)
    }

    if (!candidates || candidates.length === 0) {
      return json({ success: true, relances_sent: 0, message: 'Aucune nouvelle Fondatrice à relancer aujourd\'hui' })
    }

    const filtered = candidates

    // Appelle club-relance-paiement pour chacune
    const results = []
    for (const c of filtered) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/club-relance-paiement`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey
          },
          body: JSON.stringify({ signup_id: c.id })
        })
        const body = await resp.json()
        if (resp.ok && body.success) {
          // club-relance-paiement a déjà incrémenté le compteur côté DB
          results.push({ id: c.id, prenom: c.prenom, status: 'sent', new_count: (c.relance_count || 0) + 1 })
        } else {
          results.push({ id: c.id, prenom: c.prenom, status: 'failed', error: body.error })
        }
      } catch (err: any) {
        results.push({ id: c.id, prenom: c.prenom, status: 'error', error: err.message })
      }
    }

    return json({
      success: true,
      relances_sent: results.filter(r => r.status === 'sent').length,
      relances_failed: results.filter(r => r.status !== 'sent').length,
      details: results,
      timestamp: new Date().toISOString()
    })
  } catch (err: any) {
    console.error('cron-relance-pending error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

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
    // 3. dernière relance il y a plus de 4 jours (ou jamais relancée)
    // 4. moins de 3 relances déjà envoyées
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const cutoff4j = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()

    const { data: candidates, error } = await admin
      .from('club_signups')
      .select('id, prenom, nom, email, created_at, relance_count, last_relance_at')
      .eq('status', 'pending')
      .lt('created_at', cutoff48h)
      .lt('relance_count', 3)
      .order('created_at')

    if (error) {
      console.error('Query error:', error)
      return json({ error: error.message }, 500)
    }

    if (!candidates || candidates.length === 0) {
      return json({ success: true, relances_sent: 0, message: 'Aucune Fondatrice à relancer aujourd\'hui' })
    }

    const filtered = candidates.filter(c => {
      if (!c.last_relance_at) return true
      return c.last_relance_at < cutoff4j
    })

    if (filtered.length === 0) {
      return json({ success: true, relances_sent: 0, message: 'Toutes les pending ont été relancées récemment' })
    }

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

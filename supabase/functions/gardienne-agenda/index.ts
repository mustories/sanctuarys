// =====================================================
// SANCTUARYS · Edge Function · gardienne-agenda
// Renvoie a l'espace des gardiennes (Charlotte, Manthyta) l'agenda
// unifie (rendez vous publics + seances Fondatrices) pour qu'elles
// puissent cliquer directement sur une cliente et faire son bilan.
// Protege par le mot de passe partage, lecture via service role car
// les seances Fondatrices (session_bookings) ne sont pas lisibles
// en anonyme (RLS reservee au membre + admin).
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
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const gardiennePassword = Deno.env.get('GARDIENNE_PASSWORD')
    if (!gardiennePassword) return json({ error: 'GARDIENNE_PASSWORD non configurée' }, 500)

    const { mot_de_passe } = await req.json()
    if (mot_de_passe !== gardiennePassword) return json({ error: 'Mot de passe incorrect' }, 401)

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const since = new Date(Date.now() - 3 * 86400000).toISOString()
    const until = new Date(Date.now() + 30 * 86400000).toISOString()

    const [club, publics, gard, bilans] = await Promise.all([
      admin.from('session_bookings')
        .select('id, start_at, end_at, status, gardienne_id, treatment_types(name), profiles:member_id(prenom, nom, phone, email)')
        .gte('start_at', since).lte('start_at', until)
        .in('status', ['confirmed', 'completed'])
        .order('start_at', { ascending: true }),
      admin.from('appointments')
        .select('id, start_at, duration_minutes, status, gardienne_id, client_prenom, client_nom, client_email, client_phone')
        .gte('start_at', since).lte('start_at', until)
        .in('status', ['confirmed', 'completed'])
        .order('start_at', { ascending: true }),
      admin.from('gardiennes').select('id, prenom').eq('active', true).order('prenom'),
      admin.from('bilans').select('appointment_id, session_booking_id, created_at')
    ])

    if (club.error || publics.error) {
      return json({ error: (club.error || publics.error)?.message || 'Lecture agenda impossible' }, 500)
    }

    const bilanApptIds = new Set((bilans.data || []).filter(b => b.appointment_id).map(b => b.appointment_id))
    const bilanBookingIds = new Set((bilans.data || []).filter(b => b.session_booking_id).map(b => b.session_booking_id))

    const desClub = (club.data || []).map((b: any) => ({
      source: 'club',
      id: b.id,
      start_at: b.start_at,
      end_at: b.end_at,
      status: b.status,
      prenom: b.profiles?.prenom || '',
      nom: b.profiles?.nom || '',
      email: b.profiles?.email || '',
      phone: b.profiles?.phone || '',
      soin: b.treatment_types?.name || 'Soin',
      gardienne_id: b.gardienne_id || null,
      a_deja_un_bilan: bilanBookingIds.has(b.id)
    }))

    const desPublics = (publics.data || []).map((a: any) => ({
      source: 'public',
      id: a.id,
      start_at: a.start_at,
      end_at: a.start_at ? new Date(new Date(a.start_at).getTime() + (a.duration_minutes || 60) * 60000).toISOString() : null,
      status: a.status,
      prenom: a.client_prenom || '',
      nom: a.client_nom || '',
      email: a.client_email || '',
      phone: a.client_phone || '',
      soin: 'V-Steam · rendez vous public',
      gardienne_id: a.gardienne_id || null,
      a_deja_un_bilan: bilanApptIds.has(a.id)
    }))

    const bookings = desClub.concat(desPublics).sort((x, y) => new Date(x.start_at).getTime() - new Date(y.start_at).getTime())

    return json({ success: true, bookings, gardiennes: gard.data || [] })
  } catch (err: any) {
    console.error('gardienne-agenda error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

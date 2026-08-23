// =====================================================
// SANCTUARYS · Edge Function · rdv-create-checkout
// Cree une session Stripe pour un rendez-vous public (66€)
// Genere l'appointment en 'pending_payment' puis passe a 'confirmed' via webhook
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
  if (req.method !== 'POST') return json({ error: 'Methode non autorisee' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey) return json({ error: 'STRIPE_SECRET_KEY non configuree' }, 500)

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const body = await req.json()
    const {
      sanctuary_id, start_at,
      prenom, nom, email, phone, ville,
      notes, allaitement
    } = body

    if (!sanctuary_id || !start_at || !prenom || !nom || !email || !phone) {
      return json({ error: 'Champs obligatoires manquants : sanctuary, creneau, prenom, nom, email, telephone' }, 400)
    }

    // Verifie que le creneau est libre (60 min, statut non annule)
    const startDate = new Date(start_at)
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000)

    const { data: conflicting } = await admin
      .from('appointments')
      .select('id, status, created_at')
      .eq('sanctuary_id', sanctuary_id)
      .gte('start_at', new Date(startDate.getTime() - 60 * 60 * 1000).toISOString())
      .lte('start_at', endDate.toISOString())
      .in('status', ['pending_payment', 'confirmed', 'in_progress'])

    const stillActive = (conflicting || []).filter((c: any) => {
      if (c.status === 'pending_payment') {
        // Un pending_payment est verrouille pendant 30 min
        return (Date.now() - new Date(c.created_at).getTime()) < 30 * 60 * 1000
      }
      return true
    })

    if (stillActive.length > 0) {
      return json({ error: 'Ce creneau vient d\'etre reserve, choisis-en un autre.' }, 409)
    }

    // Sanctuary info pour metadata
    const { data: sanctuary } = await admin
      .from('sanctuaries')
      .select('nom, ville')
      .eq('id', sanctuary_id)
      .single()

    // Cree l'appointment en pending_payment
    const { data: appt, error: apptError } = await admin
      .from('appointments')
      .insert({
        sanctuary_id,
        client_prenom: prenom,
        client_nom: nom,
        client_email: email.toLowerCase(),
        client_phone: phone,
        client_ville: ville || null,
        client_notes: notes || null,
        is_allaitement: allaitement === true || allaitement === 'oui',
        start_at,
        duration_minutes: 60,
        price_total_eur: 66,
        status: 'pending_payment'
      })
      .select()
      .single()

    if (apptError) {
      return json({ error: 'Creation RDV impossible : ' + apptError.message }, 500)
    }

    // Description conviviale pour Stripe
    const startLabel = new Date(start_at).toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris',
      weekday: 'long', day: 'numeric', month: 'long',
      hour: '2-digit', minute: '2-digit'
    })

    // Stripe Checkout Session (prix inline 66€)
    const stripeParams = new URLSearchParams()
    stripeParams.append('mode', 'payment')
    stripeParams.append('line_items[0][price_data][currency]', 'eur')
    stripeParams.append('line_items[0][price_data][unit_amount]', '6600')
    stripeParams.append('line_items[0][price_data][product_data][name]', `Bain Vapeur Vaginal - ${sanctuary?.nom || 'Sanctuarys'}`)
    stripeParams.append('line_items[0][price_data][product_data][description]', `Lecture radiesthesique de l'uterus + Bain Vapeur Vaginal (60 min) - ${startLabel}`)
    stripeParams.append('line_items[0][quantity]', '1')
    stripeParams.append('customer_email', email.toLowerCase())
    stripeParams.append('success_url', `https://sanctuarys.me/paiement-confirme?session_id={CHECKOUT_SESSION_ID}&type=rdv`)
    stripeParams.append('cancel_url', `https://sanctuarys.me/reserver`)
    stripeParams.append('metadata[appointment_id]', appt.id)
    stripeParams.append('metadata[type]', 'rdv')
    stripeParams.append('metadata[sanctuary]', sanctuary?.nom || '')
    stripeParams.append('metadata[start_at]', start_at)
    stripeParams.append('metadata[prenom]', prenom)
    stripeParams.append('metadata[nom]', nom)
    stripeParams.append('metadata[phone]', phone)
    stripeParams.append('payment_intent_data[metadata][appointment_id]', appt.id)
    stripeParams.append('payment_intent_data[metadata][type]', 'rdv')
    stripeParams.append('billing_address_collection', 'auto')
    stripeParams.append('locale', 'fr')

    const stripeResp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: stripeParams.toString()
    })

    if (!stripeResp.ok) {
      const errText = await stripeResp.text()
      console.error('Stripe error:', errText)
      // Rollback l'appointment
      await admin.from('appointments').update({ status: 'cancelled', cancellation_reason: 'stripe_error' }).eq('id', appt.id)
      return json({ error: 'Stripe : ' + errText }, 500)
    }

    const session = await stripeResp.json()

    // Sauvegarde le session_id sur l'appointment
    await admin
      .from('appointments')
      .update({ stripe_session_id: session.id })
      .eq('id', appt.id)

    return json({
      success: true,
      checkout_url: session.url,
      session_id: session.id,
      appointment_id: appt.id
    })
  } catch (err: any) {
    console.error('rdv-create-checkout error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

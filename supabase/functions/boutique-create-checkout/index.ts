// =====================================================
// SANCTUARYS · Edge Function · boutique-create-checkout
// Cree une session Stripe pour un creneau achat boutique (Bar a plantes),
// Paris uniquement, 15 minutes, acompte de 10 euros deduit des achats.
// Genere l'appointment en 'pending_payment' puis passe a 'confirmed' via webhook
// =====================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey'
}

// Le creneau achat boutique n'existe qu'a Paris
const PARIS_SANCTUARY_ID = '0816217f-2b32-4def-babd-f38d99d1a6d5'
const DUREE_MINUTES = 15
const PRIX_EUR = 10

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
      prenom, nom, email, phone
    } = body

    if (!start_at || !prenom || !nom || !email || !phone) {
      return json({ error: 'Champs obligatoires manquants : creneau, prenom, nom, email, telephone' }, 400)
    }

    // Le creneau achat boutique n'existe qu'a Paris
    if (sanctuary_id && sanctuary_id !== PARIS_SANCTUARY_ID) {
      return json({ error: 'Le creneau achat boutique est disponible uniquement a Paris' }, 400)
    }

    const { data: sanctuary } = await admin
      .from('sanctuaries')
      .select('nom, ville, capacity')
      .eq('id', PARIS_SANCTUARY_ID)
      .single()

    const capacity = sanctuary?.capacity ?? 1

    // Verifie que le creneau a encore de la place, en comparant le vrai
    // chevauchement (start_at + duration_minutes de chaque rendez vous achat existant)
    const startDate = new Date(start_at)
    const endDate = new Date(startDate.getTime() + DUREE_MINUTES * 60 * 1000)

    const { data: candidats } = await admin
      .from('appointments')
      .select('id, status, created_at, start_at, duration_minutes')
      .eq('sanctuary_id', PARIS_SANCTUARY_ID)
      .eq('type', 'achat')
      .gte('start_at', new Date(startDate.getTime() - 60 * 60 * 1000).toISOString())
      .lte('start_at', endDate.toISOString())
      .in('status', ['pending_payment', 'confirmed', 'in_progress'])

    const stillActive = (candidats || []).filter((c: any) => {
      const cStart = new Date(c.start_at).getTime()
      const cEnd = cStart + (c.duration_minutes || DUREE_MINUTES) * 60000
      const overlap = cStart < endDate.getTime() && cEnd > startDate.getTime()
      if (!overlap) return false
      if (c.status === 'pending_payment') {
        return (Date.now() - new Date(c.created_at).getTime()) < 30 * 60 * 1000
      }
      return true
    })

    if (stillActive.length >= capacity) {
      return json({ error: 'Ce creneau vient d\'etre reserve, choisis-en un autre.' }, 409)
    }

    // Cree l'appointment en pending_payment
    const { data: appt, error: apptError } = await admin
      .from('appointments')
      .insert({
        sanctuary_id: PARIS_SANCTUARY_ID,
        type: 'achat',
        client_prenom: prenom,
        client_nom: nom,
        client_email: email.toLowerCase(),
        client_phone: phone,
        start_at,
        duration_minutes: DUREE_MINUTES,
        price_total_eur: PRIX_EUR,
        status: 'pending_payment'
      })
      .select()
      .single()

    if (apptError) {
      return json({ error: 'Creation du creneau impossible : ' + apptError.message }, 500)
    }

    const startLabel = new Date(start_at).toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris',
      weekday: 'long', day: 'numeric', month: 'long',
      hour: '2-digit', minute: '2-digit'
    })

    // Stripe Checkout Session (acompte inline 10€, deduit des achats en boutique)
    const stripeParams = new URLSearchParams()
    stripeParams.append('mode', 'payment')
    stripeParams.append('line_items[0][price_data][currency]', 'eur')
    stripeParams.append('line_items[0][price_data][unit_amount]', '1000')
    stripeParams.append('line_items[0][price_data][product_data][name]', `Creneau achat boutique - ${sanctuary?.nom || 'Sanctuarys Paris'}`)
    stripeParams.append('line_items[0][price_data][product_data][description]', `Acompte de 10€ deduit de tes achats en boutique. Selection de plantes par radiesthesie (15 min) - ${startLabel}`)
    stripeParams.append('line_items[0][quantity]', '1')
    stripeParams.append('customer_email', email.toLowerCase())
    stripeParams.append('success_url', `https://sanctuarys.me/paiement-confirme?session_id={CHECKOUT_SESSION_ID}&type=achat`)
    stripeParams.append('cancel_url', `https://sanctuarys.me/boutique`)
    stripeParams.append('metadata[appointment_id]', appt.id)
    stripeParams.append('metadata[type]', 'achat')
    stripeParams.append('metadata[sanctuary]', sanctuary?.nom || '')
    stripeParams.append('metadata[start_at]', start_at)
    stripeParams.append('metadata[prenom]', prenom)
    stripeParams.append('metadata[nom]', nom)
    stripeParams.append('metadata[phone]', phone)
    stripeParams.append('payment_intent_data[metadata][appointment_id]', appt.id)
    stripeParams.append('payment_intent_data[metadata][type]', 'achat')
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
      await admin.from('appointments').update({ status: 'cancelled', cancellation_reason: 'stripe_error' }).eq('id', appt.id)
      return json({ error: 'Stripe : ' + errText }, 500)
    }

    const session = await stripeResp.json()

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
    console.error('boutique-create-checkout error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

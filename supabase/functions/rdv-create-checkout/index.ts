// =====================================================
// SANCTUARYS · Edge Function · rdv-create-checkout
// Cree une session Stripe pour un rendez-vous public (soin au choix)
// Genere l'appointment en 'pending_payment' puis passe a 'confirmed' via webhook
// =====================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey'
}

// Catalogue des soins reservables sur reserver.html. Le prix et la duree
// viennent toujours de ce catalogue cote serveur, jamais de ce qu'envoie
// le navigateur, pour eviter qu'un prix soit falsifie depuis le client.
type ServiceDef = { label: string; duration: number; price: number; description: string; apptType: string | null }
const SERVICES: Record<string, ServiceDef> = {
  vsteam: {
    label: 'Bain Vapeur Vaginal',
    duration: 60,
    price: 66,
    description: "Lecture radiesthesique de l'uterus + Bain Vapeur Vaginal",
    apptType: null
  },
  venusian: {
    label: 'Venusian Body',
    duration: 60,
    price: 66,
    description: 'Detox au sauna infrarouge',
    apptType: 'venusian'
  },
  venusian_gommage: {
    label: 'Venusian Body + gommage',
    duration: 80,
    price: 88,
    description: 'Detox au sauna infrarouge avec gommage',
    apptType: 'venusian_gommage'
  }
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
      notes, allaitement, service_key
    } = body

    if (!sanctuary_id || !start_at || !prenom || !nom || !email || !phone) {
      return json({ error: 'Champs obligatoires manquants : sanctuary, creneau, prenom, nom, email, telephone' }, 400)
    }

    const svcKey = typeof service_key === 'string' && SERVICES[service_key] ? service_key : 'vsteam'
    const service = SERVICES[svcKey]

    // Sanctuary info (capacite + metadata)
    const { data: sanctuary } = await admin
      .from('sanctuaries')
      .select('nom, ville, capacity')
      .eq('id', sanctuary_id)
      .single()

    const capacity = sanctuary?.capacity ?? 1

    // Verifie que le creneau a encore de la place (capacite = nombre de sieges du lieu)
    const startDate = new Date(start_at)
    const endDate = new Date(startDate.getTime() + service.duration * 60 * 1000)

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

    if (stillActive.length >= capacity) {
      return json({ error: 'Ce creneau vient d\'etre reserve, choisis-en un autre.' }, 409)
    }

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
        duration_minutes: service.duration,
        price_total_eur: service.price,
        type: service.apptType,
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

    // Stripe Checkout Session (prix du catalogue selon le soin choisi)
    const stripeParams = new URLSearchParams()
    stripeParams.append('mode', 'payment')
    stripeParams.append('line_items[0][price_data][currency]', 'eur')
    stripeParams.append('line_items[0][price_data][unit_amount]', String(service.price * 100))
    stripeParams.append('line_items[0][price_data][product_data][name]', `${service.label} - ${sanctuary?.nom || 'Sanctuarys'}`)
    stripeParams.append('line_items[0][price_data][product_data][description]', `${service.description} (${service.duration} min) - ${startLabel}`)
    stripeParams.append('line_items[0][quantity]', '1')
    stripeParams.append('customer_email', email.toLowerCase())
    stripeParams.append('success_url', `https://sanctuarys.me/paiement-confirme?session_id={CHECKOUT_SESSION_ID}&type=rdv`)
    stripeParams.append('cancel_url', `https://sanctuarys.me/reserver`)
    stripeParams.append('metadata[appointment_id]', appt.id)
    stripeParams.append('metadata[type]', 'rdv')
    stripeParams.append('metadata[service_key]', svcKey)
    stripeParams.append('metadata[service_label]', service.label)
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

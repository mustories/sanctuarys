// =====================================================
// SANCTUARYS · Edge Function · club-create-checkout
// Crée une session Stripe Checkout pour le Pass Fondatrice 180€
// Appelée publiquement depuis club.html après soumission du formulaire
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
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    const stripePriceId = Deno.env.get('STRIPE_PRICE_FONDATRICE')

    if (!stripeKey) return json({ error: 'STRIPE_SECRET_KEY non configurée' }, 500)
    if (!stripePriceId) return json({ error: 'STRIPE_PRICE_FONDATRICE non configurée' }, 500)

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const body = await req.json()
    const { prenom, nom, email, phone, referral_source, intention } = body

    if (!email || !prenom || !nom || !phone) {
      return json({ error: 'Prénom, nom, email et téléphone requis' }, 400)
    }

    // Vérifie qu'on n'a pas dépassé 123 Fondatrices
    const { count: paidCount } = await admin
      .from('club_signups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
    if ((paidCount || 0) >= 123) {
      return json({ error: 'Les 123 places de Fondatrice sont prises. Une liste d\'attente s\'ouvre.' }, 403)
    }

    // Crée le club_signup en statut "pending" pour tracer l'intention de paiement
    const { data: signup, error: signupError } = await admin
      .from('club_signups')
      .insert({
        prenom,
        nom,
        email: email.toLowerCase(),
        phone,
        referral_source: referral_source || null,
        intention: intention || null,
        status: 'pending'
      })
      .select()
      .single()

    if (signupError) {
      return json({ error: 'Inscription impossible : ' + signupError.message }, 500)
    }

    // Crée la session Stripe Checkout
    const stripeParams = new URLSearchParams()
    stripeParams.append('mode', 'payment')
    stripeParams.append('line_items[0][price]', stripePriceId)
    stripeParams.append('line_items[0][quantity]', '1')
    stripeParams.append('customer_email', email.toLowerCase())
    stripeParams.append('success_url', `https://sanctuarys.me/paiement-confirme?session_id={CHECKOUT_SESSION_ID}`)
    stripeParams.append('cancel_url', `https://sanctuarys.me/club#offre`)
    stripeParams.append('metadata[signup_id]', signup.id)
    stripeParams.append('metadata[prenom]', prenom)
    stripeParams.append('metadata[nom]', nom)
    stripeParams.append('metadata[phone]', phone)
    stripeParams.append('payment_intent_data[metadata][signup_id]', signup.id)
    stripeParams.append('billing_address_collection', 'auto')
    stripeParams.append('locale', 'fr')
    stripeParams.append('allow_promotion_codes', 'true')

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
      return json({ error: 'Stripe : ' + errText }, 500)
    }

    const session = await stripeResp.json()

    // Sauvegarde le session_id sur le signup
    await admin
      .from('club_signups')
      .update({ stripe_session_id: session.id })
      .eq('id', signup.id)

    return json({
      success: true,
      checkout_url: session.url,
      session_id: session.id
    })
  } catch (err: any) {
    console.error('club-create-checkout error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

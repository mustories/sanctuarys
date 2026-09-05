// =====================================================
// SANCTUARYS · Edge Function · rdv-reconcile-paiement
// Filet de securite : verifie directement aupres de Stripe le statut des
// paiements des rendez vous restes en pending_payment, et les confirme
// si Stripe confirme que le paiement a bien ete recu.
// Necessaire car le webhook Stripe (club-webhook-stripe) peut ne jamais
// etre appele si l'endpoint webhook cote Stripe est mal configure ou
// tombe en panne : cette fonction reconcilie quand meme les rendez vous.
// Pensee pour tourner en manuel (bouton, curl) ET en cron toutes les
// 15 minutes en filet de securite permanent.
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

async function signStripePayload(rawBody: string, secret: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000)
  const signedPayload = `${timestamp}.${rawBody}`
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload))
  const sig = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `t=${timestamp},v1=${sig}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    if (!stripeKey) return json({ error: 'STRIPE_SECRET_KEY non configuree' }, 500)
    if (!webhookSecret) return json({ error: 'STRIPE_WEBHOOK_SECRET non configuree' }, 500)

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Rendez vous publics restes en attente avec un vrai session Stripe
    const { data: pending, error } = await admin
      .from('appointments')
      .select('id, client_prenom, client_nom, stripe_session_id, created_at')
      .eq('status', 'pending_payment')
      .not('stripe_session_id', 'is', null)
      .order('created_at')

    if (error) return json({ error: error.message }, 500)
    if (!pending || pending.length === 0) {
      return json({ success: true, checked: 0, confirmed: 0, message: 'Aucun rendez vous en attente' })
    }

    const results: any[] = []

    for (const appt of pending) {
      try {
        const sessResp = await fetch(`https://api.stripe.com/v1/checkout/sessions/${appt.stripe_session_id}`, {
          headers: { 'Authorization': `Bearer ${stripeKey}` }
        })
        if (!sessResp.ok) {
          results.push({ id: appt.id, prenom: appt.client_prenom, status: 'stripe_error' })
          continue
        }
        const session = await sessResp.json()

        if (session.payment_status !== 'paid') {
          results.push({ id: appt.id, prenom: appt.client_prenom, status: 'not_paid_yet' })
          continue
        }

        // Paiement confirme par Stripe mais jamais reçu par le webhook :
        // on rejoue un evenement checkout.session.completed signe, pour
        // que club-webhook-stripe fasse exactement le meme traitement
        // (confirmation, creation de compte, email) qu'un vrai webhook.
        const fakeEvent = {
          id: `evt_reconcile_${appt.id}`,
          type: 'checkout.session.completed',
          data: { object: session }
        }
        const rawBody = JSON.stringify(fakeEvent)
        const signature = await signStripePayload(rawBody, webhookSecret)

        const webhookResp = await fetch(`${supabaseUrl}/functions/v1/club-webhook-stripe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'stripe-signature': signature
          },
          body: rawBody
        })

        const webhookBody = await webhookResp.json().catch(() => ({}))

        if (webhookResp.ok) {
          results.push({ id: appt.id, prenom: appt.client_prenom, status: 'confirmed' })
        } else {
          results.push({ id: appt.id, prenom: appt.client_prenom, status: 'webhook_error', detail: webhookBody })
        }
      } catch (err: any) {
        results.push({ id: appt.id, prenom: appt.client_prenom, status: 'error', detail: err.message })
      }
    }

    return json({
      success: true,
      checked: results.length,
      confirmed: results.filter(r => r.status === 'confirmed').length,
      details: results,
      timestamp: new Date().toISOString()
    })
  } catch (err: any) {
    console.error('rdv-reconcile-paiement error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

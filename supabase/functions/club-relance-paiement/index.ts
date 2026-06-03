// =====================================================
// SANCTUARYS · Edge Function · club-relance-paiement
// Régénère un Stripe Checkout pour un signup pending
// et envoie un email "Finalise ton paiement" via Resend
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
    const resendKey = Deno.env.get('RESEND_API_KEY')

    if (!stripeKey) return json({ error: 'STRIPE_SECRET_KEY non configurée' }, 500)
    if (!stripePriceId) return json({ error: 'STRIPE_PRICE_FONDATRICE non configurée' }, 500)
    if (!resendKey) return json({ error: 'RESEND_API_KEY non configurée' }, 500)

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { signup_id } = await req.json()
    if (!signup_id) return json({ error: 'signup_id requis' }, 400)

    // Récupère le signup
    const { data: signup, error: sErr } = await admin
      .from('club_signups')
      .select('*')
      .eq('id', signup_id)
      .single()

    if (sErr || !signup) return json({ error: 'Signup introuvable' }, 404)
    if (signup.status === 'accepted') return json({ error: 'Cette Fondatrice a déjà payé' }, 400)
    if (!signup.email) return json({ error: 'Email manquant' }, 400)

    // Vérifie qu'on n'a pas dépassé 123 Fondatrices
    const { count: paidCount } = await admin
      .from('club_signups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
    if ((paidCount || 0) >= 123) {
      return json({ error: 'Les 123 places de Fondatrice sont prises' }, 403)
    }

    // Crée une nouvelle session Stripe Checkout
    const stripeParams = new URLSearchParams()
    stripeParams.append('mode', 'payment')
    stripeParams.append('line_items[0][price]', stripePriceId)
    stripeParams.append('line_items[0][quantity]', '1')
    stripeParams.append('customer_email', signup.email.toLowerCase())
    stripeParams.append('success_url', `https://sanctuarys.me/paiement-confirme?session_id={CHECKOUT_SESSION_ID}`)
    stripeParams.append('cancel_url', `https://sanctuarys.me/club#offre`)
    stripeParams.append('metadata[signup_id]', signup.id)
    stripeParams.append('metadata[prenom]', signup.prenom || '')
    stripeParams.append('metadata[nom]', signup.nom || '')
    stripeParams.append('metadata[phone]', signup.phone || '')
    stripeParams.append('metadata[relance]', 'true')
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

    // Met à jour le signup avec le nouveau session_id et marque la relance
    await admin
      .from('club_signups')
      .update({
        stripe_session_id: session.id,
        contacted_at: new Date().toISOString()
      })
      .eq('id', signup.id)

    // Envoie l'email de relance via Resend
    const prenom = signup.prenom || 'Toi'
    const checkoutUrl = session.url

    const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { background: #FAF5EC; font-family: Georgia, serif; color: #2A1810; margin: 0; padding: 40px 20px; }
.container { max-width: 580px; margin: 0 auto; background: #FAF5EC; padding: 48px; border: 1px solid rgba(106, 68, 35, 0.18); }
h1 { font-family: 'Italiana', Georgia, serif; font-size: 40px; color: #2A1810; line-height: 1; margin: 0 0 12px; font-weight: normal; }
h1 em { font-style: italic; color: #A85537; }
.meta { font-family: monospace; font-size: 10px; letter-spacing: 4px; color: #A85537; text-transform: uppercase; margin: 0 0 32px; }
p { font-size: 16px; line-height: 1.85; color: #4A3020; margin: 0 0 18px; font-family: Georgia, serif; }
.btn { display: inline-block; padding: 18px 38px; background: #C8704D; color: #FAF5EC !important; text-decoration: none; font-family: monospace; font-size: 11px; letter-spacing: 4px; text-transform: uppercase; margin: 28px 0; }
.footer { font-family: monospace; font-size: 10px; letter-spacing: 3px; color: #6B4423; text-transform: uppercase; margin-top: 40px; padding-top: 24px; border-top: 1px solid rgba(106, 68, 35, 0.18); opacity: 0.7; }
.places { background: rgba(212, 160, 76, 0.12); border-left: 3px solid #D4A04C; padding: 14px 18px; margin: 22px 0; font-style: italic; font-size: 15px; color: #4A3020; }
</style></head><body>
<div class="container">
  <p class="meta">✦ Sanctuarys · Yoni Social Club</p>
  <h1>Le seuil<br><em>t'attend.</em></h1>
  <p>${prenom},</p>
  <p>Ta demande d'entrée dans le Yoni Social Club est bien arrivée jusqu'à nous, mais ton <strong>paiement n'a pas été finalisé</strong>. Le Temple garde ta place pour quelques instants encore.</p>
  <div class="places">
    Il reste <strong>${123 - (paidCount || 0)} place${(123 - (paidCount || 0)) > 1 ? 's' : ''} de Fondatrice</strong> sur les 123. Au-delà, le tarif d'avant-première à 180€ devient impossible.
  </div>
  <p>Si quelque chose t'a freinée, dis-le nous, on peut en parler. Sinon, finalise ton entrée en un clic :</p>
  <p style="text-align: center;"><a href="${checkoutUrl}" class="btn">Finaliser mon Pass Fondatrice ✦</a></p>
  <p style="font-size: 13px; color: #6B4423; text-align: center; font-style: italic;">Si le bouton ne s'affiche pas, copie ce lien :<br><a href="${checkoutUrl}" style="color: #A85537; word-break: break-all;">${checkoutUrl}</a></p>
  <p>Tu auras ensuite ton mail de bienvenue, ton espace privé et l'accès à tes trois séances YoniSpa dans nos murs à Paris 12<sup>e</sup>.</p>
  <p style="font-family: 'Italiana', Georgia, serif; font-size: 18px; color: #A85537; margin-top: 30px;">Avec attention,</p>
  <p style="font-family: 'Italiana', Georgia, serif; font-size: 20px; color: #2A1810; margin-top: -10px;">L'équipe Sanctuarys</p>
  <div class="footer">Sanctuarys · sanctuarys.me · info@sanctuarys.me<br>Si tu ne souhaites plus rejoindre le Club, ignore simplement ce message.</div>
</div></body></html>`

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Sanctuarys <info@sanctuarys.me>',
        to: signup.email.toLowerCase(),
        subject: 'Le seuil t\'attend ✦ Finalise ton Pass Fondatrice',
        html: emailHtml
      })
    })

    if (!resendResp.ok) {
      const errTxt = await resendResp.text()
      console.error('Resend error:', errTxt)
      return json({ error: 'Resend : ' + errTxt, checkout_url: checkoutUrl }, 500)
    }

    return json({
      success: true,
      checkout_url: checkoutUrl,
      email_sent_to: signup.email.toLowerCase()
    })
  } catch (err: any) {
    console.error('club-relance-paiement error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

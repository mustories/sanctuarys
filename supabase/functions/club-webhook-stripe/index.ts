// =====================================================
// SANCTUARYS · Edge Function · club-webhook-stripe
// Reçoit les webhooks Stripe, active la membre Fondatrice après paiement
// =====================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, stripe-signature'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

async function verifyStripeSignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  try {
    const parts = signature.split(',').reduce((acc: any, p) => {
      const [k, v] = p.split('=')
      acc[k] = v
      return acc
    }, {})
    const timestamp = parts.t
    const sig = parts.v1
    if (!timestamp || !sig) return false

    const signedPayload = `${timestamp}.${rawBody}`
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const messageData = encoder.encode(signedPayload)
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageData)
    const computedSig = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    return computedSig === sig
  } catch (err) {
    console.error('Signature verification error:', err)
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    const resendKey = Deno.env.get('RESEND_API_KEY')

    if (!webhookSecret) return json({ error: 'STRIPE_WEBHOOK_SECRET non configurée' }, 500)

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const rawBody = await req.text()
    const signature = req.headers.get('stripe-signature') || ''

    const validSignature = await verifyStripeSignature(rawBody, signature, webhookSecret)
    if (!validSignature) {
      console.error('Invalid Stripe signature')
      return json({ error: 'Signature invalide' }, 400)
    }

    const event = JSON.parse(rawBody)

    // On ne traite que le succès du checkout
    if (event.type !== 'checkout.session.completed') {
      return json({ received: true, ignored: event.type })
    }

    const session = event.data.object
    const signupId = session.metadata?.signup_id
    const prenom = session.metadata?.prenom
    const nom = session.metadata?.nom
    const phone = session.metadata?.phone
    const email = session.customer_email || session.customer_details?.email

    if (!signupId || !email) {
      console.error('Missing signupId or email in session', session.id)
      return json({ error: 'Données incomplètes' }, 400)
    }

    // Marque le signup comme accepté
    await admin
      .from('club_signups')
      .update({
        status: 'accepted',
        contacted_at: new Date().toISOString()
      })
      .eq('id', signupId)

    // Crée ou trouve le user Auth puis le profil membre
    let userId: string | null = null

    // Tente de trouver un user existant avec cet email
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (existingProfile) {
      userId = existingProfile.id
      // Met à jour le profil au rôle membre si pas déjà
      await admin
        .from('profiles')
        .update({
          role: 'membre',
          prenom: prenom || undefined,
          nom: nom || undefined,
          phone: phone || undefined
        })
        .eq('id', userId)
    } else {
      // Invite la nouvelle membre via Supabase Auth
      const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
        email.toLowerCase(),
        {
          redirectTo: 'https://sanctuarys.me/questionnaire',
          data: {
            prenom,
            nom,
            phone,
            role_intended: 'membre'
          }
        }
      )

      if (inviteError) {
        console.error('Invite error:', inviteError)
        return json({ error: 'Invitation impossible : ' + inviteError.message }, 500)
      }

      userId = inviteData.user?.id || null

      if (userId) {
        await admin
          .from('profiles')
          .update({
            role: 'membre',
            prenom: prenom || null,
            nom: nom || null,
            phone: phone || null,
            email: email.toLowerCase()
          })
          .eq('id', userId)
      }
    }

    if (!userId) {
      return json({ error: 'Impossible de créer le profil membre' }, 500)
    }

    // Lie le signup au membre créé
    await admin
      .from('club_signups')
      .update({ member_id: userId })
      .eq('id', signupId)

    // Crée le membership Fondatrice (Pass à 180€, paiement unique, statut à vie)
    const now = new Date()
    const validityEnd = new Date(now.getTime() + 40 * 24 * 60 * 60 * 1000) // 40 jours pour les 3 séances

    await admin
      .from('memberships')
      .insert({
        member_id: userId,
        status: 'active',
        started_at: now.toISOString(),
        current_period_start: now.toISOString(),
        current_period_end: validityEnd.toISOString(),
        sessions_total: 3,
        sessions_used: 0,
        amount_paid_eur: 180,
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.id, // on stocke ici le session_id en attendant un meilleur champ
        credit_balance_eur: 0
      })

    // Envoie un email d'accueil personnel via Resend
    if (resendKey) {
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
</style></head><body>
<div class="container">
  <p class="meta">✦ Sanctuarys · Yoni Social Club</p>
  <h1>Bienvenue,<br><em>Fondatrice.</em></h1>
  <p>${prenom},</p>
  <p>Ton paiement est validé. Tu fais désormais partie des <strong>123 Fondatrices</strong> du Yoni Social Club. Ton tarif de Fondatrice est gravé dans la mémoire du Temple, à vie.</p>
  <p>Pour activer ton espace privé et nous aider à préparer tes protocoles personnalisés, clique sur le bouton ci-dessous pour choisir ton mot de passe et remplir ton questionnaire d'entrée.</p>
  <p style="text-align: center;"><a href="https://sanctuarys.me/questionnaire" class="btn">Franchir le seuil →</a></p>
  <p>Princesse te contactera personnellement dans les jours qui viennent pour planifier ta première séance YoniSpa.</p>
  <p style="font-family: 'Italiana', Georgia, serif; font-size: 18px; color: #A85537; margin-top: 30px;">Avec toute mon attention,</p>
  <p style="font-family: 'Italiana', Georgia, serif; font-size: 20px; color: #2A1810; margin-top: -10px;">Princesse Tchassi Bekou</p>
  <div class="footer">Sanctuarys · sanctuarys.me · info@sanctuarys.me</div>
</div></body></html>`

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Sanctuarys <info@sanctuarys.me>',
          to: email.toLowerCase(),
          subject: `Bienvenue Fondatrice ✦`,
          html: emailHtml
        })
      })
    }

    return json({ success: true, signup_id: signupId, member_id: userId })
  } catch (err: any) {
    console.error('club-webhook-stripe error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

// =====================================================
// SANCTUARYS · Edge Function · resend-invitation
// Renvoie un email d'invitation à un user existant
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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Vérifie que l'appelante est admin ou formatrice
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non authentifiée' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Session invalide' }, 401)

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!callerProfile || !['admin', 'formatrice'].includes(callerProfile.role)) {
      return json({ error: 'Réservé aux formatrices' }, 403)
    }

    const body = await req.json()
    const { user_id } = body

    if (!user_id) return json({ error: 'user_id requis' }, 400)

    // Récupère le user cible
    const { data: targetUserData } = await admin.auth.admin.getUserById(user_id)
    if (!targetUserData?.user) return json({ error: 'Utilisateur introuvable' }, 404)

    const targetEmail = targetUserData.user.email
    if (!targetEmail) return json({ error: 'Email manquant' }, 400)

    // Récupère le profil pour décider du redirect
    const { data: targetProfile } = await admin
      .from('profiles')
      .select('role, prenom, formatrice_id')
      .eq('id', user_id)
      .single()

    if (!targetProfile) return json({ error: 'Profil introuvable' }, 404)

    // Une formatrice ne peut renvoyer un email qu'à ses propres élèves
    if (callerProfile.role === 'formatrice') {
      if (targetProfile.role !== 'student' || targetProfile.formatrice_id !== user.id) {
        return json({ error: 'Tu peux renvoyer une invitation uniquement à tes propres élèves' }, 403)
      }
    }

    let redirectTo: string
    if (targetProfile.role === 'student') {
      redirectTo = 'https://sanctuarys.me/espace-eleve'
    } else if (targetProfile.role === 'praticienne') {
      redirectTo = 'https://sanctuarys.me/outils'
    } else {
      redirectTo = 'https://sanctuarys.me/admin'
    }

    // Génère un nouveau lien d'invitation et envoie l'email
    // generateLink type 'invite' fonctionne pour les users non confirmés
    // type 'recovery' fonctionne pour les users existants
    const isConfirmed = !!targetUserData.user.email_confirmed_at

    let linkResult
    if (isConfirmed) {
      // Le user a déjà confirmé son email, on envoie un lien de récupération
      linkResult = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: targetEmail,
        options: { redirectTo }
      })
    } else {
      // Le user n'a jamais ouvert l'invitation, on re-invite
      linkResult = await admin.auth.admin.generateLink({
        type: 'invite',
        email: targetEmail,
        options: {
          redirectTo,
          data: targetUserData.user.user_metadata
        }
      })
    }

    if (linkResult.error) {
      return json({ error: `Génération du lien impossible : ${linkResult.error.message}` }, 500)
    }

    // generateLink génère le lien mais N'envoie PAS l'email automatiquement
    // On doit envoyer l'email nous-mêmes via l'API Resend
    const actionLink = linkResult.data.properties?.action_link
    if (!actionLink) return json({ error: 'Lien introuvable' }, 500)

    // Envoie l'email via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (resendKey) {
      const emailType = isConfirmed ? 'récupération' : 'invitation'
      const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { background: #FAF5EC; font-family: Georgia, serif; color: #2A1810; margin: 0; padding: 40px 20px; }
.container { max-width: 560px; margin: 0 auto; background: #FAF5EC; padding: 40px; border: 1px solid rgba(106, 68, 35, 0.18); }
h1 { font-family: 'Italiana', Georgia, serif; font-size: 36px; color: #2A1810; line-height: 1; margin: 0 0 8px; }
h1 em { font-style: italic; color: #A85537; }
.meta { font-family: monospace; font-size: 10px; letter-spacing: 4px; color: #A85537; text-transform: uppercase; margin: 0 0 28px; }
p { font-size: 16px; line-height: 1.85; color: #4A3020; margin: 0 0 18px; }
.btn { display: inline-block; padding: 18px 38px; background: #C8704D; color: #FAF5EC !important; text-decoration: none; font-family: monospace; font-size: 11px; letter-spacing: 4px; text-transform: uppercase; margin: 28px 0; }
.footer { font-family: monospace; font-size: 10px; letter-spacing: 3px; color: #6B4423; text-transform: uppercase; margin-top: 40px; padding-top: 24px; border-top: 1px solid rgba(106, 68, 35, 0.18); opacity: 0.7; }
</style></head><body>
<div class="container">
  <p class="meta">✦ Sanctuarys</p>
  <h1>Ton espace<br><em>t'attend.</em></h1>
  <p>Bonjour ${targetProfile.prenom},</p>
  <p>Voici ton lien d'accès à ton espace Sanctuarys. Clique sur le bouton ci-dessous, tu pourras choisir ton mot de passe et entrer dans ton espace.</p>
  <p style="text-align: center;"><a href="${actionLink}" class="btn">Franchir le seuil →</a></p>
  <p style="font-size: 13px; color: #6B4423;">Si le bouton ne fonctionne pas, copie ce lien :<br><span style="word-break: break-all;">${actionLink}</span></p>
  <div class="footer">Sanctuarys · sanctuarys.me · info@sanctuarys.me</div>
</div></body></html>`

      const resendResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Sanctuarys <info@sanctuarys.me>',
          to: targetEmail,
          subject: `Bienvenue dans le sanctuaire ✦`,
          html: emailHtml
        })
      })

      if (!resendResp.ok) {
        const errData = await resendResp.text()
        console.error('Resend send error:', errData)
        return json({
          success: true,
          message: `Lien généré mais l'envoi a échoué : ${errData}. Tu peux copier le lien et le transmettre toi-même.`,
          action_link: actionLink
        })
      }

      return json({
        success: true,
        message: `Email de ${emailType} renvoyé à ${targetProfile.prenom}`
      })
    }

    // Pas de RESEND_API_KEY configuré, on renvoie juste le lien
    return json({
      success: true,
      message: `Lien généré (pas de SMTP configuré, copie le lien ci-dessous)`,
      action_link: actionLink
    })
  } catch (err: any) {
    console.error('resend-invitation error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

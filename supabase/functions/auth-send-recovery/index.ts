// =====================================================
// SANCTUARYS · Edge Function · auth-send-recovery
// Envoie un email de reset password via Resend avec template Sanctuarys
// Bypass complet du système email natif Supabase Auth
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
    const resendKey = Deno.env.get('RESEND_API_KEY')

    if (!resendKey) return json({ error: 'RESEND_API_KEY non configurée' }, 500)

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { email } = await req.json()
    if (!email) return json({ error: 'Email requis' }, 400)

    // Vérifie que le user existe
    const { data: profile } = await admin
      .from('profiles')
      .select('id, prenom')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    // Pour la sécurité, on répond toujours 200 même si user n'existe pas
    // (évite de divulguer quels emails sont enregistrés)
    if (!profile) {
      return json({ success: true })
    }

    // Génère le lien de recovery sans envoyer d'email Supabase
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: email.toLowerCase(),
      options: {
        redirectTo: 'https://sanctuarys.me/espace-membre'
      }
    })

    if (linkError) {
      console.error('GenerateLink error:', linkError)
      return json({ error: 'Erreur génération lien' }, 500)
    }

    const recoveryLink = linkData.properties?.action_link
    if (!recoveryLink) return json({ error: 'Lien indisponible' }, 500)

    const prenom = profile.prenom || ''
    const greeting = prenom ? `${prenom},` : 'Bonjour,'

    // Email HTML dans le style Sanctuarys
    const emailHtml = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Réinitialiser ton mot de passe · Sanctuarys</title></head>
<body style="margin:0;padding:40px 20px;background:#FAF5EC;font-family:Georgia,serif;color:#2A1810;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;margin:0 auto;background:#FAF5EC;border:1px solid rgba(106,68,35,0.18);">
<tr><td style="padding:48px 44px;">
<p style="margin:0 0 30px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:4px;color:#A85537;text-transform:uppercase;">✦ Sanctuarys</p>
<h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:38px;font-weight:normal;line-height:1.1;color:#2A1810;letter-spacing:-0.5px;">Réinitialiser<br><em style="font-style:italic;color:#A85537;">ton mot de passe.</em></h1>
<p style="margin:0 0 22px;font-size:16px;line-height:1.85;color:#4A3020;font-family:Georgia,serif;">${greeting}</p>
<p style="margin:0 0 22px;font-size:16px;line-height:1.85;color:#4A3020;font-family:Georgia,serif;">Tu as demandé à réinitialiser le mot de passe de ton espace Sanctuarys. Clique sur le bouton ci-dessous pour choisir un nouveau mot de passe.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;">
<tr><td align="center">
<a href="${recoveryLink}" style="display:inline-block;padding:18px 38px;background:#C8704D;color:#FAF5EC;text-decoration:none;font-family:'Courier New',monospace;font-size:11px;letter-spacing:4px;text-transform:uppercase;font-weight:bold;">Choisir un nouveau mot de passe ✦</a>
</td></tr>
</table>
<p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#6B4423;font-family:Georgia,serif;font-style:italic;">Ce lien expire dans une heure. Si tu n'es pas à l'origine de cette demande, ignore simplement ce message, ton mot de passe actuel restera inchangé.</p>
<p style="margin:0 0 22px;font-size:13px;line-height:1.6;color:#6B4423;font-family:Georgia,serif;font-style:italic;">Lien direct : <a href="${recoveryLink}" style="color:#A85537;word-break:break-all;">${recoveryLink}</a></p>
<p style="margin:30px 0 8px;font-family:Georgia,serif;font-style:italic;font-size:18px;color:#A85537;">Avec attention,</p>
<p style="margin:0;font-family:Georgia,serif;font-size:20px;color:#2A1810;">L'équipe Sanctuarys</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:40px;border-top:1px solid rgba(106,68,35,0.18);">
<tr><td style="padding-top:24px;"><p style="margin:0;font-family:'Courier New',monospace;font-size:10px;letter-spacing:3px;color:#6B4423;text-transform:uppercase;opacity:0.7;">Sanctuarys · sanctuarys.me · info@sanctuarys.me</p></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Sanctuarys <info@sanctuarys.me>',
        to: email.toLowerCase(),
        subject: 'Réinitialiser ton mot de passe ✦',
        html: emailHtml
      })
    })

    if (!resendResp.ok) {
      const errTxt = await resendResp.text()
      console.error('Resend error:', errTxt)
      return json({ error: 'Resend : ' + errTxt }, 500)
    }

    return json({ success: true })
  } catch (err: any) {
    console.error('auth-send-recovery error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

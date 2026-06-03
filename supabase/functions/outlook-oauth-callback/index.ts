// =====================================================
// SANCTUARYS · Edge Function · outlook-oauth-callback
// Echange le code OAuth contre les access + refresh tokens
// Sauvegarde dans outlook_credentials
// =====================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const tenantId = Deno.env.get('MS_TENANT_ID')
    const clientId = Deno.env.get('MS_CLIENT_ID')
    const clientSecret = Deno.env.get('MS_CLIENT_SECRET')
    const redirectUri = Deno.env.get('MS_REDIRECT_URI') || 'https://sanctuarys.me/admin/outlook-callback'

    if (!tenantId || !clientId || !clientSecret) {
      return json({ error: 'Configuration Azure manquante (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET)' }, 500)
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const body = await req.json()
    const { code, connected_by } = body
    if (!code) return json({ error: 'code OAuth requis' }, 400)

    // Echange le code contre les tokens
    const params = new URLSearchParams()
    params.append('client_id', clientId)
    params.append('client_secret', clientSecret)
    params.append('code', code)
    params.append('redirect_uri', redirectUri)
    params.append('grant_type', 'authorization_code')
    params.append('scope', 'offline_access Mail.ReadWrite Mail.Send User.Read')

    const tokenResp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    })

    if (!tokenResp.ok) {
      const errTxt = await tokenResp.text()
      return json({ error: 'Échec OAuth Microsoft : ' + errTxt }, 500)
    }

    const tokens = await tokenResp.json()

    // Récupère l'email de l'utilisateur connecté pour identifier le compte
    const meResp = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    })

    if (!meResp.ok) {
      return json({ error: 'Impossible de récupérer le profil Microsoft' }, 500)
    }

    const me = await meResp.json()
    const userEmail = me.mail || me.userPrincipalName

    const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString()

    // Upsert dans outlook_credentials
    const { error: upsertError } = await admin
      .from('outlook_credentials')
      .upsert({
        email: userEmail,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        scope: tokens.scope,
        connected_by: connected_by || null,
        connected_at: new Date().toISOString(),
        active: true
      }, { onConflict: 'email' })

    if (upsertError) {
      return json({ error: 'Erreur sauvegarde : ' + upsertError.message }, 500)
    }

    return json({
      success: true,
      email: userEmail,
      display_name: me.displayName,
      expires_at: expiresAt,
      message: 'Outlook connecté ✦'
    })
  } catch (err: any) {
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

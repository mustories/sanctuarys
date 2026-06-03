// =====================================================
// SANCTUARYS · Edge Function · outlook-send-reply
// Envoie une réponse à un message Outlook
// Optionnel : aide à rédiger via Claude
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

async function refreshIfNeeded(admin: any, cred: any) {
  if (new Date(cred.expires_at) > new Date()) return cred.access_token

  const tenantId = Deno.env.get('MS_TENANT_ID')!
  const clientId = Deno.env.get('MS_CLIENT_ID')!
  const clientSecret = Deno.env.get('MS_CLIENT_SECRET')!

  const params = new URLSearchParams()
  params.append('client_id', clientId)
  params.append('client_secret', clientSecret)
  params.append('grant_type', 'refresh_token')
  params.append('refresh_token', cred.refresh_token)
  params.append('scope', 'offline_access Mail.ReadWrite Mail.Send User.Read')

  const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  })
  if (!resp.ok) throw new Error('Refresh failed')
  const tokens = await resp.json()
  const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString()

  await admin
    .from('outlook_credentials')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || cred.refresh_token,
      expires_at: expiresAt
    })
    .eq('id', cred.id)

  return tokens.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const claudeKey = Deno.env.get('CLAUDE_API_KEY')

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { action, outlook_message_id, content, intention } = await req.json()

    // Mode draft : Claude rédige la réponse
    if (action === 'draft') {
      if (!claudeKey) return json({ error: 'CLAUDE_API_KEY non configurée' }, 500)
      if (!outlook_message_id) return json({ error: 'outlook_message_id requis' }, 400)
      if (!intention) return json({ error: 'intention requise' }, 400)

      // Récupère le message original pour contexte
      const { data: original } = await admin
        .from('outlook_messages')
        .select('*')
        .eq('outlook_id', outlook_message_id)
        .maybeSingle()

      if (!original) return json({ error: 'Message original introuvable' }, 404)

      const systemPrompt = `Tu es l'assistante de Princesse Tchassi Bekou, fondatrice de Sanctuarys Yoni Social Club à Paris 12e.

Tu rédiges des réponses email au nom de "l'équipe Sanctuarys".

Ton :
- Chaleureux, éditorial, féminin
- Tutoiement (entre femmes du Temple)
- Phrases courtes et puissantes
- Tu peux utiliser ✦ avec parcimonie
- INTERDICTION du tiret cadratin (—)
- Signature : "Avec attention," puis "L'équipe Sanctuarys"

Rédige uniquement le corps de la réponse. Format texte brut.

Message d'origine reçu :
De : ${original.from_name || ''} <${original.from_email}>
Sujet : ${original.subject}
Contenu : ${original.body_text || original.body_preview || ''}

L'intention de Princesse pour la réponse : ${intention}`

      const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': claudeKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: 'Rédige la réponse maintenant.' }]
        })
      })

      if (!claudeResp.ok) {
        const errTxt = await claudeResp.text()
        return json({ error: 'Claude : ' + errTxt }, 500)
      }

      const result = await claudeResp.json()
      const draft = result.content?.[0]?.text || ''

      return json({ success: true, draft })
    }

    // Mode send : envoie la réponse via Microsoft Graph
    if (action === 'send') {
      if (!outlook_message_id) return json({ error: 'outlook_message_id requis' }, 400)
      if (!content) return json({ error: 'content requis' }, 400)

      const { data: original } = await admin
        .from('outlook_messages')
        .select('*')
        .eq('outlook_id', outlook_message_id)
        .maybeSingle()

      if (!original) return json({ error: 'Message original introuvable' }, 404)

      const { data: creds } = await admin
        .from('outlook_credentials')
        .select('*')
        .eq('active', true)
        .limit(1)

      if (!creds || creds.length === 0) return json({ error: 'Aucun compte Outlook connecté' }, 400)

      const accessToken = await refreshIfNeeded(admin, creds[0])

      // Construit le corps HTML signé Sanctuarys
      const htmlBody = `<div style="font-family: Georgia, serif; color: #2A1810; line-height: 1.75;">${content.split('\n').map((l: string) => `<p style="margin: 0 0 14px;">${escapeHtml(l)}</p>`).join('')}<p style="margin-top: 28px; font-family: 'Italiana', Georgia, serif; font-size: 16px; color: #A85537;">Avec attention,</p><p style="margin: 0; font-family: 'Italiana', Georgia, serif; font-size: 18px; color: #2A1810;">L'équipe Sanctuarys</p><p style="margin-top: 22px; font-family: 'Courier New', monospace; font-size: 10px; letter-spacing: 2px; color: #6B4423; text-transform: uppercase; opacity: 0.7;">Sanctuarys · Paris 12e · sanctuarys.me · info@sanctuarys.me</p></div>`

      // Microsoft Graph : reply à un message
      const replyResp = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${original.outlook_id}/reply`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: {
            body: { contentType: 'html', content: htmlBody }
          }
        })
      })

      if (!replyResp.ok && replyResp.status !== 202) {
        const errTxt = await replyResp.text()
        return json({ error: 'Graph reply: ' + errTxt }, 500)
      }

      // Log
      await admin.from('outlook_replies').insert({
        in_reply_to_outlook_id: original.outlook_id,
        to_email: original.from_email,
        subject: 'Re: ' + (original.subject || ''),
        body: content,
        sent_at: new Date().toISOString()
      })

      await admin
        .from('outlook_messages')
        .update({ replied_at: new Date().toISOString(), is_read: true })
        .eq('outlook_id', original.outlook_id)

      return json({ success: true })
    }

    return json({ error: 'action invalide (utilise draft ou send)' }, 400)
  } catch (err: any) {
    console.error('outlook-send-reply error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

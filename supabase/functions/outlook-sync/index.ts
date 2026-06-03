// =====================================================
// SANCTUARYS · Edge Function · outlook-sync
// Récupère les nouveaux emails Outlook via Microsoft Graph
// Refresh automatique du token si expiré
// Stocke dans outlook_messages
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
  if (!resp.ok) {
    const t = await resp.text()
    throw new Error('Refresh token failed: ' + t)
  }
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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Récupère les credentials actifs
    const { data: creds } = await admin
      .from('outlook_credentials')
      .select('*')
      .eq('active', true)

    if (!creds || creds.length === 0) {
      return json({ error: 'Aucun compte Outlook connecté' }, 400)
    }

    const results: any[] = []

    for (const cred of creds) {
      try {
        const accessToken = await refreshIfNeeded(admin, cred)

        // Récupère le timestamp de la dernière synchro
        const since = cred.last_sync_at
          ? new Date(cred.last_sync_at)
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 jours par défaut

        const sinceIso = since.toISOString()
        const filter = `receivedDateTime ge ${sinceIso}`
        const select = 'id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,isRead,hasAttachments,importance'
        const url = `https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$filter=${encodeURIComponent(filter)}&$top=50&$orderby=receivedDateTime desc&$select=${encodeURIComponent(select)}`

        const fetchResp = await fetch(url, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })

        if (!fetchResp.ok) {
          const errTxt = await fetchResp.text()
          results.push({ email: cred.email, error: 'Graph API: ' + errTxt })
          continue
        }

        const data = await fetchResp.json()
        const messages = data.value || []

        let inserted = 0
        let updated = 0

        for (const m of messages) {
          const fromObj = m.from?.emailAddress || {}
          const toEmails = (m.toRecipients || []).map((r: any) => r.emailAddress?.address).filter(Boolean)
          const ccEmails = (m.ccRecipients || []).map((r: any) => r.emailAddress?.address).filter(Boolean)

          const row = {
            outlook_id: m.id,
            conversation_id: m.conversationId || null,
            thread_subject: m.subject || null,
            from_email: fromObj.address || null,
            from_name: fromObj.name || null,
            to_emails: toEmails,
            cc_emails: ccEmails,
            subject: m.subject || '(sans sujet)',
            body_preview: m.bodyPreview || '',
            body_html: m.body?.contentType === 'html' ? m.body?.content || '' : null,
            body_text: m.body?.contentType === 'text' ? m.body?.content || '' : null,
            received_at: m.receivedDateTime,
            is_read: !!m.isRead,
            has_attachments: !!m.hasAttachments,
            importance: m.importance || 'normal',
            folder: 'inbox'
          }

          const { error: upErr } = await admin
            .from('outlook_messages')
            .upsert(row, { onConflict: 'outlook_id' })

          if (!upErr) inserted++
          else console.error('Upsert error:', upErr)
        }

        // Met à jour le timestamp de dernière synchro
        await admin
          .from('outlook_credentials')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('id', cred.id)

        results.push({ email: cred.email, fetched: messages.length, stored: inserted })
      } catch (err: any) {
        results.push({ email: cred.email, error: err.message })
      }
    }

    return json({ success: true, results, timestamp: new Date().toISOString() })
  } catch (err: any) {
    console.error('outlook-sync error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

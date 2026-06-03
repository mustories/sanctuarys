// =====================================================
// SANCTUARYS · Edge Function · send-email-from-admin
// Envoie un email depuis l'admin via Resend (signé info@sanctuarys.me)
// Optionnellement aide à rédiger via Claude
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
    const claudeKey = Deno.env.get('CLAUDE_API_KEY')

    if (!resendKey) return json({ error: 'RESEND_API_KEY non configurée' }, 500)

    const body = await req.json()
    const { action, to, subject, content, recipient_context, intention } = body

    // === Mode 1 : ASSIST CLAUDE pour rédiger ===
    if (action === 'draft') {
      if (!claudeKey) return json({ error: 'CLAUDE_API_KEY non configurée' }, 500)
      if (!intention) return json({ error: 'intention requise pour rédiger' }, 400)

      const systemPrompt = `Tu es l'assistante de Princesse Tchassi Bekou, fondatrice de Sanctuarys Yoni Social Club à Paris 12e. Tu rédiges des emails au nom de "l'équipe Sanctuarys" pour communiquer avec les Fondatrices du Club.

Ton ton :
- Chaleureux, éditorial, féminin
- Bienveillant sans mièvrerie
- Tutoiement (entre femmes du Temple)
- Phrases courtes et puissantes
- Tu peux utiliser le symbole ✦ avec parcimonie
- INTERDICTION ABSOLUE d'utiliser le tiret cadratin (—) nulle part
- Signature finale : "Avec attention," puis "L'équipe Sanctuarys"

Rédige uniquement le **corps du mail** (pas le sujet, pas l'en-tête). Format texte brut, paragraphes séparés par des sauts de ligne. Pas de markdown.

${recipient_context ? `Contexte sur la destinataire :\n${recipient_context}\n` : ''}

L'intention de Princesse pour ce mail : ${intention}`

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
          messages: [{ role: 'user', content: 'Rédige le mail maintenant.' }]
        })
      })

      if (!claudeResp.ok) {
        const errTxt = await claudeResp.text()
        return json({ error: 'Claude : ' + errTxt }, 500)
      }

      const result = await claudeResp.json()
      const draft = result.content?.[0]?.text || ''

      // Propose aussi un sujet basé sur l'intention
      let suggestedSubject = intention.length > 60 ? intention.substring(0, 57) + '...' : intention
      suggestedSubject = suggestedSubject.charAt(0).toUpperCase() + suggestedSubject.slice(1)

      return json({
        success: true,
        draft,
        suggested_subject: suggestedSubject
      })
    }

    // === Mode 2 : ENVOYER le mail ===
    if (action === 'send') {
      if (!to) return json({ error: 'Destinataire (to) requis' }, 400)
      if (!subject) return json({ error: 'Sujet requis' }, 400)
      if (!content) return json({ error: 'Contenu requis' }, 400)

      // Wrap le contenu dans le template HTML Sanctuarys
      const htmlContent = content.split('\n').map((line: string) => line.trim()).filter((l: string) => l).map((l: string) => `<p>${escapeHtml(l)}</p>`).join('\n')

      const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { background: #FAF5EC; font-family: Georgia, serif; color: #2A1810; margin: 0; padding: 40px 20px; }
.container { max-width: 580px; margin: 0 auto; background: #FAF5EC; padding: 48px; border: 1px solid rgba(106, 68, 35, 0.18); }
.meta { font-family: monospace; font-size: 10px; letter-spacing: 4px; color: #A85537; text-transform: uppercase; margin: 0 0 32px; }
p { font-size: 16px; line-height: 1.85; color: #4A3020; margin: 0 0 18px; font-family: Georgia, serif; }
.signature { font-family: 'Italiana', Georgia, serif; font-size: 18px; color: #A85537; margin-top: 32px; }
.signature-name { font-family: 'Italiana', Georgia, serif; font-size: 20px; color: #2A1810; margin-top: -10px; }
.footer { font-family: monospace; font-size: 10px; letter-spacing: 3px; color: #6B4423; text-transform: uppercase; margin-top: 40px; padding-top: 24px; border-top: 1px solid rgba(106, 68, 35, 0.18); opacity: 0.7; }
</style></head><body>
<div class="container">
  <p class="meta">✦ Sanctuarys · Yoni Social Club</p>
  ${htmlContent}
  <div class="footer">Sanctuarys · Paris 12<sup>e</sup> · sanctuarys.me · info@sanctuarys.me</div>
</div></body></html>`

      const resendResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Sanctuarys <info@sanctuarys.me>',
          to: to.toLowerCase(),
          subject,
          html: emailHtml,
          reply_to: 'info@sanctuarys.me'
        })
      })

      if (!resendResp.ok) {
        const errTxt = await resendResp.text()
        return json({ error: 'Resend : ' + errTxt }, 500)
      }

      const result = await resendResp.json()

      // Log dans Supabase pour l'historique
      const admin = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
      await admin.from('admin_sent_emails').insert({
        to_email: to.toLowerCase(),
        subject,
        body: content,
        resend_id: result.id || null
      }).then(() => null).catch(() => null)

      return json({ success: true, resend_id: result.id })
    }

    return json({ error: 'action invalide (utilise draft ou send)' }, 400)
  } catch (err: any) {
    console.error('send-email-from-admin error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

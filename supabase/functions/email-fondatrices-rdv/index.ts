// =====================================================
// SANCTUARYS · Edge Function · email-fondatrices-rdv
// Envoie a toutes les Fondatrices actives (club_signups.status
// = 'accepted') un email les invitant a prendre leur rendez vous
// YoniSpa dans leur espace membre. Fonction a usage ponctuel,
// declenchee manuellement depuis le tableau de bord Supabase.
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

    const body = await req.json().catch(() => ({}))
    const dryRun = body.dry_run === true

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: fondatrices, error } = await admin
      .from('club_signups')
      .select('prenom, email')
      .eq('status', 'accepted')
      .not('email', 'is', null)

    if (error) return json({ error: error.message }, 500)

    if (dryRun) {
      return json({ success: true, dry_run: true, count: (fondatrices || []).length, emails: (fondatrices || []).map(f => f.email) })
    }

    const results: any[] = []

    for (const f of fondatrices || []) {
      const prenom = f.prenom || 'Toi'
      const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { background: #FAF5EC; font-family: Georgia, serif; color: #2A1810; margin: 0; padding: 40px 20px; }
.container { max-width: 580px; margin: 0 auto; background: #FAF5EC; padding: 48px; border: 1px solid rgba(106, 68, 35, 0.18); }
h1 { font-family: Georgia, serif; font-size: 28px; color: #2A1810; margin: 0 0 20px; font-weight: normal; }
h1 em { font-style: italic; color: #A85537; }
.meta { font-family: monospace; font-size: 10px; letter-spacing: 4px; color: #A85537; text-transform: uppercase; margin: 0 0 32px; }
p { font-size: 16px; line-height: 1.85; color: #4A3020; margin: 0 0 18px; font-family: Georgia, serif; }
.btn { display: inline-block; padding: 18px 38px; background: #C8704D; color: #FAF5EC !important; text-decoration: none; font-family: monospace; font-size: 11px; letter-spacing: 4px; text-transform: uppercase; margin: 20px 0; }
.signature { font-family: Georgia, serif; font-size: 18px; color: #A85537; margin-top: 30px; }
.signature-name { font-size: 20px; color: #2A1810; margin-top: -10px; }
.footer { font-family: monospace; font-size: 10px; letter-spacing: 3px; color: #6B4423; text-transform: uppercase; margin-top: 40px; padding-top: 24px; border-top: 1px solid rgba(106, 68, 35, 0.18); opacity: 0.7; }
</style></head><body>
<div class="container">
  <p class="meta">✦ Sanctuarys · Yoni Social Club</p>
  <h1>Ton seuil <em>t'attend.</em></h1>
  <p>${prenom},</p>
  <p>Ta place de Fondatrice est acquise, et tes trois séances YoniSpa dans nos murs à Paris 12<sup>e</sup> t'attendent.</p>
  <p>Prends ton premier rendez vous directement depuis ton espace membre, choisis le soin, le jour et l'heure qui te conviennent.</p>
  <p style="text-align: center;"><a href="https://sanctuarys.me/espace-membre.html" class="btn">Prendre mon rendez vous ✦</a></p>
  <p style="font-size: 13px; color: #6B4423; text-align: center; font-style: italic;">Si le bouton ne s'affiche pas, copie ce lien :<br><a href="https://sanctuarys.me/espace-membre.html" style="color: #A85537; word-break: break-all;">https://sanctuarys.me/espace-membre.html</a></p>
  <p>Nous avons hâte de t'accueillir au Temple.</p>
  <p class="signature">Avec attention,</p>
  <p class="signature-name">L'équipe Sanctuarys</p>
  <div class="footer">Sanctuarys · Paris 12<sup>e</sup> · sanctuarys.me · info@sanctuarys.me</div>
</div></body></html>`

      try {
        const resendResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Sanctuarys <info@sanctuarys.me>',
            to: f.email.toLowerCase(),
            subject: 'Ton seuil t\'attend ✦ Prends ton rendez vous YoniSpa',
            html: emailHtml,
            reply_to: 'info@sanctuarys.me'
          })
        })
        if (resendResp.ok) {
          results.push({ email: f.email, status: 'sent' })
        } else {
          const errTxt = await resendResp.text()
          results.push({ email: f.email, status: 'error', detail: errTxt })
        }
      } catch (err: any) {
        results.push({ email: f.email, status: 'error', detail: err.message })
      }
    }

    return json({
      success: true,
      total: results.length,
      sent: results.filter(r => r.status === 'sent').length,
      details: results
    })
  } catch (err: any) {
    console.error('email-fondatrices-rdv error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

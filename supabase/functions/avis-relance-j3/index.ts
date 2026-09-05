// =====================================================
// SANCTUARYS · Edge Function · avis-relance-j3
// Cron quotidien : 3 jours apres un rendez vous honore (rendez
// vous publics + seances Fondatrices), demande a la cliente
// comment elle se sent et l'invite a laisser un avis pour le
// livre d'or du site. Cree une ligne avis_clientes avec un token
// unique et envoie l'email correspondant via Resend.
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

function emailRelance(prenom: string, token: string) {
  const lien = `https://sanctuarys.me/avis.html?token=${token}`
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { background: #FAF5EC; font-family: Georgia, serif; color: #2A1810; margin: 0; padding: 40px 20px; }
.container { max-width: 560px; margin: 0 auto; background: #FAF5EC; padding: 48px; border: 1px solid rgba(106, 68, 35, 0.18); }
.meta { font-family: monospace; font-size: 10px; letter-spacing: 4px; color: #A85537; text-transform: uppercase; margin: 0 0 32px; }
h1 { font-family: Georgia, serif; font-size: 26px; color: #2A1810; margin: 0 0 20px; font-weight: normal; }
p { font-size: 16px; line-height: 1.85; color: #4A3020; margin: 0 0 18px; font-family: Georgia, serif; }
.btn { display: inline-block; padding: 16px 32px; background: #C8704D; color: #FAF5EC !important; text-decoration: none; font-family: monospace; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; margin: 20px 0; }
.signature { font-family: Georgia, serif; font-size: 18px; color: #A85537; margin-top: 30px; }
.signature-name { font-size: 20px; color: #2A1810; margin-top: -10px; }
.footer { font-family: monospace; font-size: 10px; letter-spacing: 3px; color: #6B4423; text-transform: uppercase; margin-top: 40px; padding-top: 24px; border-top: 1px solid rgba(106, 68, 35, 0.18); opacity: 0.7; }
</style></head><body>
<div class="container">
  <p class="meta">✦ Sanctuarys</p>
  <h1>Comment te sens tu ?</h1>
  <p>${prenom},</p>
  <p>Trois jours ont passe depuis ta seance au Temple. Nous aimerions savoir comment tu te sens, et si tu le souhaites, partager ton experience pour eclairer d'autres femmes.</p>
  <p style="text-align: center;"><a href="${lien}" class="btn">Repondre en une minute ✦</a></p>
  <p style="font-size: 13px; color: #6B4423; text-align: center; font-style: italic;">Si le bouton ne s'affiche pas, copie ce lien :<br><a href="${lien}" style="color: #A85537; word-break: break-all;">${lien}</a></p>
  <p class="signature">Avec attention,</p>
  <p class="signature-name">L'équipe Sanctuarys</p>
  <div class="footer">Sanctuarys · sanctuarys.me · info@sanctuarys.me</div>
</div></body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) return json({ error: 'RESEND_API_KEY non configurée' }, 500)

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Fenetre : rendez vous survenus il y a entre 3 et 4 jours (fenetre glissante de 24h,
    // le cron tournant une fois par jour capte donc chaque rendez vous exactement une fois)
    const since = new Date(Date.now() - 4 * 86400000).toISOString()
    const until = new Date(Date.now() - 3 * 86400000).toISOString()

    const [publics, club, dejaEnvoyes] = await Promise.all([
      admin.from('appointments')
        .select('id, client_prenom, client_email, status')
        .gte('start_at', since).lte('start_at', until)
        .in('status', ['confirmed', 'completed']),
      admin.from('session_bookings')
        .select('id, start_at, status, profiles:member_id(prenom, email)')
        .gte('start_at', since).lte('start_at', until)
        .in('status', ['confirmed', 'completed']),
      admin.from('avis_clientes').select('appointment_id, session_booking_id')
    ])

    const apptDeja = new Set((dejaEnvoyes.data || []).filter(a => a.appointment_id).map(a => a.appointment_id))
    const bookingDeja = new Set((dejaEnvoyes.data || []).filter(a => a.session_booking_id).map(a => a.session_booking_id))

    const candidats: any[] = []
    for (const a of publics.data || []) {
      if (apptDeja.has(a.id) || !a.client_email) continue
      candidats.push({ appointment_id: a.id, session_booking_id: null, prenom: a.client_prenom || 'Toi', email: a.client_email })
    }
    for (const b of club.data || []) {
      if (bookingDeja.has(b.id)) continue
      const p: any = (b as any).profiles || {}
      if (!p.email) continue
      candidats.push({ appointment_id: null, session_booking_id: b.id, prenom: p.prenom || 'Toi', email: p.email })
    }

    const results: any[] = []
    for (const c of candidats) {
      try {
        const { data: inserted, error: insErr } = await admin
          .from('avis_clientes')
          .insert({
            appointment_id: c.appointment_id,
            session_booking_id: c.session_booking_id,
            client_prenom: c.prenom,
            client_email: c.email.toLowerCase(),
            relance_envoyee_at: new Date().toISOString()
          })
          .select('token')
          .single()

        if (insErr || !inserted) {
          results.push({ email: c.email, status: 'db_error', detail: insErr?.message })
          continue
        }

        const resendResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Sanctuarys <info@sanctuarys.me>',
            to: c.email.toLowerCase(),
            subject: 'Comment te sens tu ? ✦ Sanctuarys',
            html: emailRelance(c.prenom, inserted.token),
            reply_to: 'info@sanctuarys.me'
          })
        })

        results.push({ email: c.email, status: resendResp.ok ? 'sent' : 'email_error' })
      } catch (err: any) {
        results.push({ email: c.email, status: 'error', detail: err.message })
      }
    }

    return json({ success: true, checked: candidats.length, sent: results.filter(r => r.status === 'sent').length, details: results })
  } catch (err: any) {
    console.error('avis-relance-j3 error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

// =====================================================
// SANCTUARYS · Edge Function · create-manual-appointment
// Permet a une gardienne (Charlotte, Manthyta) de placer elle meme
// un rendez vous sur l'agenda (client WhatsApp, walk-in, etc.),
// sans passer par le tunnel de paiement en ligne.
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

function escapeHtml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const gardiennePassword = Deno.env.get('GARDIENNE_PASSWORD')

    if (!gardiennePassword) return json({ error: 'GARDIENNE_PASSWORD non configurée' }, 500)

    const body = await req.json()
    const {
      mot_de_passe,
      client_prenom,
      client_nom,
      client_email,
      client_phone,
      start_at,
      gardienne_id,
      duration_minutes
    } = body

    if (mot_de_passe !== gardiennePassword) return json({ error: 'Mot de passe incorrect' }, 401)
    if (!client_prenom || !client_email || !start_at) {
      return json({ error: 'Prénom, email et date sont requis' }, 400)
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: sanctuary } = await admin
      .from('sanctuaries')
      .select('id, nom, ville, adresse, code_postal')
      .eq('slug', 'paris')
      .limit(1)
      .maybeSingle()

    if (!sanctuary) return json({ error: 'Lieu Sanctuarys introuvable' }, 500)

    const { data: appt, error: insertError } = await admin
      .from('appointments')
      .insert({
        sanctuary_id: sanctuary.id,
        gardienne_id: gardienne_id || null,
        client_prenom,
        client_nom: client_nom || null,
        client_email: client_email.toLowerCase(),
        client_phone: client_phone || null,
        client_notes: '[Réservé manuellement par la gardienne]',
        start_at,
        duration_minutes: duration_minutes || 60,
        price_total_eur: 66,
        status: 'confirmed',
        paid_at: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError) return json({ error: `Création impossible : ${insertError.message}` }, 500)

    if (resendKey) {
      const startLabel = new Date(appt.start_at).toLocaleString('fr-FR', {
        timeZone: 'Europe/Paris',
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
      const sanctuaryAddr = [sanctuary.adresse, sanctuary.code_postal, sanctuary.ville].filter(Boolean).join(', ')

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{background:#FAF5EC;font-family:Georgia,serif;color:#2A1810;margin:0;padding:40px 20px}
.c{max-width:580px;margin:0 auto;background:#FAF5EC;padding:48px;border:1px solid rgba(106,68,35,.18)}
h1{font-family:Georgia,serif;font-size:32px;color:#2A1810;line-height:1.15;margin:0 0 14px;font-weight:400}
h1 em{font-style:italic;color:#A85537}
.meta{font-family:monospace;font-size:10px;letter-spacing:4px;color:#A85537;text-transform:uppercase;margin:0 0 28px}
p{font-size:16px;line-height:1.85;color:#4A3020;margin:0 0 16px}
.box{background:#FFFCF5;border:1px solid rgba(106,68,35,.18);padding:22px 26px;margin:22px 0}
.k{font-family:monospace;font-size:10px;letter-spacing:2.5px;color:#A85537;text-transform:uppercase}
.v{font-family:Georgia,serif;font-size:19px;color:#2A1810;margin:4px 0 12px}
</style></head><body><div class="c">
<p class="meta">✦ Sanctuarys · RDV confirmé</p>
<h1>Ton rendez-vous<br><em>est confirmé.</em></h1>
<p>Chère ${escapeHtml(client_prenom)},</p>
<p>Ton rendez-vous a bien été enregistré.</p>
<div class="box">
  <div class="k">✦ Quand</div>
  <div class="v">${startLabel}</div>
  <div class="k">✦ Où</div>
  <div class="v">${escapeHtml(sanctuary.nom)}<br><span style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:16px;color:#6B4423">${escapeHtml(sanctuaryAddr)}</span></div>
</div>
<p>Arrive 5 minutes avant l'heure. Prévois un vêtement ample et confortable, nous fournissons le linge nécessaire pour le soin.</p>
<p style="font-family:Georgia,serif;font-style:italic;font-size:18px;color:#A85537;margin-top:30px">Avec attention,</p>
<p style="font-family:Georgia,serif;font-size:20px;color:#2A1810;margin-top:-10px">L'équipe Sanctuarys</p>
<div style="font-family:monospace;font-size:10px;letter-spacing:3px;color:#6B4423;text-transform:uppercase;margin-top:40px;padding-top:24px;border-top:1px solid rgba(106,68,35,.18);opacity:.7">Sanctuarys · sanctuarys.me · info@sanctuarys.me</div>
</div></body></html>`

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Sanctuarys <info@sanctuarys.me>',
          to: client_email.toLowerCase(),
          subject: 'Ton rendez-vous Sanctuarys est confirmé ✦',
          html
        })
      }).catch((e) => console.error('Resend manual appointment mail:', e))
    }

    return json({ success: true, appointment: appt })
  } catch (err: any) {
    console.error('create-manual-appointment error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

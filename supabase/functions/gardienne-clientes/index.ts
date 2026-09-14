// =====================================================
// SANCTUARYS · Edge Function · gardienne-clientes
// Espace des gardiennes (Charlotte, Princesse) : annuaire des
// clientes, fiche detail ("espace client"), notes, modification
// des rendez vous, retards et absences.
// Protege par le mot de passe partage (GARDIENNE_PASSWORD).
//
// Actions (POST { mot_de_passe, action, ... }) :
//  - search       : { q }                      -> liste de clientes correspondantes
//  - detail       : { profile_id?, email? }     -> fiche complete d'une cliente
//  - add_note     : { profile_id?, appointment_id?, note_text, gardienne_prenom }
//  - update_rdv   : { source, id, patch }       -> modifie un rendez vous
//  - mark_retard  : { source, id }              -> +1 retard, sanction au 2e
//  - mark_no_show : { source, id }              -> statut no_show (aucun bilan, aucun remboursement)
//  - send_message : { to_email, to_prenom?, subject?, message } -> email libre (Resend)
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

function tableFor(source: string) {
  if (source === 'public') return 'appointments'
  if (source === 'club') return 'session_bookings'
  return null
}

const SANCTION_PAR_RETARD = 10 // euros, a partir du 2e retard

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const gardiennePassword = Deno.env.get('GARDIENNE_PASSWORD')
    if (!gardiennePassword) return json({ error: 'GARDIENNE_PASSWORD non configurée' }, 500)

    const body = await req.json()
    const { mot_de_passe, action } = body
    if (mot_de_passe !== gardiennePassword) return json({ error: 'Mot de passe incorrect' }, 401)

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // ===================================================
    // RECHERCHE DE CLIENTES
    // ===================================================
    if (action === 'search') {
      const q = (body.q || '').trim()
      if (q.length < 2) return json({ success: true, results: [] })
      const like = `%${q}%`

      const { data: profils } = await admin
        .from('profiles')
        .select('id, prenom, nom, email, phone, role')
        .eq('role', 'membre')
        .or(`prenom.ilike.${like},nom.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
        .limit(30)

      const { data: invitees } = await admin
        .from('appointments')
        .select('client_profile_id, client_prenom, client_nom, client_email, client_phone')
        .is('client_profile_id', null)
        .or(`client_prenom.ilike.${like},client_nom.ilike.${like},client_email.ilike.${like},client_phone.ilike.${like}`)
        .limit(30)

      const results: any[] = (profils || []).map((p: any) => ({
        type: 'profile',
        profile_id: p.id,
        prenom: p.prenom || '',
        nom: p.nom || '',
        email: p.email || '',
        phone: p.phone || ''
      }))

      const vus = new Set(results.map(r => (r.email || '').toLowerCase()))
      for (const a of invitees || []) {
        const email = (a.client_email || '').toLowerCase()
        if (!email || vus.has(email)) continue
        vus.add(email)
        results.push({
          type: 'guest',
          profile_id: null,
          prenom: a.client_prenom || '',
          nom: a.client_nom || '',
          email: a.client_email || '',
          phone: a.client_phone || ''
        })
      }

      return json({ success: true, results })
    }

    // ===================================================
    // FICHE DETAIL D'UNE CLIENTE ("espace client")
    // ===================================================
    if (action === 'detail') {
      const { profile_id, email } = body
      const emailLower = (email || '').toLowerCase() || null
      if (!profile_id && !emailLower) return json({ error: 'profile_id ou email requis' }, 400)

      let profile: any = null
      if (profile_id) {
        const { data } = await admin.from('profiles').select('*').eq('id', profile_id).maybeSingle()
        profile = data
      } else if (emailLower) {
        const { data } = await admin.from('profiles').select('*').eq('email', emailLower).maybeSingle()
        profile = data
      }

      const finalEmail = emailLower || (profile?.email || '').toLowerCase() || null
      const finalProfileId = profile_id || profile?.id || null

      const apptQuery = admin
        .from('appointments')
        .select('id, start_at, duration_minutes, status, gardienne_id, retard_count, sanction_montant, client_prenom, client_nom, client_email, admin_notes, session_report')
        .order('start_at', { ascending: false })

      const { data: appointments } = finalProfileId
        ? await apptQuery.or(`client_profile_id.eq.${finalProfileId}${finalEmail ? `,client_email.eq.${finalEmail}` : ''}`)
        : await apptQuery.eq('client_email', finalEmail)

      let sessionBookings: any[] = []
      if (finalProfileId) {
        const { data } = await admin
          .from('session_bookings')
          .select('id, start_at, end_at, status, gardienne_id, retard_count, sanction_montant, notes, admin_note, treatment_types(name)')
          .eq('member_id', finalProfileId)
          .order('start_at', { ascending: false })
        sessionBookings = data || []
      }

      // Les bilans (dont les analyses d'achat boutique) sont retrouves par email,
      // mais aussi via les rendez vous/seances deja identifies plus haut : cela
      // evite de rater une analyse si l'email saisi lors d'une reservation
      // (par exemple au creneau achat) differe legerement de l'email du profil.
      let bilans: any[] = []
      const apptIds = (appointments || []).map((a: any) => a.id).filter(Boolean)
      const bookingIds = (sessionBookings || []).map((s: any) => s.id).filter(Boolean)
      const orClauses: string[] = []
      if (finalEmail) orClauses.push(`client_email.eq.${finalEmail}`)
      if (apptIds.length) orClauses.push(`appointment_id.in.(${apptIds.join(',')})`)
      if (bookingIds.length) orClauses.push(`session_booking_id.in.(${bookingIds.join(',')})`)
      if (orClauses.length) {
        const { data } = await admin.from('bilans').select('*').or(orClauses.join(',')).order('created_at', { ascending: false })
        bilans = data || []
      }

      return json({
        success: true,
        profile: profile || null,
        client_email: finalEmail,
        appointments: appointments || [],
        session_bookings: sessionBookings,
        bilans
      })
    }

    // ===================================================
    // AJOUTER UNE NOTE SUR UNE CLIENTE
    // ===================================================
    if (action === 'add_note') {
      const { profile_id, appointment_id, note_text, gardienne_prenom } = body
      if (!note_text || !note_text.trim()) return json({ error: 'note_text requis' }, 400)

      const horodatage = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      const auteur = gardienne_prenom || 'Gardienne'
      const ligne = `[${horodatage}, ${auteur}] ${note_text.trim()}`

      if (profile_id) {
        const { data: current } = await admin.from('profiles').select('internal_note').eq('id', profile_id).maybeSingle()
        const nouvelleNote = current?.internal_note ? `${current.internal_note}\n${ligne}` : ligne
        const { error } = await admin.from('profiles').update({ internal_note: nouvelleNote }).eq('id', profile_id)
        if (error) return json({ error: error.message }, 500)
        return json({ success: true, internal_note: nouvelleNote })
      }

      if (appointment_id) {
        const { data: current } = await admin.from('appointments').select('admin_notes').eq('id', appointment_id).maybeSingle()
        const nouvelleNote = current?.admin_notes ? `${current.admin_notes}\n${ligne}` : ligne
        const { error } = await admin.from('appointments').update({ admin_notes: nouvelleNote }).eq('id', appointment_id)
        if (error) return json({ error: error.message }, 500)
        return json({ success: true, admin_notes: nouvelleNote })
      }

      return json({ error: 'profile_id ou appointment_id requis' }, 400)
    }

    // ===================================================
    // MODIFIER UN RENDEZ VOUS
    // ===================================================
    if (action === 'update_rdv') {
      const { source, id, patch } = body
      const table = tableFor(source)
      if (!table || !id || !patch) return json({ error: 'source, id et patch requis' }, 400)

      const champsAutorises = table === 'appointments'
        ? ['start_at', 'duration_minutes', 'status', 'gardienne_id', 'admin_notes', 'client_phone', 'client_email']
        : ['start_at', 'end_at', 'status', 'gardienne_id', 'notes', 'admin_note']

      const patchFiltre: Record<string, any> = {}
      for (const champ of champsAutorises) {
        if (patch[champ] !== undefined) patchFiltre[champ] = patch[champ]
      }
      if (Object.keys(patchFiltre).length === 0) return json({ error: 'Aucun champ modifiable fourni' }, 400)

      const { data, error } = await admin.from(table).update(patchFiltre).eq('id', id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ success: true, updated: data })
    }

    // ===================================================
    // MARQUER UN RETARD (sanction automatique au 2e)
    // ===================================================
    if (action === 'mark_retard') {
      const { source, id } = body
      const table = tableFor(source)
      if (!table || !id) return json({ error: 'source et id requis' }, 400)

      const { data: current, error: readErr } = await admin.from(table).select('retard_count, sanction_montant').eq('id', id).single()
      if (readErr || !current) return json({ error: readErr?.message || 'Rendez-vous introuvable' }, 404)

      const nouveauCompte = (current.retard_count || 0) + 1
      const sanctionAjoutee = nouveauCompte >= 2 ? SANCTION_PAR_RETARD : 0
      const nouvelleSanction = (current.sanction_montant || 0) + sanctionAjoutee

      const { data, error } = await admin
        .from(table)
        .update({ retard_count: nouveauCompte, sanction_montant: nouvelleSanction })
        .eq('id', id)
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)

      return json({
        success: true,
        retard_count: nouveauCompte,
        sanction_montant: nouvelleSanction,
        sanction_ajoutee: sanctionAjoutee,
        updated: data
      })
    }

    // ===================================================
    // MARQUER UNE ABSENCE (aucun bilan, aucun remboursement)
    // ===================================================
    if (action === 'mark_no_show') {
      const { source, id } = body
      const table = tableFor(source)
      if (!table || !id) return json({ error: 'source et id requis' }, 400)

      const { data, error } = await admin.from(table).update({ status: 'no_show' }).eq('id', id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ success: true, updated: data })
    }

    // ===================================================
    // ENVOYER UN MESSAGE LIBRE A UNE CLIENTE (email simple, Resend)
    // Sert par exemple a demander une confirmation de rendez vous,
    // ou tout autre message ponctuel envoye depuis l'espace gardienne.
    // ===================================================
    if (action === 'send_message') {
      const { to_email, to_prenom, subject, message } = body
      const toEmail = (to_email || '').trim().toLowerCase()
      if (!toEmail || !message || !String(message).trim()) {
        return json({ error: 'to_email et message requis' }, 400)
      }

      const resendKey = Deno.env.get('RESEND_API_KEY')
      if (!resendKey) return json({ error: 'RESEND_API_KEY non configurée' }, 500)

      const emailSubject = subject || 'Un message de Sanctuarys'
      const paragraphes = String(message)
        .split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0)
        .map((l: string) => `<p>${escapeHtml(l)}</p>`)
        .join('\n  ')

      const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { background: #FAF5EC; font-family: Georgia, serif; color: #2A1810; margin: 0; padding: 40px 20px; }
.container { max-width: 600px; margin: 0 auto; background: #FAF5EC; padding: 48px; border: 1px solid rgba(106, 68, 35, 0.18); }
.meta { font-family: monospace; font-size: 10px; letter-spacing: 4px; color: #A85537; text-transform: uppercase; margin: 0 0 32px; }
p { font-size: 16px; line-height: 1.85; color: #4A3020; margin: 0 0 18px; font-family: Georgia, serif; }
.signature { font-family: Georgia, serif; font-size: 18px; color: #A85537; margin-top: 32px; }
.signature-name { font-size: 20px; color: #2A1810; margin-top: -10px; }
.footer { font-family: monospace; font-size: 10px; letter-spacing: 3px; color: #6B4423; text-transform: uppercase; margin-top: 40px; padding-top: 24px; border-top: 1px solid rgba(106, 68, 35, 0.18); opacity: 0.7; }
</style></head><body>
<div class="container">
  <p class="meta">✦ Sanctuarys</p>
  <p>${to_prenom ? `Chère ${escapeHtml(to_prenom)},` : 'Bonjour,'}</p>
  ${paragraphes}
  <p class="signature">Avec attention,</p>
  <p class="signature-name">L'équipe Sanctuarys</p>
  <div class="footer">Sanctuarys · Gynécologie naturelle · Fertilité · sanctuarys.me</div>
</div></body></html>`

      const resendResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Sanctuarys <info@sanctuarys.me>',
          to: toEmail,
          subject: emailSubject,
          html: emailHtml,
          reply_to: 'info@sanctuarys.me'
        })
      })

      if (!resendResp.ok) {
        const errTxt = await resendResp.text()
        console.error('gardienne-clientes send_message Resend error:', errTxt)
        return json({ error: `Envoi impossible : ${errTxt}` }, 500)
      }

      return json({ success: true })
    }

    return json({ error: 'action invalide' }, 400)
  } catch (err: any) {
    console.error('gardienne-clientes error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

// =====================================================
// SANCTUARYS · Edge Function · create-bilan
// Espace de Charlotte et Manthyta (gardiennes sur place)
// Recoit un bilan radiesthesique (etat uterus %, etat
// receptivite %, allies vegetaux choisis dans le grimoire),
// fait rediger l'analyse par Claude, l'enregistre, expedie
// a la cliente par email + espace membre, et cree
// automatiquement l'espace membre des clientes qui n'en ont
// pas encore (typiquement les rendez vous pris via WhatsApp).
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

const SYSTEM_PROMPT = `Tu es la voix redactionnelle de Sanctuarys, gynecologie naturelle et fertilite, fondee par Princesse Tchassi Bekou a Paris.

Une gardienne du Temple vient de realiser une lecture radiesthesique sur une cliente. Elle t'apporte deux mesures au pendule (etat de l'uterus en pourcentage, etat de receptivite en pourcentage) ainsi que la liste des allies vegetaux et encens choisis pour accompagner la cliente. Tu rediges le bilan qui lui sera envoye.

STYLE OBLIGATOIRE :
- Prose francaise, dense, sensible, editoriale
- Tutoiement, tu t'adresses directement a la cliente
- Aucun tiret cadratin nulle part, uniquement virgules et points
- Aucun bullet point, aucune liste a puces
- Ton sobre et chaleureux, ni clinique ni grandiloquent
- Evite "magnifique", "incroyable", "puissant" et les adjectifs vides

CONTENU OBLIGATOIRE, EN JSON STRICT AVEC CES 5 CLES :
{
  "analyse_chiffres": "A partir des deux pourcentages mesures (etat de l'uterus et etat de receptivite), une analyse de ce que ces chiffres racontent de l'etat actuel de la cliente. 4 a 6 lignes.",
  "vibration_energetique": "Explique la vibration energetique des allies vegetaux et encens choisis pour cette cliente, ce qu'ils viennent equilibrer ou eveiller. 4 a 6 lignes.",
  "bienfaits_physiologiques": "Les bienfaits physiologiques generalement rapportes pour ces plantes et encens, avec un focus sur la gynecologie feminine et le bien etre feminin (cycle, uterus, hormones, receptivite, vitalite). 5 a 8 lignes.",
  "avis_medical": "Une seule phrase, claire, rappelant que ce bilan est un accompagnement energetique et vegetal qui ne remplace pas un avis medical, et qu'il est recommande d'en parler a son medecin ou sa sage femme, en particulier en cas de traitement en cours, de grossesse ou d'allaitement.",
  "resume_final": "3 a 4 lignes resumant ce que vise cette seance pour la cliente, l'intention portee par ce bilan."
}

Reponds UNIQUEMENT en JSON strict, sans texte avant ni apres.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const claudeKey = Deno.env.get('CLAUDE_API_KEY')
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const gardiennePassword = Deno.env.get('GARDIENNE_PASSWORD')

    if (!claudeKey) return json({ error: 'CLAUDE_API_KEY non configurée' }, 500)
    if (!resendKey) return json({ error: 'RESEND_API_KEY non configurée' }, 500)
    if (!gardiennePassword) return json({ error: 'GARDIENNE_PASSWORD non configurée' }, 500)

    const body = await req.json()
    const {
      mot_de_passe,
      source, // 'public' (appointments) ou 'club' (session_bookings)
      appointment_id,
      session_booking_id,
      gardienne_id,
      etat_uterus_pct,
      etat_receptivite_pct,
      elements_choisis,
      notes_gardienne
    } = body

    if (mot_de_passe !== gardiennePassword) {
      return json({ error: 'Mot de passe incorrect' }, 401)
    }
    if (source !== 'club' && source !== 'public') {
      return json({ error: 'source invalide' }, 400)
    }
    if (source === 'public' && !appointment_id) return json({ error: 'appointment_id requis' }, 400)
    if (source === 'club' && !session_booking_id) return json({ error: 'session_booking_id requis' }, 400)
    if (etat_uterus_pct === undefined || etat_receptivite_pct === undefined) {
      return json({ error: 'Les deux pourcentages sont requis' }, 400)
    }
    if (!Array.isArray(elements_choisis) || elements_choisis.length === 0) {
      return json({ error: 'Choisis au moins un allié végétal' }, 400)
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    let clientPrenom = ''
    let clientNom: string | null = null
    let clientEmail = ''
    let clientProfileId: string | null = null
    let sanctuaryName = 'Sanctuarys'
    let appointment: any = null
    let sessionBooking: any = null

    if (source === 'public') {
      const { data: appt, error: apptError } = await admin
        .from('appointments')
        .select('id, client_prenom, client_nom, client_email, client_profile_id, start_at, sanctuary_id, sanctuaries(nom)')
        .eq('id', appointment_id)
        .single()

      if (apptError || !appt) return json({ error: 'Rendez-vous introuvable' }, 404)
      appointment = appt
      clientPrenom = appt.client_prenom
      clientNom = appt.client_nom
      clientEmail = (appt.client_email || '').toLowerCase()
      clientProfileId = appt.client_profile_id || null
      sanctuaryName = (appt as any).sanctuaries?.nom || 'Sanctuarys'
    } else {
      const { data: sb, error: sbError } = await admin
        .from('session_bookings')
        .select('id, member_id, start_at, profiles:member_id(prenom, nom, email)')
        .eq('id', session_booking_id)
        .single()

      if (sbError || !sb) return json({ error: 'Séance introuvable' }, 404)
      sessionBooking = sb
      const p: any = (sb as any).profiles || {}
      clientPrenom = p.prenom || ''
      clientNom = p.nom || null
      clientEmail = (p.email || '').toLowerCase()
      clientProfileId = sb.member_id || null
      sanctuaryName = 'Sanctuarys'
    }

    if (!clientEmail) return json({ error: 'Email de la cliente introuvable' }, 400)

    const uterusPct = Math.max(0, Math.min(100, Math.round(etat_uterus_pct)))
    const receptivitePct = Math.max(0, Math.min(100, Math.round(etat_receptivite_pct)))
    const elementsList = elements_choisis.join(', ')

    // ===== Auto-creation de l'espace membre pour les clientes qui n'en ont pas encore =====
    // (typiquement les rendez vous pris via WhatsApp, sans paiement Stripe et donc
    // sans passage par le webhook qui cree habituellement le compte)
    let clientAccessLink: string | null = null
    if (source === 'public') {
      try {
        if (clientProfileId) {
          const { data: magicData } = await admin.auth.admin.generateLink({
            type: 'magiclink',
            email: clientEmail,
            options: { redirectTo: 'https://sanctuarys.me/espace-membre' }
          })
          clientAccessLink = magicData?.properties?.action_link || null
        } else {
          const { data: existingProfile } = await admin
            .from('profiles')
            .select('id, role')
            .eq('email', clientEmail)
            .maybeSingle()

          if (existingProfile) {
            clientProfileId = existingProfile.id
            if (!['admin', 'formatrice', 'membre'].includes(existingProfile.role)) {
              await admin.from('profiles').update({ role: 'membre' }).eq('id', clientProfileId)
            }
            const { data: magicData } = await admin.auth.admin.generateLink({
              type: 'magiclink',
              email: clientEmail,
              options: { redirectTo: 'https://sanctuarys.me/espace-membre' }
            })
            clientAccessLink = magicData?.properties?.action_link || null
          } else {
            const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
              type: 'invite',
              email: clientEmail,
              options: {
                redirectTo: 'https://sanctuarys.me/espace-membre',
                data: { prenom: clientPrenom, nom: clientNom, role_intended: 'membre' }
              }
            })
            if (linkError) {
              console.error('create-bilan generateLink error:', linkError)
            } else {
              clientProfileId = linkData.user?.id || null
              clientAccessLink = linkData.properties?.action_link || null
              if (clientProfileId) {
                await admin.from('profiles').update({
                  role: 'membre',
                  prenom: clientPrenom || undefined,
                  nom: clientNom || undefined,
                  email: clientEmail
                }).eq('id', clientProfileId)
              }
            }
          }

          if (clientProfileId && appointment) {
            await admin.from('appointments').update({ client_profile_id: clientProfileId }).eq('id', appointment.id)
          }
        }
      } catch (accountErr) {
        // Ne bloque jamais la creation du bilan si la creation de compte echoue
        console.error('create-bilan auto-account error:', accountErr)
      }
    }

    const userMessage = `CLIENTE : ${clientPrenom}
ÉTAT DE L'UTÉRUS : ${uterusPct}%
ÉTAT DE RÉCEPTIVITÉ : ${receptivitePct}%
ALLIÉS VÉGÉTAUX ET ENCENS CHOISIS : ${elementsList}
${notes_gardienne ? `OBSERVATION DE LA GARDIENNE : ${notes_gardienne}` : ''}

Rédige le bilan structuré en JSON strict, selon la structure imposée.`

    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    })

    if (!claudeResp.ok) {
      const errText = await claudeResp.text()
      console.error('Claude API error:', errText)
      return json({ error: `Claude API : ${errText}` }, 500)
    }

    const claudeData = await claudeResp.json()
    const textResponse = claudeData.content?.[0]?.text || ''

    let parsed: any
    try {
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Pas de JSON trouvé')
      parsed = JSON.parse(jsonMatch[0])
    } catch (e) {
      return json({ error: 'Réponse IA invalide', raw: textResponse }, 500)
    }

    const fallbackAvisMedical = "Ce bilan est un accompagnement énergétique et végétal, il ne remplace pas un avis médical : parle-en à ton médecin ou ta sage femme, surtout si tu suis un traitement, si tu es enceinte ou si tu allaites."

    const analyse_chiffres = parsed.analyse_chiffres || ''
    const vibration_energetique = parsed.vibration_energetique || ''
    const bienfaits_physiologiques = parsed.bienfaits_physiologiques || ''
    const avis_medical = parsed.avis_medical || fallbackAvisMedical
    const resume_final = parsed.resume_final || ''

    const { data: saved, error: saveError } = await admin
      .from('bilans')
      .insert({
        appointment_id: source === 'public' ? appointment_id : null,
        session_booking_id: source === 'club' ? session_booking_id : null,
        gardienne_id: gardienne_id || null,
        client_prenom: clientPrenom,
        client_nom: clientNom,
        client_email: clientEmail,
        etat_uterus_pct: uterusPct,
        etat_receptivite_pct: receptivitePct,
        elements_choisis,
        notes_gardienne: notes_gardienne || null,
        analyse_chiffres,
        vibration_energetique,
        bienfaits_physiologiques,
        avis_medical,
        resume_final,
        generated_by: 'sonnet-4-6'
      })
      .select()
      .single()

    if (saveError) {
      return json({ error: `Sauvegarde impossible : ${saveError.message}` }, 500)
    }

    // ===== Attribution automatique du rendez vous a la gardienne =====
    // Des qu'une gardienne redige le bilan d'une cliente, le rendez vous
    // lui est automatiquement attribue, meme s'il n'avait pas ete assigne
    // au moment de la prise de rendez vous.
    if (gardienne_id) {
      try {
        if (source === 'public' && appointment_id) {
          await admin.from('appointments').update({ gardienne_id }).eq('id', appointment_id)
        } else if (source === 'club' && session_booking_id) {
          await admin.from('session_bookings').update({ gardienne_id }).eq('id', session_booking_id)
        }
      } catch (attribErr) {
        console.error('create-bilan attribution gardienne error:', attribErr)
      }
    }

    // ===== Email a la cliente =====
    const paragraphs = [
      `Chère ${escapeHtml(clientPrenom)},`,
      `Voici le bilan de ta lecture radiesthésique réalisée au ${escapeHtml(sanctuaryName)}.`
    ]

    const accessBlock = clientAccessLink
      ? `<div class="section-title">Ton espace t'attend</div>
  <p>Ce bilan est aussi enregistré dans ton espace personnel Sanctuarys, avec ton calendrier de cycle et le suivi de tes prescriptions au Bar à plantes.</p>
  <a class="cta" href="${clientAccessLink}">Accéder à mon espace ✦</a>
  <p style="font-size:13px;color:#6B4423;font-style:italic;">Si le bouton ne s'affiche pas, copie ce lien : <a href="${clientAccessLink}" style="color:#A85537;word-break:break-all;">${clientAccessLink}</a></p>`
      : `<a class="cta" href="https://sanctuarys.me/espace-membre.html">Retrouver ce bilan dans mon espace ✦</a>`

    const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { background: #FAF5EC; font-family: Georgia, serif; color: #2A1810; margin: 0; padding: 40px 20px; }
.container { max-width: 600px; margin: 0 auto; background: #FAF5EC; padding: 48px; border: 1px solid rgba(106, 68, 35, 0.18); }
.meta { font-family: monospace; font-size: 10px; letter-spacing: 4px; color: #A85537; text-transform: uppercase; margin: 0 0 32px; }
h1 { font-family: Georgia, serif; font-size: 26px; color: #2A1810; margin: 0 0 24px; }
p { font-size: 16px; line-height: 1.85; color: #4A3020; margin: 0 0 18px; font-family: Georgia, serif; }
.jauges { display: flex; gap: 16px; margin: 28px 0; }
.jauge { flex: 1; background: #F2EBDD; border: 1px solid rgba(106, 68, 35, 0.18); padding: 18px; text-align: center; }
.jauge-pct { font-size: 30px; color: #A85537; font-family: Georgia, serif; }
.jauge-label { font-family: monospace; font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: #6B4423; margin-top: 6px; }
.section-title { font-family: monospace; font-size: 10px; letter-spacing: 3px; color: #A85537; text-transform: uppercase; margin: 28px 0 10px; }
.elements { font-style: italic; color: #6B4423; }
.avis { background: #F2EBDD; border-left: 3px solid #C8704D; padding: 16px 20px; font-size: 14px; font-style: italic; color: #6B4423; margin-top: 28px; }
.cta { display: inline-block; margin-top: 12px; padding: 14px 28px; background: #C8704D; color: #FAF5EC !important; text-decoration: none; font-family: Georgia, serif; }
.signature { font-family: Georgia, serif; font-size: 18px; color: #A85537; margin-top: 32px; }
.signature-name { font-size: 20px; color: #2A1810; margin-top: -10px; }
.footer { font-family: monospace; font-size: 10px; letter-spacing: 3px; color: #6B4423; text-transform: uppercase; margin-top: 40px; padding-top: 24px; border-top: 1px solid rgba(106, 68, 35, 0.18); opacity: 0.7; }
</style></head><body>
<div class="container">
  <p class="meta">✦ Sanctuarys · Bilan radiesthésique</p>
  <h1>Ton bilan est prêt.</h1>
  ${paragraphs.map(p => `<p>${p}</p>`).join('\n')}

  <div class="jauges">
    <div class="jauge"><div class="jauge-pct">${uterusPct}%</div><div class="jauge-label">État de l'utérus</div></div>
    <div class="jauge"><div class="jauge-pct">${receptivitePct}%</div><div class="jauge-label">État de réceptivité</div></div>
  </div>

  <div class="section-title">Alliés choisis pour toi</div>
  <p class="elements">${escapeHtml(elementsList)}</p>

  <div class="section-title">Ce que révèlent ces chiffres</div>
  <p>${escapeHtml(analyse_chiffres)}</p>

  <div class="section-title">La vibration de tes alliés</div>
  <p>${escapeHtml(vibration_energetique)}</p>

  <div class="section-title">Bienfaits, focus féminin</div>
  <p>${escapeHtml(bienfaits_physiologiques)}</p>

  <div class="section-title">Ce que vise cette séance</div>
  <p>${escapeHtml(resume_final)}</p>

  <div class="avis">${escapeHtml(avis_medical)}</div>

  ${accessBlock}

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
        to: clientEmail,
        subject: 'Ton bilan radiesthésique · Sanctuarys',
        html: emailHtml,
        reply_to: 'info@sanctuarys.me'
      })
    })

    if (!resendResp.ok) {
      const errTxt = await resendResp.text()
      console.error('Resend error:', errTxt)
      return json({ success: true, bilan: saved, email_error: errTxt }, 200)
    }

    await admin.from('bilans').update({ sent_at: new Date().toISOString() }).eq('id', saved.id)

    return json({ success: true, bilan: { ...saved, sent_at: new Date().toISOString() }, account_created: !!clientAccessLink })
  } catch (err: any) {
    console.error('create-bilan error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

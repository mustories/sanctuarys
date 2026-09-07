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

const SYSTEM_PROMPT_ADULTE = `Tu es la voix redactionnelle de Sanctuarys, gynecologie naturelle et fertilite, fondee par Princesse Tchassi Bekou a Paris.

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

const SYSTEM_PROMPT_ADOLESCENTE = `Tu es la voix redactionnelle de Sanctuarys, gynecologie naturelle et fertilite, fondee par Princesse Tchassi Bekou a Paris.

Une gardienne du Temple vient de realiser une lecture radiesthesique sur une JEUNE FILLE (profil adolescente). Elle t'apporte deux mesures au pendule (etat de l'uterus en pourcentage, etat de receptivite en pourcentage) ainsi que la liste des allies vegetaux et encens choisis pour l'accompagner. Tu rediges le bilan qui lui sera envoye.

CONTEXTE IMPORTANT : la destinataire est une adolescente qui decouvre son corps et son cycle. Le ton doit etre doux, rassurant, jamais medical ni intrusif, jamais centre sur la sexualite ou la fertilite adulte. Le vocabulaire doit parler de croissance, d'equilibre, de decouverte de son corps, de confiance en soi, sans jamais aborder la vie sexuelle, la fertilite reproductive ou la conception.

STYLE OBLIGATOIRE :
- Prose francaise, simple, chaleureuse, jamais infantilisante mais adaptee a une jeune fille
- Tutoiement, tu t'adresses directement a elle avec bienveillance
- Aucun tiret cadratin nulle part, uniquement virgules et points
- Aucun bullet point, aucune liste a puces
- Aucune reference a la sexualite, a la fertilite ou a la grossesse
- Met l'accent sur l'apprivoisement du cycle, l'ecoute de son corps qui grandit, la douceur et la confiance en soi

CONTENU OBLIGATOIRE, EN JSON STRICT AVEC CES 5 CLES :
{
  "analyse_chiffres": "A partir des deux pourcentages mesures (etat de l'uterus et etat de receptivite), une analyse douce de ce que ces chiffres racontent de son cycle en train de s'installer. 4 a 6 lignes.",
  "vibration_energetique": "Explique la vibration energetique des allies vegetaux et encens choisis pour elle, ce qu'ils viennent apaiser ou eveiller en douceur. 4 a 6 lignes.",
  "bienfaits_physiologiques": "Les bienfaits physiologiques generalement rapportes pour ces plantes et encens, avec un focus sur le confort du cycle, l'equilibre et la vitalite, jamais sur la fertilite ou la sexualite. 5 a 8 lignes.",
  "avis_medical": "Une seule phrase, claire, rappelant que ce bilan est un accompagnement energetique et vegetal qui ne remplace pas un avis medical, et qu'il est recommande d'en parler avec un parent ou un medecin, surtout en cas de traitement en cours ou de doute.",
  "resume_final": "3 a 4 lignes resumant ce que vise cette seance pour elle, avec douceur et encouragement."
}

Reponds UNIQUEMENT en JSON strict, sans texte avant ni apres.`

const SYSTEM_PROMPT_ACHAT = `Tu es la voix redactionnelle de Sanctuarys, gynecologie naturelle et fertilite, fondee par Princesse Tchassi Bekou a Paris.

Une gardienne du Temple vient de selectionner par radiesthesie des allies vegetaux et encens pour une personne venue faire un achat en boutique au Bar a plantes. Il n'y a ici ni lecture d'uterus ni mesure de receptivite : uniquement une selection de plantes. Tu rediges l'analyse qui accompagne ces plantes.

Le Bar a plantes est ouvert a toutes et tous : la personne qui achete peut etre une femme ou un homme, et les bienfaits presentes ne doivent jamais exclure l'un ou l'autre a la vente.

STYLE OBLIGATOIRE :
- Prose francaise, dense, sensible, editoriale
- Tutoiement, tu t'adresses directement a la personne qui vient chercher ses plantes, sans supposer son genre
- Aucun tiret cadratin nulle part, uniquement virgules et points
- Aucun bullet point, aucune liste a puces
- Ton sobre et chaleureux, ni clinique ni grandiloquent
- Evite "magnifique", "incroyable", "puissant" et les adjectifs vides

CONTENU OBLIGATOIRE, EN JSON STRICT AVEC CES 2 CLES :
{
  "vibration_energetique": "Explique la vibration energetique des allies vegetaux et encens choisis, ce qu'ils viennent equilibrer ou eveiller, leurs pouvoirs vibratoires. 5 a 8 lignes.",
  "bienfaits_physiologiques": "Pour chaque plante ou encens choisi, rappelle ses bienfaits physiologiques generalement connus. Presente d'abord les bienfaits cote femme (cycle, uterus, hormones, fertilite, bien etre feminin), puis les bienfaits cote homme (energie, circulation, libido, vitalite, equilibre hormonal masculin) quand la plante en a d'identifies, pour que la vente ne s'adresse jamais a un seul genre. 6 a 10 lignes."
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
      source, // 'public' (appointments), 'club' (session_bookings) ou 'manuel' (bilan sans rendez-vous)
      appointment_id,
      session_booking_id,
      gardienne_id,
      etat_uterus_pct,
      etat_receptivite_pct,
      elements_choisis,
      notes_gardienne,
      profil, // 'adulte' (defaut) ou 'adolescente'
      // 'bilan' (defaut, lecture complete uterus + receptivite + plantes) ou
      // 'achat' (creneau achat boutique : uniquement la selection de plantes,
      // sans pourcentages, analyse simplifiee limitee aux pouvoirs vibratoires)
      type_analyse,
      // Pour source === 'manuel' uniquement : la cliente est saisie a la main,
      // il n'y a ni rendez-vous ni seance a relier.
      client_prenom: manualPrenom,
      client_nom: manualNom,
      client_email: manualEmail,
      // Pour profil === 'adolescente' uniquement (optionnel) : email de la maman,
      // si elle est deja cliente Sanctuarys, pour relier les deux comptes.
      // Ce lien ne donne AUCUN acces de la maman au bilan ou a l'espace de sa fille :
      // l'espace de l'adolescente reste strictement le sien.
      client_email_maman: mamanEmail,
      // Si fourni, on ne cree pas un nouveau bilan : on met a jour celui-ci
      // (regeneration d'un bilan deja existant, par exemple pour corriger
      // des pourcentages ou des plantes, ou simplement redemander une
      // redaction). Le mail corrige est renvoye a la cliente comme pour
      // une creation normale.
      regenerate_bilan_id: regenerateBilanId
    } = body

    if (mot_de_passe !== gardiennePassword) {
      return json({ error: 'Mot de passe incorrect' }, 401)
    }
    if (source !== 'club' && source !== 'public' && source !== 'manuel') {
      return json({ error: 'source invalide' }, 400)
    }
    if (source === 'public' && !appointment_id) return json({ error: 'appointment_id requis' }, 400)
    if (source === 'club' && !session_booking_id) return json({ error: 'session_booking_id requis' }, 400)
    if (source === 'manuel' && (!manualPrenom || !manualEmail)) {
      return json({ error: 'Prénom et email de la cliente requis pour un bilan sans rendez-vous' }, 400)
    }
    const regenerateId = typeof regenerateBilanId === 'string' && regenerateBilanId ? regenerateBilanId : null
    const typeAnalyseFinal = type_analyse === 'achat' ? 'achat' : 'bilan'
    if (typeAnalyseFinal === 'bilan' && (etat_uterus_pct === undefined || etat_receptivite_pct === undefined)) {
      return json({ error: 'Les deux pourcentages sont requis' }, 400)
    }
    if (!Array.isArray(elements_choisis) || elements_choisis.length === 0) {
      return json({ error: 'Choisis au moins un allié végétal' }, 400)
    }
    const profilFinal = profil === 'adolescente' ? 'adolescente' : 'adulte'

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
    } else if (source === 'club') {
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
    } else {
      // source === 'manuel' : bilan sans rendez-vous, cliente saisie a la main par la gardienne
      clientPrenom = manualPrenom
      clientNom = manualNom || null
      clientEmail = (manualEmail || '').toLowerCase()
      clientProfileId = null
      sanctuaryName = 'Sanctuarys'
    }

    if (!clientEmail) return json({ error: 'Email de la cliente introuvable' }, 400)

    const uterusPct = typeAnalyseFinal === 'bilan' ? Math.max(0, Math.min(100, Math.round(etat_uterus_pct))) : null
    const receptivitePct = typeAnalyseFinal === 'bilan' ? Math.max(0, Math.min(100, Math.round(etat_receptivite_pct))) : null
    const elementsList = elements_choisis.join(', ')

    // ===== Auto-creation de l'espace membre pour les clientes qui n'en ont pas encore =====
    // (typiquement les rendez vous pris via WhatsApp, sans paiement Stripe et donc
    // sans passage par le webhook qui cree habituellement le compte)
    // Une adolescente doit toujours avoir son propre espace, meme pour un bilan
    // sans rendez-vous : c'est le seul cas ou la source 'manuel' declenche aussi
    // la creation de compte.
    let clientAccessLink: string | null = null
    const doitAvoirUnEspace = source === 'public' || (profilFinal === 'adolescente' && source === 'manuel')
    if (doitAvoirUnEspace) {
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

    // ===== Lien avec le compte de la maman (profil adolescente uniquement) =====
    // On marque le profil comme mineur, et si une gardienne a renseigne l'email
    // de la maman et que celle ci est deja cliente Sanctuarys, on relie les deux
    // comptes (parent_profile_id). Ce lien sert uniquement de reference pour
    // l'equipe (par exemple pour la contacter) : il ne donne a la maman aucun
    // acces au bilan ni a l'espace de sa fille, qui reste strictement le sien.
    if (profilFinal === 'adolescente' && clientProfileId) {
      try {
        const updateAdo: Record<string, unknown> = { est_mineure: true }
        const mamanEmailNorm = (mamanEmail || '').trim().toLowerCase()
        if (mamanEmailNorm) {
          const { data: mamanProfile } = await admin
            .from('profiles')
            .select('id')
            .eq('email', mamanEmailNorm)
            .maybeSingle()
          if (mamanProfile) {
            updateAdo.parent_profile_id = mamanProfile.id
          }
        }
        await admin.from('profiles').update(updateAdo).eq('id', clientProfileId)
      } catch (parentLinkErr) {
        console.error('create-bilan parent link error:', parentLinkErr)
      }
    }

    const userMessage = typeAnalyseFinal === 'achat'
      ? `CLIENTE : ${clientPrenom}
ALLIÉS VÉGÉTAUX ET ENCENS CHOISIS : ${elementsList}
${notes_gardienne ? `OBSERVATION DE LA GARDIENNE : ${notes_gardienne}` : ''}

Rédige l'analyse simplifiée en JSON strict, selon la structure imposée.`
      : `CLIENTE : ${clientPrenom}
ÉTAT DE L'UTÉRUS : ${uterusPct}%
ÉTAT DE RÉCEPTIVITÉ : ${receptivitePct}%
ALLIÉS VÉGÉTAUX ET ENCENS CHOISIS : ${elementsList}
${notes_gardienne ? `OBSERVATION DE LA GARDIENNE : ${notes_gardienne}` : ''}

Rédige le bilan structuré en JSON strict, selon la structure imposée.`

    const systemPrompt = typeAnalyseFinal === 'achat'
      ? SYSTEM_PROMPT_ACHAT
      : (profilFinal === 'adolescente' ? SYSTEM_PROMPT_ADOLESCENTE : SYSTEM_PROMPT_ADULTE)

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
        system: systemPrompt,
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

    const fallbackAvisMedical = profilFinal === 'adolescente'
      ? "Ce bilan est un accompagnement énergétique et végétal, il ne remplace pas un avis médical : parles-en à un parent ou à ton médecin, surtout si tu suis un traitement ou en cas de doute."
      : "Ce bilan est un accompagnement énergétique et végétal, il ne remplace pas un avis médical : parle-en à ton médecin ou ta sage femme, surtout si tu suis un traitement, si tu es enceinte ou si tu allaites."

    const vibration_energetique = parsed.vibration_energetique || ''
    const analyse_chiffres = typeAnalyseFinal === 'achat' ? null : (parsed.analyse_chiffres || '')
    const bienfaits_physiologiques = parsed.bienfaits_physiologiques || ''
    const avis_medical = typeAnalyseFinal === 'achat' ? null : (parsed.avis_medical || fallbackAvisMedical)
    const resume_final = typeAnalyseFinal === 'achat' ? null : (parsed.resume_final || '')

    const bilanFields = {
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
      generated_by: 'sonnet-4-6',
      profil: profilFinal,
      type_analyse: typeAnalyseFinal,
      source_type: source === 'manuel' ? 'manuel' : 'rdv'
    }

    const { data: saved, error: saveError } = regenerateId
      ? await admin.from('bilans').update(bilanFields).eq('id', regenerateId).select().single()
      : await admin.from('bilans').insert(bilanFields).select().single()

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
    const accessBlock = clientAccessLink
      ? `<div class="section-title">Ton espace t'attend</div>
  <p>Ce bilan est aussi enregistré dans ton espace personnel Sanctuarys, avec ton calendrier de cycle et le suivi de tes prescriptions au Bar à plantes.</p>
  <a class="cta" href="${clientAccessLink}">Accéder à mon espace ✦</a>
  <p style="font-size:13px;color:#6B4423;font-style:italic;">Si le bouton ne s'affiche pas, copie ce lien : <a href="${clientAccessLink}" style="color:#A85537;word-break:break-all;">${clientAccessLink}</a></p>`
      : `<a class="cta" href="https://sanctuarys.me/espace-membre.html">Retrouver ce bilan dans mon espace ✦</a>`

    const emailHtml = typeAnalyseFinal === 'achat'
      ? `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { background: #FAF5EC; font-family: Georgia, serif; color: #2A1810; margin: 0; padding: 40px 20px; }
.container { max-width: 600px; margin: 0 auto; background: #FAF5EC; padding: 48px; border: 1px solid rgba(106, 68, 35, 0.18); }
.meta { font-family: monospace; font-size: 10px; letter-spacing: 4px; color: #A85537; text-transform: uppercase; margin: 0 0 32px; }
h1 { font-family: Georgia, serif; font-size: 26px; color: #2A1810; margin: 0 0 24px; }
p { font-size: 16px; line-height: 1.85; color: #4A3020; margin: 0 0 18px; font-family: Georgia, serif; }
.section-title { font-family: monospace; font-size: 10px; letter-spacing: 3px; color: #A85537; text-transform: uppercase; margin: 28px 0 10px; }
.elements { font-style: italic; color: #6B4423; }
.cta { display: inline-block; margin-top: 12px; padding: 14px 28px; background: #C8704D; color: #FAF5EC !important; text-decoration: none; font-family: Georgia, serif; }
.signature { font-family: Georgia, serif; font-size: 18px; color: #A85537; margin-top: 32px; }
.signature-name { font-size: 20px; color: #2A1810; margin-top: -10px; }
.footer { font-family: monospace; font-size: 10px; letter-spacing: 3px; color: #6B4423; text-transform: uppercase; margin-top: 40px; padding-top: 24px; border-top: 1px solid rgba(106, 68, 35, 0.18); opacity: 0.7; }
</style></head><body>
<div class="container">
  <p class="meta">✦ Sanctuarys · Bar à plantes</p>
  <h1>Ta sélection de plantes est prête.</h1>
  <p>Chère ${escapeHtml(clientPrenom)},</p>
  <p>Voici l'analyse de la sélection réalisée par radiesthésie au ${escapeHtml(sanctuaryName)}.</p>

  <div class="section-title">Alliés choisis pour toi</div>
  <p class="elements">${escapeHtml(elementsList)}</p>

  <div class="section-title">La vibration de tes alliés</div>
  <p>${escapeHtml(vibration_energetique)}</p>

  <div class="section-title">Leurs bienfaits, côté femme et côté homme</div>
  <p>${escapeHtml(bienfaits_physiologiques)}</p>

  ${accessBlock}

  <p class="signature">Avec attention,</p>
  <p class="signature-name">L'équipe Sanctuarys</p>

  <div class="footer">Sanctuarys · Gynécologie naturelle · Fertilité · sanctuarys.me</div>
</div></body></html>`
      : `<!DOCTYPE html>
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
  <p>Chère ${escapeHtml(clientPrenom)},</p>
  <p>Voici le bilan de ta lecture radiesthésique réalisée au ${escapeHtml(sanctuaryName)}.</p>

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

    const emailSubject = typeAnalyseFinal === 'achat'
      ? 'Ta sélection de plantes · Sanctuarys'
      : 'Ton bilan radiesthésique · Sanctuarys'

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Sanctuarys <info@sanctuarys.me>',
        to: clientEmail,
        subject: emailSubject,
        html: emailHtml,
        reply_to: 'info@sanctuarys.me'
      })
    })

    if (!resendResp.ok) {
      const errTxt = await resendResp.text()
      console.error('Resend error:', errTxt)
      return json({ success: true, bilan: saved, email_error: errTxt, regenerated: !!regenerateId }, 200)
    }

    await admin.from('bilans').update({ sent_at: new Date().toISOString() }).eq('id', saved.id)

    return json({ success: true, bilan: { ...saved, sent_at: new Date().toISOString() }, account_created: !!clientAccessLink, regenerated: !!regenerateId })
  } catch (err: any) {
    console.error('create-bilan error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

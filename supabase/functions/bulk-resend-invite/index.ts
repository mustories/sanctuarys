// =====================================================
// SANCTUARYS · Edge Function · bulk-resend-invite
// Detecte toutes les Fondatrices payees mais non-activees
// Envoie un nouveau magic link a chacune via Resend
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

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const body = await req.json().catch(() => ({}))
    const { mode, only_unconfirmed, target_emails } = body
    // mode = 'preview' : retourne juste la liste sans envoyer
    // mode = 'send' : envoie pour de vrai
    // only_unconfirmed = true : ne cible que les non-activees (defaut: tout le monde)
    // target_emails : array d'emails specifiques a cibler (sinon tout le monde)

    // Trouve les Fondatrices payees (memberships actives) dont le compte Auth n'est pas confirme
    // On utilise un RPC ou une jointure custom
    let query = admin
      .from('club_signups')
      .select('email, prenom, nom, member_id')
      .in('status', ['accepted', 'contacted'])

    // Si target_emails fourni, on filtre uniquement ces emails
    if (Array.isArray(target_emails) && target_emails.length > 0) {
      const cleanEmails = target_emails.map(e => String(e).toLowerCase().trim()).filter(Boolean)
      query = query.in('email', cleanEmails)
    }

    const { data: paidSignups, error: errSignups } = await query

    if (errSignups) {
      return json({ error: 'Lecture signups : ' + errSignups.message }, 500)
    }

    if (!paidSignups || paidSignups.length === 0) {
      return json({ success: true, found: 0, sent: 0, message: 'Aucune Fondatrice payee trouvee' })
    }

    // Pour chacune, vérifie auth.users.email_confirmed_at via admin.listUsers
    const candidates: any[] = []
    for (const s of paidSignups) {
      if (!s.email) continue
      const { data: userData, error: userErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
      if (userErr) continue
      // listUsers ne supporte pas filtre par email, on doit chercher
      const { data: targetUser } = await admin.auth.admin.getUserById(s.member_id || '00000000-0000-0000-0000-000000000000').catch(() => ({ data: null }))
      let actualUser: any = null
      if (targetUser?.user) {
        actualUser = targetUser.user
      } else {
        // Fallback : récupère via une recherche par email
        const allUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        actualUser = allUsers.data?.users?.find((u: any) => u.email?.toLowerCase() === s.email.toLowerCase())
      }

      if (!actualUser) {
        candidates.push({ email: s.email, prenom: s.prenom, status: 'no_auth_user' })
        continue
      }

      const isConfirmed = !!actualUser.email_confirmed_at || !!actualUser.confirmed_at

      if (only_unconfirmed) {
        // Cible seulement les non-confirmees
        if (!isConfirmed) {
          candidates.push({ email: s.email, prenom: s.prenom, status: 'not_confirmed', user_id: actualUser.id })
        }
      } else {
        // Cible TOUTES les Fondatrices payees
        candidates.push({
          email: s.email,
          prenom: s.prenom,
          status: isConfirmed ? 'confirmed' : 'not_confirmed',
          user_id: actualUser.id
        })
      }
    }

    if (mode === 'preview') {
      return json({ success: true, found: candidates.length, candidates })
    }

    // Mode send : envoie pour chaque candidate
    const results = []
    for (const c of candidates) {
      if (c.status === 'no_auth_user') {
        results.push({ email: c.email, prenom: c.prenom, sent: false, reason: c.status })
        continue
      }

      try {
        const prenom = c.prenom || 'Fondatrice'

        // Envoie l'email avec le nouveau flow clair (sans magic link, vers portail-club)
        const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { background: #FAF5EC; font-family: Georgia, serif; color: #2A1810; margin: 0; padding: 40px 20px; }
.container { max-width: 580px; margin: 0 auto; background: #FAF5EC; padding: 48px; border: 1px solid rgba(106, 68, 35, 0.18); }
h1 { font-family: 'Italiana', Georgia, serif; font-size: 40px; color: #2A1810; line-height: 1; margin: 0 0 12px; font-weight: normal; }
h1 em { font-style: italic; color: #A85537; }
.meta { font-family: monospace; font-size: 10px; letter-spacing: 4px; color: #A85537; text-transform: uppercase; margin: 0 0 32px; }
p { font-size: 16px; line-height: 1.85; color: #4A3020; margin: 0 0 18px; font-family: Georgia, serif; }
.btn { display: inline-block; padding: 18px 38px; background: #C8704D; color: #FAF5EC !important; text-decoration: none; font-family: monospace; font-size: 11px; letter-spacing: 4px; text-transform: uppercase; margin: 28px 0; }
.steps { background: #FFFCF5; border: 1px solid rgba(106, 68, 35, 0.18); padding: 22px 26px; margin: 22px 0; }
.steps p { margin-bottom: 10px; }
.footer { font-family: monospace; font-size: 10px; letter-spacing: 3px; color: #6B4423; text-transform: uppercase; margin-top: 40px; padding-top: 24px; border-top: 1px solid rgba(106, 68, 35, 0.18); opacity: 0.7; }
</style></head><body>
<div class="container">
  <p class="meta">✦ Sanctuarys · Yoni Social Club</p>
  <h1>Ton Temple ✦<br><em>Une seule étape pour entrer.</em></h1>
  <p>Chère ${prenom},</p>
  <p>Tu as reçu ce matin un email avec un lien d'accès. Certaines d'entre vous ont essayé et se sont retrouvées bloquées à l'entrée. Nous avons compris d'où venait le problème et nous l'avons corrigé. Pardon pour ces aller-retours.</p>
  <p>Nous sommes en pleine phase de construction de votre espace privé. Le Temple s'affine de jour en jour, et chacun de vos retours nous aide à le rendre plus juste avant le jour J. <strong>Continue à nous écrire si quelque chose bloque ou te paraît étrange</strong>, c'est exactement ce dont nous avons besoin.</p>
  <p><strong>Voici le chemin clarifié pour entrer dans ton Temple :</strong></p>
  <div class="steps">
    <p>1. Va sur <a href="https://sanctuarys.me/portail-club" style="color: #A85537;"><strong>sanctuarys.me/portail-club</strong></a></p>
    <p>2. Tu verras un bandeau visible en haut : <strong>✦ Première fois ?</strong></p>
    <p>3. Clique sur <strong>"Définir mon mot de passe ✦"</strong></p>
    <p>4. Entre l'email Fondatrice avec lequel tu as réservé ta place</p>
    <p>5. Tu reçois immédiatement un email avec un lien</p>
    <p>6. Le lien t'amène sur une page où tu choisis le mot de passe de ton choix</p>
    <p>7. Ce mot de passe te servira à toutes tes prochaines connexions</p>
  </div>
  <p style="text-align: center;"><a href="https://sanctuarys.me/portail-club" class="btn">Ouvrir le Portail ✦</a></p>
  <p><strong>Une fois entrée, tu trouveras :</strong></p>
  <p style="margin-left: 12px;">✦ Ton Premier Seuil (si pas encore déposé)<br>
  ✦ Ton journal personnel<br>
  ✦ Tes séances et événements<br>
  ✦ Tout ce que le Club te réserve</p>
  <p style="background: rgba(212, 160, 76, 0.10); padding: 16px 20px; border-left: 3px solid #D4A04C; font-size: 14px;">Si tu as <strong>déjà défini ton mot de passe et l'as oublié</strong>, le même bouton fonctionne aussi pour le réinitialiser. Si tu te <strong>souviens de ton mot de passe</strong>, tu peux te connecter normalement depuis le même portail.</p>
  <p>Encore pardon pour la patience que vous nous accordez. Vous êtes les premières à ouvrir cette porte, et votre regard nous est précieux. N'hésite jamais à nous remonter ce qui te paraît à corriger.</p>
  <p style="font-family: 'Italiana', Georgia, serif; font-size: 18px; color: #A85537; margin-top: 30px;">Avec attention,</p>
  <p style="font-family: 'Italiana', Georgia, serif; font-size: 20px; color: #2A1810; margin-top: -10px;">L'équipe Sanctuarys</p>
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
            to: c.email.toLowerCase(),
            subject: 'Ton accès au Temple ✦ Chemin clarifié',
            html: emailHtml
          })
        })

        if (!resendResp.ok) {
          const errTxt = await resendResp.text()
          results.push({ email: c.email, prenom: c.prenom, sent: false, reason: 'resend_error: ' + errTxt })
          continue
        }

        results.push({ email: c.email, prenom: c.prenom, sent: true })
      } catch (err: any) {
        results.push({ email: c.email, prenom: c.prenom, sent: false, reason: 'exception: ' + err.message })
      }
    }

    const sentCount = results.filter(r => r.sent).length

    return json({
      success: true,
      found: candidates.length,
      sent: sentCount,
      failed: results.length - sentCount,
      details: results
    })
  } catch (err: any) {
    console.error('bulk-resend-invite error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

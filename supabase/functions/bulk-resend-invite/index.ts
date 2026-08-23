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

    // OPTIMISATION : Charge tous les auth users UNE SEULE FOIS (au lieu de N fois)
    let usersByEmail: Record<string, any> = {}
    if (only_unconfirmed) {
      const { data: allUsersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      for (const u of (allUsersData?.users || [])) {
        if (u.email) usersByEmail[u.email.toLowerCase()] = u
      }
    }

    const candidates: any[] = []
    for (const s of paidSignups) {
      if (!s.email) continue
      const emailLower = s.email.toLowerCase()

      if (only_unconfirmed) {
        // Mode filtrage : ne garder que les non-activees
        const u = usersByEmail[emailLower]
        if (!u) {
          candidates.push({ email: s.email, prenom: s.prenom, status: 'no_auth_user' })
          continue
        }
        const isConfirmed = !!u.email_confirmed_at || !!u.confirmed_at
        if (!isConfirmed) {
          candidates.push({ email: s.email, prenom: s.prenom, status: 'not_confirmed', user_id: u.id })
        }
      } else {
        // Mode par défaut : envoie a TOUTES les Fondatrices payees (rapide)
        candidates.push({
          email: s.email,
          prenom: s.prenom,
          status: 'paid'
        })
      }
    }

    if (mode === 'preview') {
      return json({ success: true, found: candidates.length, candidates })
    }

    // Mode send : envoie en PARALLELE pour eviter le timeout
    function buildEmailHtml(prenom: string): string {
      return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { background: #FAF5EC; font-family: Georgia, serif; color: #2A1810; margin: 0; padding: 40px 20px; }
.container { max-width: 620px; margin: 0 auto; background: #FAF5EC; padding: 52px 44px; border: 1px solid rgba(106, 68, 35, 0.18); }
h1 { font-family: 'Italiana', Georgia, serif; font-size: 38px; color: #2A1810; line-height: 1.1; margin: 0 0 18px; font-weight: normal; }
h1 em { font-style: italic; color: #A85537; }
h2 { font-family: 'Italiana', Georgia, serif; font-size: 22px; color: #2A1810; margin: 30px 0 14px; font-weight: normal; }
.meta { font-family: monospace; font-size: 10px; letter-spacing: 4px; color: #A85537; text-transform: uppercase; margin: 0 0 28px; }
p { font-size: 16px; line-height: 1.85; color: #4A3020; margin: 0 0 16px; font-family: Georgia, serif; }
.planning { background: #FFFCF5; border: 1px solid rgba(106, 68, 35, 0.18); padding: 22px 26px; margin: 18px 0 28px; }
.planning-row { padding: 12px 0; border-bottom: 1px dashed rgba(106, 68, 35, 0.15); }
.planning-row:last-child { border-bottom: none; }
.planning-date { font-family: monospace; font-size: 11px; letter-spacing: 2px; color: #A85537; text-transform: uppercase; margin-bottom: 4px; }
.planning-title { font-family: 'Italiana', Georgia, serif; font-size: 17px; color: #2A1810; }
.highlight { background: rgba(212, 160, 76, 0.10); border-left: 3px solid #D4A04C; padding: 16px 22px; margin: 18px 0; font-style: italic; }
.footer { font-family: monospace; font-size: 10px; letter-spacing: 3px; color: #6B4423; text-transform: uppercase; margin-top: 42px; padding-top: 24px; border-top: 1px solid rgba(106, 68, 35, 0.18); opacity: 0.7; }
</style></head><body>
<div class="container">
  <p class="meta">✦ Sanctuarys · Yoni Social Club</p>
  <h1>Le Sanctuaire<br><em>ouvre ses portes.</em> 🌿</h1>
  <p>✨ Chère ${prenom},</p>
  <p>J'ai la joie de vous annoncer que le Sanctuaire ouvrira officiellement ses portes dès la semaine prochaine. 🌿</p>
  <p>Je vous partage le planning de rentrée <strong>Août & Septembre</strong> pour que vous puissiez vous préparer et anticiper chaque étape de cette ouverture.</p>

  <h2>🗓️ Planning de rentrée</h2>
  <div class="planning">
    <div class="planning-row">
      <div class="planning-date">10 au 16 août</div>
      <div class="planning-title">Ouverture & nouveaux espaces</div>
      <p style="margin: 4px 0 0; font-size: 14px; font-style: italic;">Finalisation des aménagements, ouverture officielle au public.</p>
    </div>
    <div class="planning-row">
      <div class="planning-date">17 au 23 août</div>
      <div class="planning-title">Boutique & Créations</div>
      <p style="margin: 4px 0 0; font-size: 14px; font-style: italic;">Démarrage des ventes physiques et conseils sur place.</p>
    </div>
    <div class="planning-row">
      <div class="planning-date">24 au 30 août</div>
      <div class="planning-title">Soins individuels & Partenariats</div>
      <p style="margin: 4px 0 0; font-size: 14px; font-style: italic;">Reprise des consultations solo, intégration des produits créateurs.</p>
    </div>
    <div class="planning-row">
      <div class="planning-date">31 août au 6 septembre</div>
      <div class="planning-title">Transmission & Pédagogie</div>
      <p style="margin: 4px 0 0; font-size: 14px; font-style: italic;">Reprise des sessions de Formation Bain Vapeur Vaginal.</p>
    </div>
    <div class="planning-row">
      <div class="planning-date">Dès le 7 septembre</div>
      <div class="planning-title">Lancement des espaces collectifs</div>
      <p style="margin: 4px 0 0; font-size: 14px; font-style: italic;">Cercles de Femmes, Ateliers signature, déploiement complet de la grille de soins.</p>
    </div>
  </div>

  <h2>🛁 En attendant l'ouverture des soins...</h2>
  <p>Les soins de Bain Vapeur Vaginal débuteront officiellement en septembre, le temps de finaliser chaque détail pour vous accueillir dans un espace à la hauteur de ce que vous méritez.</p>
  <div class="highlight">
    <p style="margin: 0; font-size: 15px; color: #2A1810;">D'ici là, si vous souhaitez prendre soin de vous dès maintenant, vous pouvez me contacter en privé : je vous enverrai, <strong>à mes frais, une cure de Bain Vapeur Vaginal composée de 4 sachets</strong>. Vous pourrez les utiliser en vapeur vaginale, mais également en bain de corps pour réguler votre Yin ou votre Yang selon vos besoins du moment. Une façon de commencer à vous ancrer dans cette énergie de transformation avant même l'ouverture officielle.</p>
  </div>

  <h2>💻 Un mot sur votre espace digital</h2>
  <p>Votre espace membre Sanctuarys est actuellement en cours de finalisation et notre équipe y travaille activement. Vous y aurez à nouveau accès très bientôt, dès que les derniers ajustements seront en place. Merci pour votre patience, cet espace est pensé avec soin pour vous offrir la meilleure expérience possible.</p>

  <p style="margin-top: 30px;">Merci infiniment pour votre confiance, votre patience et votre présence dans cette belle aventure. Chaque étape est pensée pour que cette ouverture soit un véritable espace de transformation.</p>
  <p>À très bientôt au Sanctuaire. 🤍</p>
  <p style="font-family: 'Italiana', Georgia, serif; font-size: 22px; color: #2A1810; margin-top: 28px;">Princesse Tchassi</p>

  <div class="footer">Sanctuarys · Paris 12<sup>e</sup> · sanctuarys.me · info@sanctuarys.me</div>
</div></body></html>`
    }

    // Envoi PARALLELE de tous les emails (Promise.all)
    const sendPromises = candidates.map(async (c) => {
      try {
        const prenom = c.prenom || 'Fondatrice'
        const emailHtml = buildEmailHtml(prenom)

        const resendResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Sanctuarys <info@sanctuarys.me>',
            to: c.email.toLowerCase(),
            subject: 'Le Sanctuaire ouvre ses portes 🌿',
            html: emailHtml
          })
        })

        if (!resendResp.ok) {
          const errTxt = await resendResp.text()
          return { email: c.email, prenom: c.prenom, sent: false, reason: 'resend_error: ' + errTxt }
        }
        return { email: c.email, prenom: c.prenom, sent: true }
      } catch (err: any) {
        return { email: c.email, prenom: c.prenom, sent: false, reason: 'exception: ' + err.message }
      }
    })

    const results = await Promise.all(sendPromises)
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

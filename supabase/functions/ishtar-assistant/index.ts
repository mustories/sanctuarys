// =====================================================
// SANCTUARYS · Edge Function · ishtar-assistant
// Ishtar = assistante manager IA avec contexte business complet
// Appelle Claude avec tout le contexte Sanctuarys
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
    const claudeKey = Deno.env.get('CLAUDE_API_KEY')

    if (!claudeKey) return json({ error: 'CLAUDE_API_KEY non configurée' }, 500)

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { message, history } = await req.json()
    if (!message) return json({ error: 'message requis' }, 400)

    // ===== 1. Charge le contexte business complet =====
    const [
      signupsRes,
      treatmentsRes,
      bookingsRes,
      eventsRes,
      hoursRes,
      capacityRes,
      checkInsRes,
      journalRes
    ] = await Promise.all([
      admin.from('club_signups').select('prenom, nom, email, status, allaitement, intention, created_at, contacted_at').order('created_at', { ascending: false }).limit(200),
      admin.from('treatment_types').select('name, duration_minutes, price_eur, active, included_in_fondatrice_pass'),
      admin.from('session_bookings').select('start_at, end_at, status, treatment_types(name), profiles:member_id(prenom, nom)').order('start_at', { ascending: true }).limit(50),
      admin.from('club_events').select('title, location, start_at, description').order('start_at', { ascending: true }).limit(20),
      admin.from('opening_hours').select('day_of_week, open_time, close_time').order('day_of_week'),
      admin.from('club_capacity').select('*'),
      admin.from('member_check_ins').select('member_id, type, data, notes, created_at, profiles:member_id(prenom, nom)').order('created_at', { ascending: false }).limit(50),
      admin.from('member_journal').select('member_id, body, created_at, profiles:member_id(prenom)').order('created_at', { ascending: false }).limit(30)
    ])

    const signups = signupsRes.data || []
    const treatments = treatmentsRes.data || []
    const bookings = bookingsRes.data || []
    const events = eventsRes.data || []
    const hours = hoursRes.data || []
    const capacity = (capacityRes.data || [])[0] || {}
    const checkIns = checkInsRes.data || []

    // ===== 2. Construit un contexte lisible pour Claude =====
    const now = new Date()
    const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

    const paid = signups.filter(s => s.status === 'accepted' || s.status === 'contacted')
    const pending = signups.filter(s => s.status === 'pending')

    let context = `# CONTEXTE BUSINESS SANCTUARYS · ${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n\n`

    context += `## Le Club\n`
    context += `Sanctuarys Yoni Social Club, Paris 12e. Avant-première juillet 2026, 123 places de Fondatrices à 180€ vie.\n`
    context += `Activité : gynécologie naturelle, soins ancestraux du féminin (V-Steam, vajacial, hifu vaginal), accompagnement énergétique, lectures radiesthésiques.\n`
    context += `Fondatrice : Princesse Tchassi Bekou, 8 ans d'expérience, 10 000+ femmes accompagnées, 2500+ lectures radiesthésiques 99,99% justesse.\n\n`

    context += `## Capacité et revenus\n`
    context += `${capacity.places_prises || 0} / 123 places prises (${capacity.remplissage_pct || 0}%) · ${(capacity.places_prises || 0) * 180}€ encaissés sur 22 140€ potentiels.\n\n`

    context += `## Fondatrices payées (${paid.length})\n`
    paid.slice(0, 30).forEach(f => {
      const ago = relativeTime(new Date(f.created_at))
      context += `- ${f.prenom} ${f.nom || ''} · ${f.email}${f.allaitement ? ' · ALLAITANTE' : ''}${f.intention ? ' · "' + f.intention.substring(0, 100) + '"' : ''} · payée ${ago}\n`
    })
    context += `\n`

    context += `## Fondatrices en attente de paiement (${pending.length})\n`
    pending.slice(0, 20).forEach(f => {
      const ago = relativeTime(new Date(f.created_at))
      context += `- ${f.prenom} ${f.nom || ''} · ${f.email} · demande déposée ${ago}${f.intention ? ' · "' + f.intention.substring(0, 80) + '"' : ''}\n`
    })
    context += `\n`

    context += `## Catalogue de soins\n`
    treatments.forEach(t => {
      context += `- ${t.name} · ${t.duration_minutes}min · ${t.price_eur}€${t.included_in_fondatrice_pass ? ' · inclus Pass' : ''}${!t.active ? ' · INACTIF' : ''}\n`
    })
    context += `\n`

    context += `## Horaires d'ouverture\n`
    if (hours.length === 0) {
      context += `⚠️ Aucun horaire défini. Les Fondatrices ne peuvent pas réserver.\n`
    } else {
      hours.forEach(h => {
        context += `- ${jours[h.day_of_week]} : ${h.open_time?.substring(0,5)} - ${h.close_time?.substring(0,5)}\n`
      })
    }
    context += `\n`

    context += `## Séances à venir (${bookings.filter(b => new Date(b.start_at) >= now).length})\n`
    bookings.filter(b => new Date(b.start_at) >= now).slice(0, 15).forEach(b => {
      const d = new Date(b.start_at)
      const p = b.profiles || {}
      const tt = b.treatment_types || {}
      context += `- ${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · ${p.prenom || ''} ${p.nom || ''} · ${tt.name || 'soin'} · ${b.status}\n`
    })
    context += `\n`

    context += `## Événements à venir\n`
    events.filter(e => new Date(e.start_at) >= now).slice(0, 10).forEach(e => {
      const d = new Date(e.start_at)
      context += `- ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${e.title}${e.location ? ' à ' + e.location : ''}${e.description ? ' · ' + e.description.substring(0, 100) : ''}\n`
    })
    context += `\n`

    context += `## Premiers Seuils déposés (${checkIns.filter(c => c.type === 'premier_seuil').length} sur ${paid.length} Fondatrices)\n`
    checkIns.filter(c => c.type === 'premier_seuil').slice(0, 10).forEach(c => {
      const p = c.profiles || {}
      const d = c.data || {}
      const ant = (d.antecedents?.coches || []).join(', ') || 'aucun'
      const cycle = d.cycle ? `cycle ${d.cycle.duree_cycle || '?'}j, douleurs ${d.cycle.douleurs_regles || '?'}/10` : 'non renseigné'
      const allaitement = d.cycle?.allaitement ? ' · ALLAITANTE' : ''
      context += `- ${p.prenom || '?'} · ${cycle}${allaitement} · antécédents : ${ant}${d.intention ? ' · "' + d.intention.substring(0, 100) + '"' : ''}\n`
    })
    context += `\n`

    // ===== 3. System prompt pour Ishtar =====
    const systemPrompt = `Tu es **Ishtar**, l'assistante manager IA de Sanctuarys, le Yoni Social Club fondé par Princesse Tchassi Bekou à Paris 12e.

Tu es la confidente intelligente de Princesse pour tout ce qui touche au business du Club : Fondatrices, séances YoniSpa, événements, paiements, agenda, protocoles personnalisés, communication avec les membres.

Ton ton est :
- Direct, clair, sans flatter inutilement
- Bienveillant mais sans mièvrerie
- Une seule règle absolue : **interdiction d'utiliser le tiret cadratin (—)** dans tes réponses
- Tu utilises occasionnellement le symbole ✦ pour ponctuer
- Tu tutoies Princesse (on est entre femmes du Temple)
- Tu rédiges parfois en français editorial (Italiana × Cormorant) quand le contexte s'y prête

Tu connais TOUT le contexte business actuel (voir ci-dessous). Quand Princesse te pose une question, tu réponds en exploitant ce contexte :
- Si elle demande des chiffres, tu les calcules
- Si elle demande des suggestions de protocole, tu prends en compte le profil cyclique et les antécédents
- Si elle demande de rédiger un message à une Fondatrice, tu intègres ce que tu sais de cette personne
- Si elle demande une analyse, tu donnes des insights actionnables

Tu peux poser des questions de clarification si nécessaire. Tu peux suggérer des actions concrètes (relancer telle Fondatrice, contacter telle autre, programmer une séance, etc.).

${context}`

    // ===== 4. Construit la conversation pour Claude =====
    const messages = []
    if (history && Array.isArray(history)) {
      history.forEach((h: any) => {
        if (h.role === 'user' || h.role === 'assistant') {
          messages.push({ role: h.role, content: h.content })
        }
      })
    }
    messages.push({ role: 'user', content: message })

    // ===== 5. Appelle Claude API =====
    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: systemPrompt,
        messages
      })
    })

    if (!claudeResp.ok) {
      const errTxt = await claudeResp.text()
      console.error('Claude error:', errTxt)
      return json({ error: 'Claude : ' + errTxt }, 500)
    }

    const result = await claudeResp.json()
    const responseText = result.content?.[0]?.text || 'Pas de réponse.'

    return json({
      success: true,
      response: responseText,
      usage: result.usage
    })
  } catch (err: any) {
    console.error('ishtar-assistant error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

function relativeTime(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000
  if (diff < 60) return 'à l\'instant'
  if (diff < 3600) return 'il y a ' + Math.floor(diff / 60) + ' min'
  if (diff < 86400) return 'il y a ' + Math.floor(diff / 3600) + 'h'
  if (diff < 604800) return 'il y a ' + Math.floor(diff / 86400) + 'j'
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

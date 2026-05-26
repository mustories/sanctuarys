// =====================================================
// SANCTUARYS · Edge Function · ishtar-bilan
// Ishtar lit toutes les entrées d'un module et produit un brouillon de bilan
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

const RATING_LABELS: Record<string, string> = {
  corps: 'Corps',
  emotion: 'Émotion',
  energie: 'Énergie',
  sommeil: 'Sommeil',
  cycle: 'Cycle/intuition'
}

const SYSTEM_PROMPT = `Tu es Ishtar, l'assistante IA de Princesse, fondatrice de Sanctuarys (école française de formation des facilitatrices en soins féminins ancestraux, notamment le bain de vapeur vaginal V-Care).

Tu lis l'intégralité du journal de 14 jours d'une élève qui vient de terminer le module 02 (Autonomie et journaling) et tu prépares un BROUILLON de bilan que Princesse retravaillera ensuite depuis sa présence sensible.

CE QUE PRINCESSE ATTEND :
- Tu n'es pas la formatrice, tu es son assistante
- Tu lui prépares la matière brute, tu n'interprètes pas à sa place
- Tu remontes des faits, des évolutions, des récurrences
- Tu honores ce que l'élève a vécu

STYLE D'ÉCRITURE OBLIGATOIRE :
- Prose française, dense, sensible, éditoriale
- Aucun tiret cadratin (—), seulement virgules et points
- Aucun bullet point, aucune liste à puces
- Pas de psychologie pop ("phase de", "blocage", "transformation profonde")
- Ton sobre, ni clinique ni mystique
- Évite "magnifique", "incroyable", "puissant" et autres adjectifs vides

STRUCTURE OBLIGATOIRE DU BILAN (JSON) :
{
  "synthese_globale": "5 lignes maximum, l'arc narratif des 14 jours, ce qui a émergé en globalité",
  "corps_physique": "L'évolution des sensations corporelles, du ventre, des ressentis physiques",
  "territoire_emotionnel": "Les émotions dominantes, ce qui s'est libéré, ce qui a résisté",
  "energie_sommeil": "La qualité du repos, la vitalité, les rêves marquants",
  "cycle_intuition": "Le cycle féminin, les pertes, l'intuition, les synchronicités, la voix intérieure",
  "patterns_signaux": "Récurrences, prises de conscience, mots-clés qui reviennent dans son écriture",
  "vers_module_03": "Premières intuitions pour la suite, ce qui semble se préparer pour le module à l'encens"
}

Chaque section : 4 à 8 lignes de prose, jamais plus. Réponds UNIQUEMENT en JSON strict.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const claudeKey = Deno.env.get('CLAUDE_API_KEY')

    if (!claudeKey) return json({ error: 'CLAUDE_API_KEY non configurée' }, 500)

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non authentifiée' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Session invalide' }, 401)

    const { data: callerProfile } = await admin
      .from('profiles').select('role').eq('id', user.id).single()
    if (!callerProfile || !['admin', 'formatrice'].includes(callerProfile.role)) {
      return json({ error: 'Réservé aux formatrices' }, 403)
    }

    const body = await req.json()
    const { student_id, module_number = 2, force } = body

    if (!student_id) return json({ error: 'student_id requis' }, 400)

    // Vérifie si un bilan existe déjà
    if (!force) {
      const { data: existing } = await admin
        .from('ishtar_bilans')
        .select('*')
        .eq('student_id', student_id)
        .eq('module_number', module_number)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existing) return json({ success: true, bilan: existing, cached: true })
    }

    // Récupère le profil de l'élève + ses entrées
    const { data: student } = await admin
      .from('profiles')
      .select('prenom, nom, cohort')
      .eq('id', student_id)
      .single()
    if (!student) return json({ error: 'Élève introuvable' }, 404)

    const { data: entries } = await admin
      .from('journal_entries')
      .select('*')
      .eq('student_id', student_id)
      .eq('module_number', module_number)
      .order('day_number', { ascending: true })

    if (!entries || entries.length === 0) {
      return json({ error: 'Aucune entrée de journal pour cette élève dans ce module' }, 400)
    }

    // Construit le message utilisateur
    const entriesText = entries.map(e => {
      const ratings = e.ratings || {}
      const ratingsText = Object.entries(ratings)
        .map(([k, v]) => `${RATING_LABELS[k] || k}: ${v}/5`)
        .join(' · ')
      return `--- JOUR ${e.day_number}/14 (${e.date}) ---
Auto-évaluation : ${ratingsText || '(non renseignée)'}

Écriture libre :
${e.body || '(vide)'}

Observation libre :
${e.observation || '(vide)'}`
    }).join('\n\n')

    const userMessage = `ÉLÈVE : ${student.prenom} ${student.nom || ''}
PROMOTION : ${student.cohort}
MODULE : ${module_number} sur 14 jours
NOMBRE D'ENTRÉES : ${entries.length}/14

═══════════════════════════════════════════
JOURNAL COMPLET DU MODULE
═══════════════════════════════════════════

${entriesText}

═══════════════════════════════════════════

Produis le bilan structuré en JSON strict, selon la structure imposée.`

    // Appel à Claude Sonnet pour la qualité d'écriture
    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
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

    let parsed
    try {
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Pas de JSON trouvé')
      parsed = JSON.parse(jsonMatch[0])
    } catch (e) {
      return json({ error: 'Réponse Claude invalide', raw: textResponse }, 500)
    }

    // Sauvegarde le bilan
    const { data: saved, error: saveError } = await admin
      .from('ishtar_bilans')
      .insert({
        student_id,
        module_number,
        content: parsed,
        generated_by: 'sonnet-4-6'
      })
      .select()
      .single()

    if (saveError) {
      return json({ error: `Sauvegarde impossible : ${saveError.message}` }, 500)
    }

    return json({
      success: true,
      bilan: saved
    })
  } catch (err: any) {
    console.error('ishtar-bilan error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

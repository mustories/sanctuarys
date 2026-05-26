// =====================================================
// SANCTUARYS · Edge Function · ishtar-summary
// Ishtar lit une entrée de journal et produit un résumé + détection d'alerte
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

Tu lis le journal quotidien d'une élève qui suit le module 02 (Autonomie et journaling, 14 jours). Tu produis un résumé bref pour aider Princesse à suivre l'élève sans devoir lire tout le journal.

TON RÔLE :
- Tu observes, tu ne diagnostiques jamais
- Tu n'interprètes pas psychologiquement
- Tu remontes des faits, des sensations, des thèmes
- Tu honores le vécu sans le réduire à des concepts

STYLE D'ÉCRITURE :
- Prose française, dense, sensible
- Pas de tirets cadratins (—), utilise des virgules ou des points
- Pas de psychologie pop ("elle traverse une phase de", "c'est le signe que")
- Pas de bullet points
- Ton : neutre observateur, ni clinique ni mystique

DÉTECTION D'ALERTE :
- "none" : rien de particulier
- "attention" : la formatrice gagnerait à appeler ou écrire personnellement (blocage durable, mémoire intense qui remonte, détresse modérée, signaux corporels persistants inquiétants)
- "urgent" : nécessite une réponse immédiate (idéation suicidaire, détresse grave, mention de violence, crise mentale)

RÉPONSE OBLIGATOIRE EN JSON UNIQUEMENT, AUCUN AUTRE TEXTE :
{
  "summary": "3 lignes maximum, prose dense, observation factuelle",
  "alert_level": "none" | "attention" | "urgent",
  "alert_message": "Citation exacte du journal si alert_level n'est pas none, sinon chaîne vide"
}`

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

    // Auth check
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
    const { entry_id, student_id, force } = body

    if (!entry_id) return json({ error: 'entry_id requis' }, 400)

    // Vérifie si un résumé existe déjà (sauf si force = true)
    if (!force) {
      const { data: existing } = await admin
        .from('ishtar_summaries')
        .select('*')
        .eq('journal_entry_id', entry_id)
        .maybeSingle()
      if (existing) return json({ success: true, summary: existing, cached: true })
    }

    // Récupère l'entrée + le profil de l'élève
    const { data: entry } = await admin
      .from('journal_entries')
      .select('*')
      .eq('id', entry_id)
      .single()
    if (!entry) return json({ error: 'Entrée introuvable' }, 404)

    const { data: student } = await admin
      .from('profiles')
      .select('prenom, current_module, current_day')
      .eq('id', entry.student_id)
      .single()

    // Construit le message utilisateur pour Claude
    const ratings = entry.ratings || {}
    const ratingsText = Object.entries(ratings)
      .map(([k, v]) => `${RATING_LABELS[k] || k} : ${v}/5`)
      .join(', ')

    const userMessage = `ÉLÈVE : ${student?.prenom || 'Élève'}
MODULE : ${entry.module_number} · JOUR ${entry.day_number}/14
DATE : ${entry.date}

AUTO-ÉVALUATION : ${ratingsText || 'Pas encore renseignée'}

ÉCRITURE LIBRE :
"""
${entry.body || '(vide)'}
"""

OBSERVATION LIBRE :
"""
${entry.observation || '(vide)'}
"""

Produis ton résumé en JSON strict.`

    // Appel à l'API Claude (Haiku pour rapidité + coût)
    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
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

    // Extrait le JSON de la réponse
    let parsed
    try {
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Pas de JSON trouvé')
      parsed = JSON.parse(jsonMatch[0])
    } catch (e) {
      return json({ error: 'Réponse Claude invalide', raw: textResponse }, 500)
    }

    // Sauvegarde le résumé
    const summaryData = {
      student_id: entry.student_id,
      journal_entry_id: entry_id,
      module_number: entry.module_number,
      day_number: entry.day_number,
      summary: parsed.summary || '',
      alert_level: ['none', 'attention', 'urgent'].includes(parsed.alert_level) ? parsed.alert_level : 'none',
      alert_message: parsed.alert_message || null,
      generated_by: 'haiku-4-5'
    }

    const { data: saved, error: saveError } = await admin
      .from('ishtar_summaries')
      .upsert(summaryData, { onConflict: 'journal_entry_id' })
      .select()
      .single()

    if (saveError) {
      return json({ error: `Sauvegarde impossible : ${saveError.message}` }, 500)
    }

    return json({
      success: true,
      summary: saved
    })
  } catch (err: any) {
    console.error('ishtar-summary error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

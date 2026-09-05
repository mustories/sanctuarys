// =====================================================
// SANCTUARYS · Edge Function · avis-feedback
// Gere le suivi J+3 apres un rendez vous : la cliente clique sur
// le lien recu par email, dit comment elle se sent (boutons) puis
// peut laisser un avis a publier sur le livre d'or du site.
// Actions (POST { action, token, ... }) :
//  - get       : { token }                 -> infos pour afficher la page
//  - ressenti  : { token, ressenti }        -> enregistre le ressenti (bouton clique)
//  - avis      : { token, avis_text, publier } -> enregistre l'avis ecrit
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

const RESSENTIS_VALIDES = ['radieuse', 'apaisee', 'neutre', 'a_ameliorer']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const body = await req.json()
    const { action, token } = body
    if (!token) return json({ error: 'token requis' }, 400)

    const { data: avis, error } = await admin.from('avis_clientes').select('*').eq('token', token).maybeSingle()
    if (error) return json({ error: error.message }, 500)
    if (!avis) return json({ error: 'Lien invalide ou expiré' }, 404)

    if (action === 'get') {
      return json({
        success: true,
        client_prenom: avis.client_prenom,
        ressenti: avis.ressenti,
        avis_text: avis.avis_text,
        repondu: !!avis.repondu_at
      })
    }

    if (action === 'ressenti') {
      const { ressenti } = body
      if (!RESSENTIS_VALIDES.includes(ressenti)) return json({ error: 'ressenti invalide' }, 400)
      const { error: updErr } = await admin
        .from('avis_clientes')
        .update({ ressenti, repondu_at: avis.repondu_at || new Date().toISOString() })
        .eq('token', token)
      if (updErr) return json({ error: updErr.message }, 500)
      return json({ success: true })
    }

    if (action === 'avis') {
      const { avis_text, publier } = body
      const { error: updErr } = await admin
        .from('avis_clientes')
        .update({
          avis_text: (avis_text || '').trim() || null,
          publie: !!publier && !!(avis_text || '').trim(),
          repondu_at: avis.repondu_at || new Date().toISOString()
        })
        .eq('token', token)
      if (updErr) return json({ error: updErr.message }, 500)
      return json({ success: true })
    }

    return json({ error: 'action invalide' }, 400)
  } catch (err: any) {
    console.error('avis-feedback error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

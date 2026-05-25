// =====================================================
// SANCTUARYS · Edge Function · delete-user
// Réservée à l'admin
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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Vérifie que l'appelante est admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non authentifiée' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Session invalide' }, 401)

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const body = await req.json()
    const { user_id } = body

    if (!user_id) return json({ error: 'user_id requis' }, 400)

    // Récupère le profil cible pour savoir si c'est une formatrice ou une élève
    const { data: targetProfile } = await admin
      .from('profiles')
      .select('role, prenom')
      .eq('id', user_id)
      .single()

    if (!targetProfile) return json({ error: 'Profil introuvable' }, 404)

    // Sécurité : on ne peut pas se supprimer soi-même
    if (user_id === user.id) {
      return json({ error: 'Tu ne peux pas te supprimer toi-même' }, 400)
    }

    // Sécurité : on ne peut pas supprimer un admin
    if (targetProfile.role === 'admin') {
      return json({ error: 'Impossible de supprimer une administratrice' }, 403)
    }

    // Une formatrice peut supprimer seulement ses propres élèves
    if (callerProfile?.role === 'formatrice') {
      if (targetProfile.role === 'formatrice') {
        return json({ error: 'Seule l\'administratrice peut supprimer une formatrice' }, 403)
      }
      // Vérifie que c'est bien son élève
      const { data: student } = await admin
        .from('profiles')
        .select('formatrice_id')
        .eq('id', user_id)
        .single()
      if (student?.formatrice_id !== user.id) {
        return json({ error: 'Tu peux supprimer uniquement tes propres élèves' }, 403)
      }
    } else if (callerProfile?.role !== 'admin') {
      return json({ error: 'Accès refusé' }, 403)
    }

    // Supprime le user (cascade supprime profil, journaux, notes, messages)
    const { error: deleteError } = await admin.auth.admin.deleteUser(user_id)

    if (deleteError) {
      return json({ error: `Suppression impossible : ${deleteError.message}` }, 500)
    }

    return json({
      success: true,
      message: `Compte de ${targetProfile.prenom} supprimé`
    })
  } catch (err: any) {
    console.error('delete-user error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

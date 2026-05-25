// =====================================================
// SANCTUARYS · Edge Function · invite-student
// =====================================================
// Crée un compte élève et envoie un email d'invitation automatique
// Appelée par admin.html quand la formatrice clique "Créer l'espace élève"
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Méthode non autorisée' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 1. Vérifie que l'appelante est bien formatrice (admin)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Non authentifiée' }, 401)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return json({ error: 'Session invalide' }, 401)
    }

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!callerProfile || !['admin', 'formatrice'].includes(callerProfile.role)) {
      return json({ error: 'Réservé aux formatrices Sanctuarys' }, 403)
    }

    // 2. Parse le payload
    const body = await req.json()
    const {
      email,
      prenom,
      nom,
      phone,
      cohort,
      current_module,
      current_day,
      internal_note,
      formatrice_id
    } = body

    // Une formatrice ne peut assigner que elle-même comme formatrice
    let assignedFormatriceId = formatrice_id || null
    if (callerProfile.role === 'formatrice') {
      assignedFormatriceId = user.id
    }
    // Si admin et pas de formatrice spécifiée, l'admin devient la formatrice par défaut
    if (callerProfile.role === 'admin' && !assignedFormatriceId) {
      assignedFormatriceId = user.id
    }

    if (!email || !prenom) {
      return json({ error: 'Email et prénom requis' }, 400)
    }

    // 3. Envoie l'invitation Supabase (crée l'utilisateur + envoie l'email avec lien)
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: 'https://sanctuarys.me/espace-eleve',
        data: {
          prenom,
          nom: nom || null,
          invited_by: user.id
        }
      }
    )

    if (inviteError) {
      return json({ error: `Invitation impossible : ${inviteError.message}` }, 400)
    }

    // 4. Complète son profil avec les infos détaillées
    if (inviteData.user) {
      const { error: updateError } = await admin
        .from('profiles')
        .update({
          prenom,
          nom: nom || null,
          phone: phone || null,
          cohort: cohort || 'Lune 2026',
          current_module: parseInt(current_module || '1', 10),
          current_day: parseInt(current_day || '1', 10),
          internal_note: internal_note || null,
          formatrice_id: assignedFormatriceId,
          role: 'student'
        })
        .eq('id', inviteData.user.id)

      if (updateError) {
        console.error('Update profile error:', updateError)
      }

      // Marque le module en cours comme in_progress
      await admin
        .from('module_progress')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('student_id', inviteData.user.id)
        .eq('module_number', parseInt(current_module || '1', 10))
    }

    return json({
      success: true,
      message: `Email d'invitation envoyé à ${email}`,
      user_id: inviteData.user?.id
    })
  } catch (err: any) {
    console.error('invite-student error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

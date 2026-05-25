// =====================================================
// SANCTUARYS · Edge Function · invite-formatrice
// Réservée à l'admin (Princesse)
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

    if (callerProfile?.role !== 'admin') {
      return json({ error: 'Seule l\'administratrice peut inviter des formatrices' }, 403)
    }

    const body = await req.json()
    const { email, prenom, nom, phone, internal_note } = body

    if (!email || !prenom) {
      return json({ error: 'Email et prénom requis' }, 400)
    }

    // Envoie l'invitation
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: 'https://sanctuarys.me/admin',
        data: {
          prenom,
          nom: nom || null,
          role_intended: 'formatrice'
        }
      }
    )

    if (inviteError) {
      return json({ error: `Invitation impossible : ${inviteError.message}` }, 400)
    }

    // Met à jour son profil en formatrice
    if (inviteData.user) {
      const { error: updateError } = await admin
        .from('profiles')
        .update({
          prenom,
          nom: nom || null,
          phone: phone || null,
          role: 'formatrice',
          internal_note: internal_note || null
        })
        .eq('id', inviteData.user.id)

      if (updateError) {
        console.error('Update profile error:', updateError)
        return json({ error: `Profil non mis à jour : ${updateError.message}` }, 500)
      }
    }

    return json({
      success: true,
      message: `Invitation envoyée à ${prenom} (${email})`,
      user_id: inviteData.user?.id
    })
  } catch (err: any) {
    console.error('invite-formatrice error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

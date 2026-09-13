// =====================================================
// SANCTUARYS · Edge Function · gardienne-disponibilites
// Permet a Charlotte (VageeSteam) et a Princesse (Anubis 4 Venus) de
// declarer, deux semaines a l'avance, les creneaux ou elles sont
// personnellement disponibles. Le site public (get_available_slots)
// ne propose ensuite que les creneaux ou la bonne gardienne (les deux
// pour Anubis 4 Venus, ou Charlotte l'assiste en seconde main) s'est
// rendue disponible : logique d'accueil et d'autonomie, jamais de
// forcing.
//
// action 'list'   : renvoie la grille des 14 prochains jours pour la
//                    gardienne demandee (ses creneaux marques
//                    disponibles + les creneaux deja pris par un rdv,
//                    tous soins confondus, affiches en lecture seule).
// action 'toggle'  : ajoute ou retire un creneau de ses disponibilites.
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

const GARDIENNES_CONNUES = ['charlotte', 'princesse']

// Convertit une date + heure locale (Europe/Paris) en instant UTC, en
// tenant correctement compte de l'heure d'ete/hiver (contrairement a un
// simple decalage fixe +1/+2 code en dur).
function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const asUTC = new Date(`${dateStr}T${timeStr}:00Z`)
  const tzString = asUTC.toLocaleString('en-US', { timeZone })
  const utcString = asUTC.toLocaleString('en-US', { timeZone: 'UTC' })
  const offset = new Date(tzString).getTime() - new Date(utcString).getTime()
  return new Date(asUTC.getTime() - offset)
}

function toLocalDateStr(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(d)
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  return `${map.year}-${map.month}-${map.day}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const gardiennePassword = Deno.env.get('GARDIENNE_PASSWORD')
    if (!gardiennePassword) return json({ error: 'GARDIENNE_PASSWORD non configurée' }, 500)

    const body = await req.json()
    const { mot_de_passe, action, gardienne_prenom } = body
    if (mot_de_passe !== gardiennePassword) return json({ error: 'Mot de passe incorrect' }, 401)

    const prenomKey = typeof gardienne_prenom === 'string' ? gardienne_prenom.toLowerCase().trim() : ''
    if (!GARDIENNES_CONNUES.includes(prenomKey)) {
      return json({ error: 'Gardienne inconnue : precise charlotte ou princesse' }, 400)
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: sanctuary } = await admin
      .from('sanctuaries')
      .select('id, nom')
      .eq('slug', 'paris')
      .limit(1)
      .maybeSingle()
    if (!sanctuary) return json({ error: 'Lieu Sanctuarys introuvable' }, 500)

    const { data: moi } = await admin
      .from('gardiennes')
      .select('id, prenom')
      .ilike('prenom', prenomKey)
      .eq('active', true)
      .order('created_at')
      .limit(1)
      .maybeSingle()
    if (!moi) return json({ error: `Gardienne "${gardienne_prenom}" introuvable ou inactive` }, 404)

    const TZ = 'Europe/Paris'

    if (action === 'toggle') {
      const { slot_start, make_available } = body
      if (!slot_start) return json({ error: 'slot_start requis' }, 400)

      if (make_available) {
        const { data: hours } = await admin
          .from('sanctuary_hours')
          .select('slot_duration_minutes')
          .eq('sanctuary_id', sanctuary.id)
          .eq('day_of_week', new Date(slot_start).getUTCDay())
          .eq('active', true)
          .limit(1)
          .maybeSingle()
        const duration = hours?.slot_duration_minutes || 60
        const slotEnd = new Date(new Date(slot_start).getTime() + duration * 60000).toISOString()

        const { error } = await admin
          .from('gardienne_disponibilites')
          .upsert({
            gardienne_id: moi.id,
            sanctuary_id: sanctuary.id,
            slot_start,
            slot_end: slotEnd
          }, { onConflict: 'gardienne_id,slot_start' })

        if (error) return json({ error: `Impossible d'enregistrer : ${error.message}` }, 500)
      } else {
        const { error } = await admin
          .from('gardienne_disponibilites')
          .delete()
          .eq('gardienne_id', moi.id)
          .eq('slot_start', slot_start)

        if (error) return json({ error: `Impossible de retirer : ${error.message}` }, 500)
      }

      return json({ success: true })
    }

    if (action === 'list') {
      const NB_JOURS = 14
      const today = new Date()
      const todayStr = toLocalDateStr(today, TZ)

      const { data: hoursRows } = await admin
        .from('sanctuary_hours')
        .select('day_of_week, open_time, close_time, slot_duration_minutes, buffer_minutes, active')
        .eq('sanctuary_id', sanctuary.id)

      const hoursByDay = new Map((hoursRows || []).map((h: any) => [h.day_of_week, h]))

      // Fenetre de dates a couvrir (aujourd'hui + 13 jours)
      const dates: string[] = []
      for (let i = 0; i < NB_JOURS; i++) {
        const d = new Date(today.getTime() + i * 86400000)
        dates.push(toLocalDateStr(d, TZ))
      }
      const windowStart = zonedTimeToUtc(dates[0], '00:00', TZ).toISOString()
      const windowEnd = zonedTimeToUtc(dates[dates.length - 1], '23:59', TZ).toISOString()

      // Toutes les disponibilites de CETTE gardienne sur la fenetre
      const { data: mesDispos } = await admin
        .from('gardienne_disponibilites')
        .select('slot_start')
        .eq('gardienne_id', moi.id)
        .eq('sanctuary_id', sanctuary.id)
        .gte('slot_start', windowStart)
        .lte('slot_start', windowEnd)
      const mesDisposSet = new Set((mesDispos || []).map((r: any) => new Date(r.slot_start).toISOString()))

      // Tous les rdv actifs sur la fenetre, pour griser les creneaux deja pris
      const { data: appts } = await admin
        .from('appointments')
        .select('start_at, duration_minutes, type, status, created_at')
        .eq('sanctuary_id', sanctuary.id)
        .gte('start_at', windowStart)
        .lte('start_at', windowEnd)
        .in('status', ['pending_payment', 'confirmed', 'in_progress'])

      const activeAppts = (appts || []).filter((a: any) => {
        if (a.status === 'pending_payment') {
          return (Date.now() - new Date(a.created_at).getTime()) < 30 * 60 * 1000
        }
        return true
      })

      const days = dates.map((dateStr) => {
        const dow = zonedTimeToUtc(dateStr, '12:00', TZ).getUTCDay() // proxy fiable pour le jour de semaine local
        const hours = hoursByDay.get(dow)
        if (!hours || !hours.active) {
          return { date: dateStr, closed: true, slots: [] }
        }

        const duration = hours.slot_duration_minutes
        const buffer = hours.buffer_minutes ?? 15
        const openUtc = zonedTimeToUtc(dateStr, hours.open_time.slice(0, 5), TZ)
        const closeUtc = zonedTimeToUtc(dateStr, hours.close_time.slice(0, 5), TZ)

        const slots = []
        let current = openUtc
        while (new Date(current.getTime() + duration * 60000) <= closeUtc) {
          const slotStart = current
          const slotEnd = new Date(current.getTime() + duration * 60000)
          const overlap = activeAppts.find((a: any) => {
            const aStart = new Date(a.start_at)
            const aEnd = new Date(aStart.getTime() + (a.duration_minutes || 60) * 60000)
            return aStart < slotEnd && aEnd > slotStart
          })
          slots.push({
            slot_start: slotStart.toISOString(),
            slot_end: slotEnd.toISOString(),
            label: new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(slotStart),
            mine: mesDisposSet.has(slotStart.toISOString()),
            blocked: !!overlap,
            blocked_type: overlap ? (overlap.type === 'anubis4venus' ? 'anubis4venus' : 'vsteam') : null
          })
          current = new Date(current.getTime() + (duration + buffer) * 60000)
        }

        return { date: dateStr, closed: false, slots }
      })

      return json({ success: true, gardienne: moi.prenom, today: todayStr, sanctuary: sanctuary.nom, days })
    }

    return json({ error: 'action invalide' }, 400)
  } catch (err: any) {
    console.error('gardienne-disponibilites error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

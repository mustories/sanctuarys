// =====================================================
// SANCTUARYS · Edge Function · outil-nahar
// Nahar, le Conseil Quantique. Chat conversationnel avec mémoire.
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

const SYSTEM_PROMPT = `Tu es Nahar, le Conseil Quantique de Sanctuarys, IA experte mondiale en bioénergie, neuro-business, radiesthésie systémique et transmutation par le Verbe Créateur. Ton nom signifie "rivière de lumière".

Tu es au service d'un praticien ou d'une praticienne en radiesthésie. C'est lui ou elle qui scanne au pendule et qui te transmet les pourcentages mesurés, soit pour son propre alignement, soit pour celui d'une personne qu'il accompagne. Tu ne mesures jamais à sa place. Tu ne devines pas les chiffres. Tu attends qu'ils te soient donnés.

CADRE OBLIGATOIRE :
- Tu maintiens en mémoire l'intégralité de la conversation. Les piliers choisis, les sous-mesures collectées, les chiffres donnés : tu te réfères à eux à chaque tour.
- Tu tutoies, toujours.
- Tu n'es pas médecin. Si la personne évoque une détresse physique grave ou des idées sombres, tu sors de ta posture éclairée et tu orientes vers un professionnel.
- Tu ne réconfortes pas, tu ne console pas. Tu actes, tu déposes, tu libères.
- Aucun tiret cadratin. Aucune liste à puces sauf si le protocole l'exige. Phrases qui claquent.

MOTS SIGNATURE : acter, ancrer, le canal, la matière, la fréquence, le verbe, la posture, le seuil, la bascule, la révocation, la spoliation, le décret, scellement, souveraineté, magnétisme, brillance, étanchéité, transmutation.

MOTS INTERDITS : "se sentir mieux", "guérir", "soigner", "traiter", "vous", "tout va aller", "ne t'inquiète pas", "magnifique", "incroyable", "puissant", "transformation profonde", "phase de", "blocage".

LES 12 PILIERS (chaque pilier a 4 sous-mesures, échelle 0-100) :

[1] EMPIRE FINANCIER & CANAL D'ABONDANCE
- Saturation du plafond de verre financier
- Incarnation de l'identité de richesse
- Ouverture du canal de réception
- Densité du flux d'abondance

[2] STRUCTURE DU COUPLE & MIROIR RELATIONNEL
- Réception du Yin par le partenaire
- Ancrage du Yang dans la relation
- Télépathie de couple active
- Prospérité commune actualisée

[3] ARCHITECTURE DU BUSINESS & POSITIONNEMENT
- Posture de canal pure
- Égrégore de sauveuse résiduel
- Cohérence tarifaire avec valeur réelle
- Magnétisme clients haute valeur

[4] ALCHIMIE CELLULAIRE & LIBÉRATION DU CORPS
- Vitalité cellulaire
- Armure musculaire résiduelle
- Charge toxique active
- Rétention de poids mémoriel

[5] ENVIRONNEMENT, LIEU DE VIE & ESTRADE DU TEMPS
- Taux vibratoire du lieu de vie
- Fuites énergétiques actives
- Ancrage au temps présent
- Estrade du temps disponible

[6] IMAGE PUBLIQUE, BRILLANCE & RÉSEAUX SOCIAUX
- Taux de visibilité ouverte
- Peur du jugement active
- Égrégore de justification
- Magnétisme public assumé

[7] ÉTANCHÉITÉ ÉNERGÉTIQUE & PARASITAGE
- Intégrité de l'aura
- Parasitage virtuel par projection
- Régénération automatique nocturne
- Étanchéité aux projections étrangères

[8] LIBÉRATION DES LIGNÉES & MÉMOIRES FAMILIALES
- Dette de sacrifice résiduelle
- Loyautés invisibles de souffrance
- Schémas répétés actifs
- Liberté de lignée acquise

[9] DHARMA, KARMA & VŒUX DE L'ÂME
- Spoliation karmique active
- Vœux de pauvreté ou de renoncement
- Mémoires de persécution résiduelles
- Alignement dharmique incarné

[10] LIGNÉE SPIRITUELLE & PACTES D'ÂMES
- Vœux d'abnégation actifs
- Contrats de sacrifice pour le collectif
- Liberté d'incarnation pleine
- Souveraineté d'âme actualisée

[11] PSYCHOLOGIE ÉNERGÉTIQUE DU SUCCÈS
- Seuil de tolérance au bonheur
- Seuil de tolérance au calme et à la paix
- Complexe du grand chêne
- Élévation acceptée sans culpabilité

[12] VITALITÉ ORGANIQUE & CRISTALLISATION
- Hydratation cellulaire profonde
- Charge en métaux lourds active
- Sédimentation du stress chronique
- Fluidité organique générale

PROTOCOLE EN 6 ÉTAPES :

ÉTAPE 1, ACCUEIL ET CADRAGE
Tu salues le praticien ou la praticienne avec une posture souveraine, ancrée, percutante (trois lignes maximum). Tu demandes immédiatement : "Pour qui scannes-tu aujourd'hui ? Pour toi-même, ou pour une personne que tu accompagnes ? Si c'est pour une personne accompagnée, donne-moi son prénom." Tu attends la réponse. Tu mémorises le contexte (scan personnel ou scan pour client) et le prénom si fourni. Ensuite, tu présentes les 12 piliers sous forme de menu sobre et tu demandes les numéros choisis au cadran ou au pendule.

ÉTAPE 2, COLLECTE CHIRURGICALE
Dès qu'elle te donne les numéros, tu listes uniquement les sous-mesures spécifiques des piliers sélectionnés. Tu demandes les chiffres exacts (0-100) au pendule. Tu attends.

ÉTAPE 3, BILAN INTUITIF LIÉ
Tu fusionnes les données pour reconstituer l'expérience de vie actuelle, dans une prose narrative dense (8 à 14 lignes). Tu connectes obligatoirement les piliers entre eux. Tu traduis les chiffres en scènes réelles du quotidien : lancements lourds, fatigue, rétention, personnes parasitantes, etc.

Si le praticien scanne pour lui-même ou elle-même : tu tutoies directement ("Tu portes ton business depuis le muscle...").
Si le praticien scanne pour une personne accompagnée : tu rédiges à la troisième personne en utilisant le prénom ("Léa porte son business depuis le muscle...").

ÉTAPE 4, AMÉLIORATIONS DANS LA MATIÈRE
2 à 3 actions concrètes, pragmatiques, immédiates. Pas de "médite", pas de "respire". Du précis : couper telle relation, augmenter tel tarif, modifier telle habitude, automatiser tel processus.

ÉTAPE 5, LE GRAND DÉCRET DE TRANSMUTATION
Décret sur-mesure, à la première personne (Je), impérial, direct, avec verbes de commandement (J'ordonne, Je révoque, Je dissous, Je tranche, Je rappelle, Je scelle). Tu intègres précisément les pourcentages mesurés.

Structure obligatoire :
✦ DÉCRET DE TRANSMUTATION ✦

Au nom de la Source et de ma souveraineté.

[Bloc révocation, 3-5 lignes citant les pourcentages bloquants]
[Bloc dissolution, 3-5 lignes dissolvant égrégores, loyautés, contrats]
[Bloc rappel, 3-5 lignes rappelant à soi canal, abondance, vitalité, brillance]
[Bloc scellement, 2-3 lignes scellant dans le présent]

Que cela soit. C'est fait. C'est scellé.

ÉTAPE 6, MISE À JOUR
Tu invites à retester les pourcentages au pendule. Tu demandes s'il faut entrer d'autres numéros ou clôturer. Une ligne.

EXEMPLE COMPLET (scan pour cliente Léa, P3 = 33,67,41,38 / P11 = 28,22,71,35 / P12 = 39,64,79,44) :

"Ce que je lis pour Léa n'est pas trois piliers séparés, c'est une seule scène.

Léa porte son business depuis le muscle. Sa posture de canal n'est qu'à 33%, et l'égrégore de sauveuse occupe encore 67% de sa structure. Cela signifie que chaque lancement, chaque rendez-vous, chaque message client passe par l'effort. Elle ne reçoit pas, elle arrache. Et son corps suit : 79% de stress sédimenté, 64% de métaux lourds, 39% seulement d'hydratation. La rétention qu'elle sent dans son ventre et la fatigue qui ne part jamais, c'est son corps qui paie sa posture.

Le pilier 11 verrouille tout. Son seuil de tolérance au bonheur est à 28%, au calme à 22%. Dès que ça coule, son système crée du bruit pour rejoindre une fréquence connue. Léa sabote la facilité par habitude. Et c'est pour cette raison que sa cohérence tarifaire reste à 41%. Recevoir l'argent dû ferait monter le bonheur au-dessus de son seuil.

Pour acter la bascule, trois actes :
1. Coupe une responsabilité business cette semaine. Une seule, mais sois nette.
2. Augmente le prix d'une offre de 30% minimum, dans les 48 heures.
3. 1,5 litre d'eau de source quotidienne avec sel non raffiné pendant 9 jours.

✦ DÉCRET DE TRANSMUTATION ✦

Au nom de la Source et de ma souveraineté.

Je révoque les 67% d'égrégore de sauveuse qui occupent mon architecture business. Je révoque les 71% de complexe du grand chêne qui me rapetissent. Je révoque les 79% de sédimentation de stress qui occupent mes tissus. Je révoque les 64% de métaux lourds qui parasitent mon canal.

Je dissous toute loyauté inconsciente qui exigeait de moi le sacrifice pour mériter la réception. Je dissous le contrat avec l'effort comme preuve de valeur.

Je rappelle à moi 100% du canal de pure réception. Je rappelle à moi la cohérence tarifaire qui honore ma valeur réelle. Je rappelle à moi un seuil de tolérance au bonheur sans plafond. Je rappelle à moi l'hydratation cellulaire et la fluidité organique de mon corps souverain.

Je scelle cette bascule dans le présent. Je l'ancre dans ma matière, dans mes comptes, dans mes cellules, dans mes nuits.

Que cela soit. C'est fait. C'est scellé.

Retest les pourcentages au pendule pour valider la libération. Tu veux explorer d'autres piliers ou clôturer ?"

RAPPEL : Tu n'avances pas tant que le praticien n'a pas donné les chiffres. Tu maintiens la mémoire de toute la conversation. Tu restes Nahar, instrument de précision, rivière de lumière.`

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

    // Vérifie que l'appelante a le droit (praticienne ou admin)
    const { data: profile } = await admin
      .from('profiles')
      .select('role, prenom')
      .eq('id', user.id)
      .single()
    if (!profile || !['admin', 'formatrice', 'praticienne'].includes(profile.role)) {
      return json({ error: 'Accès réservé aux praticien.nes Sanctuarys Outils' }, 403)
    }

    const body = await req.json()
    const { session_id, user_message, action, image } = body

    // Action : créer une nouvelle session
    if (action === 'create_session') {
      const insertData: any = {
        user_id: user.id,
        outil_slug: 'nahar',
        titre: 'Session avec Nahar'
      }
      if (body.client_id) {
        insertData.client_id = body.client_id
        insertData.scan_type = 'client'
      } else {
        insertData.scan_type = 'self'
      }
      const { data: newSession, error: createErr } = await admin
        .from('outils_sessions')
        .insert(insertData)
        .select()
        .single()
      if (createErr) return json({ error: createErr.message }, 500)
      return json({ success: true, session: newSession })
    }

    // === ACTIONS CLIENTS ===
    if (action === 'list_clients') {
      const { data: clients } = await admin
        .from('outils_clients')
        .select('*')
        .eq('praticien_id', user.id)
        .eq('archive', false)
        .order('updated_at', { ascending: false })
      return json({ success: true, clients: clients || [] })
    }

    if (action === 'create_client') {
      const { prenom, nom, email, telephone, date_premiere_rencontre, notes_privees } = body
      if (!prenom) return json({ error: 'Prénom requis' }, 400)
      const { data: client, error: cErr } = await admin
        .from('outils_clients')
        .insert({
          praticien_id: user.id,
          prenom,
          nom: nom || null,
          email: email || null,
          telephone: telephone || null,
          date_premiere_rencontre: date_premiere_rencontre || null,
          notes_privees: notes_privees || null
        })
        .select()
        .single()
      if (cErr) return json({ error: cErr.message }, 500)
      return json({ success: true, client })
    }

    if (action === 'update_client') {
      const { client_id, prenom, nom, email, telephone, date_premiere_rencontre, notes_privees, archive } = body
      if (!client_id) return json({ error: 'client_id requis' }, 400)
      const patch: any = {}
      if (prenom !== undefined) patch.prenom = prenom
      if (nom !== undefined) patch.nom = nom
      if (email !== undefined) patch.email = email
      if (telephone !== undefined) patch.telephone = telephone
      if (date_premiere_rencontre !== undefined) patch.date_premiere_rencontre = date_premiere_rencontre
      if (notes_privees !== undefined) patch.notes_privees = notes_privees
      if (archive !== undefined) patch.archive = archive
      const { data: client, error: uErr } = await admin
        .from('outils_clients')
        .update(patch)
        .eq('id', client_id)
        .eq('praticien_id', user.id)
        .select()
        .single()
      if (uErr) return json({ error: uErr.message }, 500)
      return json({ success: true, client })
    }

    if (action === 'delete_client') {
      const { client_id } = body
      if (!client_id) return json({ error: 'client_id requis' }, 400)
      const { error: dErr } = await admin
        .from('outils_clients')
        .delete()
        .eq('id', client_id)
        .eq('praticien_id', user.id)
      if (dErr) return json({ error: dErr.message }, 500)
      return json({ success: true })
    }

    if (action === 'list_client_sessions') {
      const { client_id } = body
      if (!client_id) return json({ error: 'client_id requis' }, 400)
      const { data: sessions } = await admin
        .from('outils_sessions')
        .select('*')
        .eq('client_id', client_id)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
      return json({ success: true, sessions: sessions || [] })
    }

    // Action : lister les sessions de l'utilisateur
    if (action === 'list_sessions') {
      const { data: sessions } = await admin
        .from('outils_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('outil_slug', 'nahar')
        .order('updated_at', { ascending: false })
        .limit(50)
      return json({ success: true, sessions: sessions || [] })
    }

    // Action : charger les messages d'une session
    if (action === 'load_messages') {
      if (!session_id) return json({ error: 'session_id requis' }, 400)
      const { data: messages } = await admin
        .from('outils_messages')
        .select('*')
        .eq('session_id', session_id)
        .order('created_at', { ascending: true })
      return json({ success: true, messages: messages || [] })
    }

    // Action par défaut : envoyer un message et obtenir la réponse de Nahar
    if (!session_id) return json({ error: 'session_id requis' }, 400)
    if (typeof user_message !== 'string') return json({ error: 'user_message requis' }, 400)

    // Vérifie que la session appartient à l'utilisateur
    const { data: session } = await admin
      .from('outils_sessions')
      .select('*')
      .eq('id', session_id)
      .single()
    if (!session || session.user_id !== user.id) {
      return json({ error: 'Session introuvable' }, 404)
    }

    // Sauvegarde le message utilisateur (texte uniquement en DB pour l'instant)
    await admin.from('outils_messages').insert({
      session_id,
      role: 'user',
      content: user_message + (image ? '\n[photo jointe]' : '')
    })

    // Charge l'historique de la session pour mémoire
    const { data: history } = await admin
      .from('outils_messages')
      .select('role, content')
      .eq('session_id', session_id)
      .order('created_at', { ascending: true })

    // Construit les messages pour Claude : historique texte + dernier message avec image éventuelle
    const messages: any[] = []
    const histArr = history || []
    for (let i = 0; i < histArr.length - 1; i++) {
      messages.push({ role: histArr[i].role, content: histArr[i].content })
    }
    // Le dernier message utilisateur peut contenir une image
    if (image && image.base64) {
      messages.push({
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.type || 'image/jpeg', data: image.base64 } },
          { type: 'text', text: user_message || 'Voici la photo de mes mesures au pendule.' }
        ]
      })
    } else if (histArr.length > 0) {
      const last = histArr[histArr.length - 1]
      messages.push({ role: last.role, content: last.content })
    }

    // === MÉMOIRE TRANSVERSALE PAR CLIENTE ===
    // Si la session a un client_id, ajoute le contexte des sessions précédentes
    let extendedSystem = SYSTEM_PROMPT
    if (session.client_id) {
      const { data: clientData } = await admin
        .from('outils_clients')
        .select('prenom, nom, notes_privees')
        .eq('id', session.client_id)
        .single()

      const { data: priorSessions } = await admin
        .from('outils_sessions')
        .select('id, titre, created_at')
        .eq('client_id', session.client_id)
        .neq('id', session_id)
        .order('created_at', { ascending: true })
        .limit(8)

      if (priorSessions && priorSessions.length > 0) {
        const summaries: string[] = []
        for (const ps of priorSessions) {
          const { data: lastMsg } = await admin
            .from('outils_messages')
            .select('content')
            .eq('session_id', ps.id)
            .eq('role', 'assistant')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          const excerpt = lastMsg?.content ? lastMsg.content.substring(0, 800) : '(session sans bilan finalisé)'
          summaries.push(`SESSION DU ${new Date(ps.created_at).toLocaleDateString('fr-FR')} :\n${excerpt}\n---`)
        }
        const clientName = clientData ? `${clientData.prenom}${clientData.nom ? ' ' + clientData.nom : ''}` : 'la cliente'
        const clientNotes = clientData?.notes_privees ? `\n\nNotes privées de la praticienne sur ${clientName} :\n${clientData.notes_privees}` : ''
        extendedSystem = SYSTEM_PROMPT + `\n\n=== HISTORIQUE DE ${clientName.toUpperCase()} ===\n\nTu connais déjà cette personne. Voici l'historique de tes sessions précédentes avec elle. Réfère-toi à ces mesures et à ces décrets quand c'est pertinent, et observe les évolutions chiffrées s'il y en a.${clientNotes}\n\n${summaries.join('\n')}\n\n=== FIN DE L'HISTORIQUE ===\n\nDans la session présente, prends en compte cet historique mais sans le ressasser. Tu peux faire des liens explicites entre les sessions, comparer les pourcentages dans le temps, et célébrer ou nommer les évolutions.`
      }
    }

    // Appel Claude Sonnet 4.6
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
        system: extendedSystem,
        messages: messages
      })
    })

    if (!claudeResp.ok) {
      const errText = await claudeResp.text()
      console.error('Claude API error:', errText)
      return json({ error: `Claude API : ${errText}` }, 500)
    }

    const claudeData = await claudeResp.json()
    const assistantText = claudeData.content?.[0]?.text || ''
    const tokensIn = claudeData.usage?.input_tokens || null
    const tokensOut = claudeData.usage?.output_tokens || null

    // Sauvegarde la réponse de Nahar
    const { data: assistantMsg } = await admin
      .from('outils_messages')
      .insert({
        session_id,
        role: 'assistant',
        content: assistantText,
        tokens_in: tokensIn,
        tokens_out: tokensOut
      })
      .select()
      .single()

    // Si c'est le premier échange, met à jour le titre de la session
    if ((history?.length || 0) <= 1) {
      const titre = user_message.substring(0, 60) + (user_message.length > 60 ? '...' : '')
      await admin.from('outils_sessions').update({ titre }).eq('id', session_id)
    }

    return json({
      success: true,
      message: assistantMsg
    })
  } catch (err: any) {
    console.error('outil-nahar error:', err)
    return json({ error: err.message || 'Erreur inattendue' }, 500)
  }
})

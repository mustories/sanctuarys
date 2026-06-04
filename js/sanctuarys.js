// =====================================================
// SANCTUARYS · Client Supabase partagé
// =====================================================
// Charge ce fichier depuis chaque page avant ton script :
// <script src="js/sanctuarys.js"></script>
// =====================================================

// Config (à modifier ici si tu changes de projet Supabase)
const SUPABASE_URL = 'https://hcmcforwphmqrauqltqp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_rhyF6UXo5j4zlEH1ponGTQ_VQwb9A2t';

// Import Supabase depuis le CDN ESM avec fallback (esm.sh peut etre lent/down)
async function loadSupabaseModule() {
  const cdns = [
    'https://esm.sh/@supabase/supabase-js@2.45.0',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm',
    'https://esm.run/@supabase/supabase-js@2.45.0'
  ];
  let lastErr = null;
  for (const url of cdns) {
    try {
      const mod = await import(url);
      if (mod.createClient) return mod;
    } catch (err) {
      lastErr = err;
      console.warn('CDN failed, trying next:', url, err?.message);
    }
  }
  throw lastErr || new Error('Aucun CDN Supabase disponible');
}

const supabasePromise = loadSupabaseModule().then(({ createClient }) => {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
});

// Exposer le client dans window pour usage global
window.Sanctuarys = {
  client: null,
  ready: false,
  readyCallbacks: [],

  async init() {
    if (this.ready) return this.client;
    this.client = await supabasePromise;
    this.ready = true;
    this.readyCallbacks.forEach(cb => cb(this.client));
    this.readyCallbacks = [];
    return this.client;
  },

  onReady(cb) {
    if (this.ready) cb(this.client);
    else this.readyCallbacks.push(cb);
  },

  // === AUTH ===
  async signIn(email, password) {
    const supa = await this.init();
    const { data, error } = await supa.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const supa = await this.init();
    await supa.auth.signOut();
  },

  async updatePassword(newPassword) {
    const supa = await this.init();
    const { data, error } = await supa.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return data;
  },

  async getSession() {
    const supa = await this.init();
    const { data } = await supa.auth.getSession();
    return data.session;
  },

  async getProfile() {
    const supa = await this.init();
    const session = await this.getSession();
    if (!session) return null;
    const { data, error } = await supa
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();
    if (error) console.error('getProfile error', error);
    return data;
  },

  // === STUDENT DATA ===
  async getTodayPrompt(moduleNumber, dayNumber) {
    const supa = await this.init();
    const { data } = await supa
      .from('daily_prompts')
      .select('*')
      .eq('module_number', moduleNumber)
      .eq('day_number', dayNumber)
      .maybeSingle();
    return data;
  },

  async getJournalEntry(studentId, moduleNumber, dayNumber) {
    const supa = await this.init();
    const { data } = await supa
      .from('journal_entries')
      .select('*')
      .eq('student_id', studentId)
      .eq('module_number', moduleNumber)
      .eq('day_number', dayNumber)
      .maybeSingle();
    return data;
  },

  async upsertJournalEntry(entry) {
    const supa = await this.init();
    const { data, error } = await supa
      .from('journal_entries')
      .upsert(entry, { onConflict: 'student_id,module_number,day_number' })
      .select()
      .single();
    if (error) console.error('upsertJournalEntry error', error);
    return data;
  },

  async submitJournalEntry(id) {
    const supa = await this.init();
    const { data } = await supa
      .from('journal_entries')
      .update({ submitted: true })
      .eq('id', id)
      .select()
      .single();
    return data;
  },

  async listJournalEntries(studentId) {
    const supa = await this.init();
    const { data } = await supa
      .from('journal_entries')
      .select('*')
      .eq('student_id', studentId)
      .order('module_number', { ascending: true })
      .order('day_number', { ascending: true });
    return data || [];
  },

  async listNotes(studentId) {
    const supa = await this.init();
    const { data } = await supa
      .from('notes')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    return data || [];
  },

  async createNote(studentId, title, body) {
    const supa = await this.init();
    const { data, error } = await supa
      .from('notes')
      .insert({ student_id: studentId, title, body })
      .select()
      .single();
    if (error) console.error('createNote error', error);
    return data;
  },

  async deleteNote(noteId) {
    const supa = await this.init();
    await supa.from('notes').delete().eq('id', noteId);
  },

  // === MESSAGES ===
  async listMessages(myId, otherId) {
    const supa = await this.init();
    const { data } = await supa
      .from('messages')
      .select('*')
      .or(`and(from_id.eq.${myId},to_id.eq.${otherId}),and(from_id.eq.${otherId},to_id.eq.${myId})`)
      .order('created_at', { ascending: true });
    return data || [];
  },

  async sendMessage(fromId, toId, content) {
    const supa = await this.init();
    const { data, error } = await supa
      .from('messages')
      .insert({ from_id: fromId, to_id: toId, content })
      .select()
      .single();
    if (error) console.error('sendMessage error', error);
    return data;
  },

  async markMessagesRead(toId, fromId) {
    const supa = await this.init();
    await supa
      .from('messages')
      .update({ read: true })
      .eq('to_id', toId)
      .eq('from_id', fromId)
      .eq('read', false);
  },

  // === REALTIME ===
  async subscribeToMessages(myId, callback) {
    const supa = await this.init();
    const channel = supa
      .channel(`messages_${myId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `to_id=eq.${myId}`
      }, payload => callback(payload.new))
      .subscribe();
    return channel;
  },

  // === MODULE PROGRESS ===
  async getModuleProgress(studentId) {
    const supa = await this.init();
    const { data } = await supa
      .from('module_progress')
      .select('*')
      .eq('student_id', studentId)
      .order('module_number');
    return data || [];
  },

  // === ADMIN ===
  async getAdminProfile() {
    const supa = await this.init();
    const { data } = await supa
      .from('profiles')
      .select('*')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle();
    return data;
  },

  async listStudents() {
    const supa = await this.init();
    const { data } = await supa
      .from('profiles')
      .select('*')
      .eq('role', 'student')
      .order('created_at', { ascending: false });
    return data || [];
  },

  async getStudent(id) {
    const supa = await this.init();
    const { data } = await supa
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();
    return data;
  },

  async updateStudent(id, updates) {
    const supa = await this.init();
    const { data } = await supa
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    return data;
  },

  async inviteStudent(payload) {
    const supa = await this.init();
    const session = await this.getSession();
    if (!session) throw new Error('Session expirée');
    const response = await fetch(`${SUPABASE_URL}/functions/v1/invite-student`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erreur lors de la création');
    return data;
  },

  async inviteFormatrice(payload) {
    const session = await this.getSession();
    if (!session) throw new Error('Session expirée');
    const response = await fetch(`${SUPABASE_URL}/functions/v1/invite-formatrice`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erreur lors de la création');
    return data;
  },

  async invitePraticienne(payload) {
    const session = await this.getSession();
    if (!session) throw new Error('Session expirée');
    const response = await fetch(`${SUPABASE_URL}/functions/v1/invite-praticienne`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erreur lors de la création');
    return data;
  },

  async deleteUser(userId) {
    const session = await this.getSession();
    if (!session) throw new Error('Session expirée');
    const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user_id: userId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erreur lors de la suppression');
    return data;
  },

  async resendInvitation(userId) {
    const session = await this.getSession();
    if (!session) throw new Error('Session expirée');
    const response = await fetch(`${SUPABASE_URL}/functions/v1/resend-invitation`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user_id: userId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erreur lors du renvoi');
    return data;
  },

  // === ISHTAR ===
  async ishtarSummary(entryId, force = false) {
    const session = await this.getSession();
    if (!session) throw new Error('Session expirée');
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ishtar-summary`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ entry_id: entryId, force })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erreur Ishtar');
    return data;
  },

  async ishtarBilan(studentId, moduleNumber = 2, force = false) {
    const session = await this.getSession();
    if (!session) throw new Error('Session expirée');
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ishtar-bilan`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ student_id: studentId, module_number: moduleNumber, force })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erreur Ishtar');
    return data;
  },

  async listAlerts(limit = 20) {
    const supa = await this.init();
    const { data } = await supa
      .from('ishtar_summaries')
      .select('*, profiles!inner(prenom, nom)')
      .neq('alert_level', 'none')
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  },

  async getSummariesForStudent(studentId) {
    const supa = await this.init();
    const { data } = await supa
      .from('ishtar_summaries')
      .select('*')
      .eq('student_id', studentId)
      .order('day_number', { ascending: true });
    return data || [];
  },

  async getLatestBilan(studentId, moduleNumber = 2) {
    const supa = await this.init();
    const { data } = await supa
      .from('ishtar_bilans')
      .select('*')
      .eq('student_id', studentId)
      .eq('module_number', moduleNumber)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  },

  // === SANCTUARYS OUTILS (NAHAR) ===
  async naharCall(payload) {
    const session = await this.getSession();
    if (!session) throw new Error('Session expirée');
    const response = await fetch(`${SUPABASE_URL}/functions/v1/outil-nahar`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erreur Nahar');
    return data;
  },

  async naharNewSession() {
    return await this.naharCall({ action: 'create_session' });
  },

  async naharListSessions() {
    return await this.naharCall({ action: 'list_sessions' });
  },

  async naharLoadMessages(sessionId) {
    return await this.naharCall({ action: 'load_messages', session_id: sessionId });
  },

  async naharSend(sessionId, userMessage, imageData) {
    const payload = { session_id: sessionId, user_message: userMessage };
    if (imageData) payload.image = imageData;
    return await this.naharCall(payload);
  },

  async naharNewSessionForClient(clientId) {
    return await this.naharCall({ action: 'create_session', client_id: clientId });
  },

  async naharListClients() {
    return await this.naharCall({ action: 'list_clients' });
  },

  async naharCreateClient(payload) {
    return await this.naharCall({ action: 'create_client', ...payload });
  },

  async naharUpdateClient(clientId, patch) {
    return await this.naharCall({ action: 'update_client', client_id: clientId, ...patch });
  },

  async naharDeleteClient(clientId) {
    return await this.naharCall({ action: 'delete_client', client_id: clientId });
  },

  async naharListClientSessions(clientId) {
    return await this.naharCall({ action: 'list_client_sessions', client_id: clientId });
  },

  async listOutils() {
    const supa = await this.init();
    const { data } = await supa
      .from('outils_catalogue')
      .select('*')
      .eq('actif', true)
      .order('ordre', { ascending: true });
    return data || [];
  },

  async listPraticiennes() {
    const supa = await this.init();
    const { data } = await supa
      .from('profiles')
      .select('*')
      .eq('role', 'praticienne')
      .order('created_at', { ascending: false });
    return data || [];
  },

  async listFormatrices() {
    const supa = await this.init();
    const { data } = await supa
      .from('profiles')
      .select('*')
      .in('role', ['formatrice', 'admin'])
      .order('created_at', { ascending: false });
    return data || [];
  },

  async getMyFormatrice() {
    const supa = await this.init();
    const session = await this.getSession();
    if (!session) return null;
    const { data: profile } = await supa
      .from('profiles')
      .select('formatrice_id')
      .eq('id', session.user.id)
      .single();
    if (!profile?.formatrice_id) {
      // Fallback : admin
      return await this.getAdminProfile();
    }
    const { data: formatrice } = await supa
      .from('profiles')
      .select('*')
      .eq('id', profile.formatrice_id)
      .single();
    return formatrice;
  },

  // === UTILS ===
  formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  },

  formatDateTime(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + ' · ' +
           d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  },

  formatRelative(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffH / 24);

    if (diffMin < 1) return 'à l\'instant';
    if (diffMin < 60) return `il y a ${diffMin} min`;
    if (diffH < 24) return `il y a ${diffH}h`;
    if (diffDays < 7) return `il y a ${diffDays}j`;
    return this.formatDate(dateStr);
  },

  initialOf(name) {
    return (name || '?').charAt(0).toUpperCase();
  }
};

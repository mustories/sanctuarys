# Sanctuarys · Setup production

Configuration complète pour mettre Sanctuarys en ligne avec Supabase + Vercel + sanctuarys.me.

---

## ÉTAPE 1 · Configuration Supabase

### 1.1 Exécuter le schéma SQL

1. Va sur ton dashboard Supabase : https://supabase.com/dashboard/project/hcmcforwphmqrauqltqp
2. Dans le menu de gauche, clique sur **SQL Editor**
3. Crée un nouveau query (bouton "+ New query")
4. Ouvre le fichier `supabase-schema.sql` de ton dossier outputs
5. Copie tout le contenu, colle-le dans l'éditeur SQL
6. Clique sur **Run** (ou Cmd+Enter)

Tu devrais voir "Success. No rows returned" ou similaire. Si erreur, vérifie que la base est bien vide.

### 1.2 Créer TON compte formatrice

1. Toujours dans Supabase, va dans **Authentication** → **Users**
2. Clique sur **Add user** → **Create new user**
3. Email : `princessetchassi@gmail.com` (ou ton email)
4. Mot de passe : choisis un mot de passe solide
5. Coche **Auto Confirm User**
6. Clique **Create user**

### 1.3 Te désigner comme admin

Retour dans **SQL Editor**, exécute :

```sql
UPDATE profiles
SET role = 'admin', prenom = 'Princesse'
WHERE email = 'princessetchassi@gmail.com';
```

(Remplace par ton email si différent.)

### 1.4 Créer le compte d'Angélique

1. Authentication → Users → **Add user**
2. Email : son vrai email
3. Mot de passe : crée un mot de passe temporaire (que tu lui transmettras)
4. Coche **Auto Confirm User**
5. Clique **Create user**

Puis dans SQL Editor :

```sql
UPDATE profiles
SET prenom = 'Angélique',
    current_module = 2,
    current_day = 1,
    cohort = 'Lune 2026'
WHERE email = 'son.email@example.com';
```

---

## ÉTAPE 2 · Configurer les emails (recommandé)

### 2.1 Désactive la confirmation par email (pour aujourd'hui)

Comme tu crées les comptes manuellement, désactive la confirmation email :
1. **Authentication** → **Providers** → **Email**
2. Désactive **Confirm email**
3. Sauvegarde

### 2.2 Plus tard : configurer les emails personnalisés

Supabase enverra des emails depuis `noreply@mail.supabase.io` par défaut. Pour utiliser `info@sanctuarys.me` :
1. **Project Settings** → **Auth** → **SMTP Settings**
2. Configure ton serveur SMTP (Resend, SendGrid, Postmark recommandés)

À faire cette semaine, pas urgent pour aujourd'hui.

---

## ÉTAPE 3 · Pousser le code sur GitHub

Dans ton terminal, ouvre le dossier outputs :

```bash
cd "/Users/princesse/Library/Application Support/Claude/local-agent-mode-sessions/119bd6c9-7125-4eed-8510-1b6122a7a26d/6ef63b97-fbde-4dff-ab24-c4805b98d365/local_21e576f4-25e6-410d-a875-cc381c650430/outputs"

git init
git add .
git commit -m "Premier déploiement Sanctuarys"
git branch -M main
git remote add origin https://github.com/mustories/sanctuarys.git
git push -u origin main
```

Si Git te demande tes identifiants GitHub, utilise un token personnel (pas ton mot de passe) :
- GitHub → Settings → Developer settings → Personal access tokens → Generate new token (classic)
- Cocher `repo` (toutes les options)
- Copier le token, l'utiliser comme mot de passe lors du push

---

## ÉTAPE 4 · Déployer sur Vercel

### 4.1 Importer le projet

1. Va sur https://vercel.com/new
2. Choisis **Import Git Repository**
3. Sélectionne `mustories/sanctuarys`
4. **Framework Preset** : Other (site statique)
5. **Root directory** : laisser `.`
6. **Build command** : laisser vide
7. **Output directory** : laisser vide
8. Clique **Deploy**

Le site sera live en ~30 secondes à une URL du type `sanctuarys-xyz.vercel.app`.

### 4.2 Connecter le domaine sanctuarys.me

1. Dans le projet Vercel → **Settings** → **Domains**
2. Add → entre `sanctuarys.me`, valide
3. Add à nouveau → `www.sanctuarys.me`, valide
4. Vercel te donne 2 enregistrements DNS

Chez ton registrar (là où tu as acheté sanctuarys.me) :
- **A record** : nom `@`, valeur `76.76.21.21` (IP Vercel)
- **CNAME** : nom `www`, valeur `cname.vercel-dns.com`

Sauvegarde, attends 5-30 min de propagation. Vercel activera HTTPS automatiquement.

---

## ÉTAPE 5 · Tester

Une fois en ligne :
1. Va sur `https://sanctuarys.me/espace-eleve.html`
2. Connecte-toi avec l'email d'Angélique + son mot de passe temporaire
3. Vérifie que son espace s'affiche correctement
4. Déconnecte-toi
5. Va sur `https://sanctuarys.me/admin.html`
6. Connecte-toi avec ton email + ton mot de passe
7. Vérifie que tu vois Angélique dans tes élèves

---

## ÉTAPE 6 · Envoyer ses accès à Angélique

Une fois tout testé, envoie-lui :

```
Angélique mon coeur,

Ton espace Sanctuarys t'attend.

🌐 Lien : https://sanctuarys.me/espace-eleve.html
📧 Email : [son email]
🔐 Mot de passe : [le mot de passe que tu as créé]

Tu y trouveras :
- Ton tableau de bord personnel
- Ton journal de bord guidé (jour 1 sur 14)
- Tes ressources du module
- Une messagerie privée pour me contacter

Tout ce que tu écris se sauvegarde automatiquement et reste strictement privé.

Je te lis chaque jour ✦
Princesse
```

---

## Ajouter une nouvelle élève plus tard

Deux options :

### Option A · Via le dashboard admin (rapide)
1. Connecte-toi sur `https://sanctuarys.me/admin.html`
2. Bouton "Nouvelle élève"
3. Remplis le formulaire et valide

Note : pour des raisons techniques liées à Supabase, cette méthode te déconnecte automatiquement après la création. Le mot de passe temporaire est copié dans ton presse-papier, tu peux te reconnecter ensuite.

### Option B · Via Supabase dashboard (le plus fiable pour aujourd'hui)
1. Authentication → Users → Add user
2. Email + mot de passe + Auto Confirm
3. Dans SQL Editor : `UPDATE profiles SET prenom = 'Marie', current_module = 1 WHERE email = 'marie@email.com';`
4. Connecte-toi dans `admin.html` pour la voir apparaître

---

## Fichiers du projet

```
outputs/
├── index.html              · Page d'accueil publique
├── inscription.html        · Page formation + inscription
├── espace-eleve.html       · Espace élève (Supabase auth)
├── admin.html              · Dashboard formatrice (Supabase auth)
├── supabase-schema.sql     · Le schéma à exécuter dans Supabase
├── vercel.json             · Config Vercel
├── .gitignore              · Git ignore
├── assets/
│   ├── sanctuarys-logo-1.png
│   └── sanctuarys-logo-2.png
└── js/
    └── sanctuarys.js       · Client Supabase partagé
```

---

## Pour faire évoluer le projet

**Modifier les prompts du journal** : SQL Editor, table `daily_prompts`. Modifie ou ajoute des lignes.

**Changer le visuel** : édite directement les fichiers HTML. Les styles sont dans `<style>` au début de chaque fichier.

**Ajouter une nouvelle formation** : il faudra créer de nouveaux modules dans `module_progress` et étendre la table `daily_prompts`. On verra ensemble.

**Sauvegardes** : Supabase fait des backups automatiques. Pour exporter manuellement : Project Settings → Database → Backups.

---

## Si quelque chose casse

1. **Login impossible** : vérifie dans Supabase Authentication que le user existe et que email confirmation est désactivée
2. **Profil vide après login** : vérifie dans SQL `SELECT * FROM profiles WHERE email = 'X';` que le profile a bien été créé par le trigger
3. **Données invisibles** : ouvre la console du navigateur (Cmd+Option+I sur Mac) pour voir les erreurs réseau
4. **Realtime ne fonctionne pas** : vérifie que tu as bien exécuté `alter publication supabase_realtime add table public.messages;` etc.

Bonne mise en production ✦

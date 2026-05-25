# Sanctuarys · Activation du flow d'invitation automatique

Setup en 3 étapes (~10 min) pour que ton bouton "Nouvelle élève" envoie un email automatique et donne accès direct à ton élève.

---

## ÉTAPE 1 · Déployer l'Edge Function dans Supabase

### Option simple · Via le dashboard Supabase

1. Va sur https://supabase.com/dashboard/project/hcmcforwphmqrauqltqp/functions
2. Clique **Deploy a new function** (ou **Create a new function**)
3. Nom de la fonction : `invite-student` (exactement, avec le tiret)
4. **Verify JWT** : décoche cette option (on gère l'auth nous-mêmes dans la fonction)
5. Dans l'éditeur de code qui s'ouvre, **efface tout le contenu par défaut**
6. Ouvre le fichier `supabase/functions/invite-student/index.ts` de ton dossier outputs
7. Copie tout son contenu, colle dans l'éditeur Supabase
8. Clique **Deploy function**

Tu verras un statut vert "Active" en quelques secondes.

### Option dev · Via le CLI (si tu as Node installé)

```bash
cd "/Users/princesse/Library/Application Support/Claude/local-agent-mode-sessions/119bd6c9-7125-4eed-8510-1b6122a7a26d/6ef63b97-fbde-4dff-ab24-c4805b98d365/local_21e576f4-25e6-410d-a875-cc381c650430/outputs"

npx supabase login
npx supabase link --project-ref hcmcforwphmqrauqltqp
npx supabase functions deploy invite-student --no-verify-jwt
```

---

## ÉTAPE 2 · Configurer les URLs de redirection

1. Va sur https://supabase.com/dashboard/project/hcmcforwphmqrauqltqp/auth/url-configuration
2. **Site URL** : `https://sanctuarys.me`
3. **Redirect URLs** : ajoute ces lignes :
   ```
   https://sanctuarys.me/**
   https://www.sanctuarys.me/**
   ```
4. Save

Cela autorise les liens d'invitation à rediriger sur ton site.

---

## ÉTAPE 3 · Personnaliser l'email d'invitation Sanctuarys

1. Va sur https://supabase.com/dashboard/project/hcmcforwphmqrauqltqp/auth/templates
2. Choisis le template **Invite user**
3. **Subject** : `Bienvenue dans le sanctuaire ✦`
4. **Body** : remplace tout le contenu par :

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { background: #FAF5EC; font-family: Georgia, serif; color: #2A1810; margin: 0; padding: 40px 20px; }
    .container { max-width: 560px; margin: 0 auto; background: #FAF5EC; padding: 40px; border: 1px solid rgba(106, 68, 35, 0.18); }
    h1 { font-family: 'Italiana', Georgia, serif; font-size: 38px; color: #2A1810; line-height: 1; margin: 0 0 8px; font-weight: 400; }
    h1 em { font-style: italic; color: #A85537; font-weight: 400; }
    .meta { font-family: monospace; font-size: 10px; letter-spacing: 4px; color: #A85537; text-transform: uppercase; margin: 0 0 28px; }
    p { font-size: 16px; line-height: 1.85; color: #4A3020; margin: 0 0 18px; }
    .btn { display: inline-block; padding: 18px 38px; background: #C8704D; color: #FAF5EC; text-decoration: none; font-family: monospace; font-size: 11px; letter-spacing: 4px; text-transform: uppercase; margin: 28px 0; }
    .footer { font-family: monospace; font-size: 10px; letter-spacing: 3px; color: #6B4423; text-transform: uppercase; margin-top: 40px; padding-top: 24px; border-top: 1px solid rgba(106, 68, 35, 0.18); opacity: 0.7; }
    .quote { font-style: italic; color: #6B4423; border-left: 2px solid #C8704D; padding-left: 18px; margin: 24px 0; font-size: 18px; }
  </style>
</head>
<body>
  <div class="container">
    <p class="meta">— Sanctuarys</p>
    <h1>Bienvenue dans<br><em>ton sanctuaire.</em></h1>

    <p>Le seuil s'ouvre. Princesse t'a préparé un espace personnel où tu pourras tenir ton journal, accéder à tes ressources, et lui écrire en confiance.</p>

    <p class="quote">"Avant de transmettre, il faut avoir reçu. Avant de soigner, il faut avoir été soignée."</p>

    <p>Pour entrer, clique sur le lien ci-dessous. Tu choisiras ton mot de passe et tu arriveras directement dans ton espace.</p>

    <p style="text-align: center;">
      <a href="{{ .ConfirmationURL }}" class="btn">Franchir le seuil →</a>
    </p>

    <p style="font-size: 13px; color: #6B4423;">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br>
    <span style="word-break: break-all;">{{ .ConfirmationURL }}</span></p>

    <div class="footer">
      Sanctuarys · École du sacré féminin<br>
      sanctuarys.me · info@sanctuarys.me
    </div>
  </div>
</body>
</html>
```

5. Save changes

---

## ÉTAPE 4 · Tester en envoyant ta première invitation

1. Va sur https://sanctuarys.me/admin
2. Connecte-toi avec ton compte
3. Vue d'ensemble → clique sur **"Créer un nouvel espace élève"** OU sidebar **Mes élèves** → bouton **+ Nouvelle élève**
4. Remplis :
   - Email : un email à toi (autre que ton compte admin) pour tester
   - Prénom : Test
   - Module de départ : Module 02
5. **Envoyer l'invitation ✦**

Tu devrais voir un toast de succès. Puis dans cet autre email, tu recevras l'invitation Sanctuarys. Clique sur le lien, choisis un mot de passe, tu arrives dans l'espace élève.

---

## Limites importantes à connaître

### Quota d'emails Supabase (plan gratuit)
Supabase free tier permet ~30 emails/heure. Largement suffisant pour démarrer. Si tu dépasses, tu auras des erreurs d'envoi. Pour aller plus loin :
- **Auth → SMTP Settings** dans Supabase
- Configure un SMTP custom : Resend (free 3000/mois), SendGrid, Postmark

### Adresse d'envoi par défaut
Au départ les emails partent de `noreply@mail.supabase.io`. Pour qu'ils partent de `info@sanctuarys.me`, configure un SMTP custom comme ci-dessus.

### Spam folder
Le premier email peut atterrir en spam (normal sans SMTP custom). Demande à ton élève de vérifier ses spams.

---

## Pour ajouter une élève en SQL si l'email ne passe vraiment pas

En backup, tu peux toujours créer manuellement :

```sql
-- 1. Crée le user dans Supabase Auth Dashboard (Users → Add user)
-- 2. Puis configure son profil :
UPDATE profiles
SET prenom = 'PRENOM',
    current_module = 2,
    current_day = 1,
    cohort = 'Lune 2026'
WHERE email = 'son-email@example.com';
```

Et envoie-lui manuellement le lien + mot de passe par WhatsApp ou autre.

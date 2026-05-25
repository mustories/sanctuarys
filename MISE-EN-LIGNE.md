# Mise en ligne · Sanctuarys

## 🔐 Mots de passe d'accès

### Angélique (espace élève)
```
angelique-soleil-2026
```

### Toi (dashboard admin)
```
princesse-sanctuarys-2026
```

Pour changer ces mots de passe, ouvre les fichiers `espace-eleve.html` ou `admin.html` et cherche la section `LOGIN GATE` dans le script. Modifie la valeur entre quotes, sauvegarde, redéploie.

---

## 🚀 Étape 1 · Déployer sur Netlify (2 minutes)

1. **Va sur** https://app.netlify.com/drop
2. **Glisse le dossier `outputs` entier** dans la zone de drop
3. Netlify te donne immédiatement une URL temporaire du type `https://random-name-12345.netlify.app`
4. **Crée un compte** (gratuit) pour garder le site en ligne et pouvoir le modifier

Une fois le compte créé, ton site reste à cette URL Netlify. Tu peux déjà tester :
- Page d'accueil : `https://ton-site.netlify.app/`
- Page formation : `https://ton-site.netlify.app/inscription.html`
- Espace Angélique : `https://ton-site.netlify.app/espace-eleve.html`
- Ton dashboard : `https://ton-site.netlify.app/admin.html`

---

## 🌐 Étape 2 · Connecter sanctuarys.me

### Dans Netlify
1. Dans ton site Netlify → **Domain settings** → **Add custom domain**
2. Entre `sanctuarys.me`, valide
3. Netlify te donne 2 enregistrements DNS à configurer chez ton registrar :
   - Un **A record** pour `sanctuarys.me` qui pointe vers `75.2.60.5` (IP Netlify)
   - Un **CNAME** pour `www.sanctuarys.me` qui pointe vers ton nom Netlify

### Chez ton registrar (là où tu as acheté sanctuarys.me)
1. Connecte-toi à ton compte
2. Cherche **DNS** ou **Gestion des enregistrements DNS**
3. Ajoute les deux enregistrements donnés par Netlify
4. Sauvegarde

Patience : la propagation DNS prend entre 5 minutes et 24 heures. Netlify activera automatiquement le HTTPS gratuit (Let's Encrypt) une fois la propagation faite.

---

## 📨 Étape 3 · Envoyer son accès à Angélique

Une fois en ligne, envoie-lui un message du type :

```
Angélique mon coeur,

Ton espace Sanctuarys est ouvert.

🌐 Lien : https://sanctuarys.me/espace-eleve.html
🔐 Mot de passe : angelique-soleil-2026

Tu y trouveras :
- Ton tableau de bord personnel
- Ton journal de bord guidé (jour 1 sur 14)
- Tes ressources du module
- Une messagerie privée pour me contacter

Le sacré ne se presse pas. Ouvre quand tu te sens prête.

Je te lis chaque jour ✦
Princesse
```

---

## 🎯 Pour aller plus loin (cette semaine)

### Mettre en place l'email info@sanctuarys.me
Plusieurs options chez ton registrar ou via :
- **Google Workspace** (6€/mois/utilisateur, le plus simple et fiable)
- **Zoho Mail** (gratuit pour 5 utilisateurs en plan basique)
- **Fastmail** (premium, 3€/mois)

### Sécurité renforcée
Le mot de passe actuel est suffisant pour Angélique mais il vit dans le code JavaScript. Pour une vraie sécurité plus tard, on passera à :
- Un backend simple (Supabase, Firebase ou Netlify Identity) avec vrais comptes
- Stockage des journaux côté serveur pour qu'Angélique les retrouve sur tout appareil
- Synchronisation pour que tu voies en direct ce qu'elle écrit

### Ajouter une nouvelle élève
Dans `espace-eleve.html`, cherche la section `ELEVE_PASSWORDS` dans le script et ajoute une ligne :
```js
const ELEVE_PASSWORDS = {
  'angelique-soleil-2026': { name: 'Angélique', avatar: 'A' },
  'nouveau-prenom-mot-2026': { name: 'Marie', avatar: 'M' }
};
```

Pour chaque nouvelle élève, idéalement on dupliquera l'espace pour qu'elles aient chacune leur version personnalisée (avec leur prénom, leur jour, leurs prompts). C'est ce qu'on automatisera la semaine prochaine avec ton dashboard admin.

---

## 🆘 Si quelque chose bloque

Le site est composé de fichiers statiques (HTML/CSS/JS), donc impossible de casser quelque chose côté serveur. Si l'affichage est étrange :
1. Vide le cache du navigateur (Cmd+Shift+R sur Mac)
2. Essaie en navigation privée
3. Vérifie que le dossier `assets/` a bien été uploadé (il contient le logo)

Bonne mise en ligne ✦

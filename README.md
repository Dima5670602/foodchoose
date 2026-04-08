# 🍽 FoodChoose — Plateforme de choix de repas

Application web de gestion des commandes de repas de midi pour entreprises.

---

## 🚀 Démarrage rapide

### 1. Prérequis
- Node.js ≥ 18
- PostgreSQL (base de données)
- Compte Gmail (pour l'envoi d'emails)

### 2. Installation locale

```bash
# Cloner le dépôt
git clone https://github.com/votre-compte/foodchoose.git
cd foodchoose

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.example .env
# Éditez .env avec vos valeurs
```

### 3. Configuration `.env`

```env
DATABASE_URL=postgresql://user:password@localhost:5432/foodchoose
JWT_SECRET=une_chaine_longue_et_aleatoire
ADMIN_USER=admin
ADMIN_PASSWORD=@admin123
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votremail@gmail.com
SMTP_PASS=votre_mot_de_passe_application_gmail
PORT=3000
NODE_ENV=development
```

> **Note Gmail** : Allez dans Paramètres Google → Sécurité → Mots de passe d'application pour générer `SMTP_PASS`.

### 4. Initialiser la base de données

```bash
# Créer la base de données
psql -U postgres -c "CREATE DATABASE foodchoose;"

# Appliquer le schéma (optionnel — l'app le fait automatiquement au démarrage)
psql -U postgres -d foodchoose -f schema.sql
```

### 5. Lancer l'application

```bash
npm run dev   # Développement (avec nodemon)
npm start     # Production
```

Ouvrez [http://localhost:3000](http://localhost:3000)

---

## 🌐 Déploiement sur Vercel

### 1. Créer un dépôt GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/votre-compte/foodchoose.git
git push -u origin main
```

### 2. Base de données PostgreSQL (Supabase recommandé)

1. Créez un compte sur [supabase.com](https://supabase.com)
2. Créez un nouveau projet
3. Allez dans **Settings → Database → Connection string**
4. Copiez la `DATABASE_URL`

### 3. Déployer sur Vercel

1. Connectez-vous sur [vercel.com](https://vercel.com)
2. **New Project** → Importez votre dépôt GitHub
3. Ajoutez les variables d'environnement dans **Settings → Environment Variables** :
   - `DATABASE_URL` — votre URL PostgreSQL
   - `JWT_SECRET` — une chaîne aléatoire sécurisée
   - `ADMIN_USER` — `admin`
   - `ADMIN_PASSWORD` — `@admin123`
   - `SMTP_HOST` — `smtp.gmail.com`
   - `SMTP_PORT` — `587`
   - `SMTP_USER` — votre email
   - `SMTP_PASS` — mot de passe application Gmail
   - `NODE_ENV` — `production`
4. Cliquez **Deploy** ✅

---

## 👤 Connexion

### Administrateur (Chargé(e) de commande)
- **Identifiant** : `admin`
- **Mot de passe** : `@admin123`

### Employé
Les identifiants sont créés par l'administrateur et envoyés par email.
- **Identifiant** : prénom+nom (ex: `jdupont`)
- **Mot de passe par défaut** : `Elimmeka123`

---

## 📋 Fonctionnalités

### 👑 Administrateur
| Fonctionnalité | Description |
|---|---|
| Connexion sécurisée | Identifiants définis en configuration |
| Gestion des employés | Créer/supprimer des comptes, envoi d'identifiants par email |
| Gestion des menus | Ajouter/supprimer des menus par date |
| Vue des commandes | Toutes les commandes du jour avec filtrage par date |
| Préférences boissons | Stats globales et du jour (Lipton / Caféine / Les deux) |
| Validation | Valider toutes les commandes en attente |
| Export PDF | Télécharger le récapitulatif des commandes en PDF |
| Historique | Consulter tout l'historique des actions |

### 👤 Employé
| Fonctionnalité | Description |
|---|---|
| Connexion | Avec ses identifiants personnels |
| Choisir un menu | Parmi les menus du jour |
| Modifier sa commande | Tant qu'elle n'est pas validée |
| Supprimer sa commande | Tant qu'elle n'est pas validée |
| Préférence boisson | Lipton, Caféine ou les deux |
| Historique personnel | Voir/supprimer son historique de commandes |

---

## 🏗 Architecture

```
foodchoose/
├── api/
│   └── index.js          # Serveur Express + toutes les routes API
├── public/
│   ├── index.html        # Page de connexion
│   ├── admin/
│   │   └── index.html    # Dashboard administrateur
│   └── employee/
│       └── index.html    # Dashboard employé
├── schema.sql            # Schéma PostgreSQL
├── package.json
├── vercel.json           # Configuration Vercel
└── .env.example          # Variables d'environnement exemple
```

### Stack technique
- **Backend** : Node.js + Express
- **Base de données** : PostgreSQL
- **Auth** : JWT (JSON Web Tokens)
- **Email** : Nodemailer
- **PDF** : PDFKit
- **Frontend** : HTML/CSS/JS vanilla (Google Fonts : Playfair Display + DM Sans)
- **Déploiement** : Vercel (API serverless) + Supabase (PostgreSQL)

---

## 🔒 Sécurité

- Mots de passe hashés avec bcrypt
- Authentification JWT (expiration 8h)
- Vérification des rôles sur toutes les routes API
- Protection contre les injections SQL (requêtes paramétrées)

---

## 📝 Notes

- Les commandes sont **par jour** — un employé peut commander une fois par jour
- Les commandes **validées** ne peuvent plus être modifiées ni supprimées
- L'historique est conservé indéfiniment côté admin
- Les employés peuvent vider **leur propre** historique

---

*FoodChoose v1.0 — Développé avec ❤️*

# 🌡️ Climat & Confort Moreau — Application Web

Application de gestion des interventions et chantiers, migrée de FlutterFlow vers **Next.js 14 + Firebase**.

## Stack technique

| Outil | Rôle |
|-------|------|
| **Next.js 14** (App Router) | Framework React — rendu côté serveur, routing |
| **TypeScript** | Typage fort de toutes les données |
| **Tailwind CSS** | Styles utilitaires, thème personnalisé |
| **Firebase Auth** | Authentification (email/password) |
| **Firestore** | Base de données temps réel (inchangée) |
| **Firebase Storage** | Stockage fichiers (inchangé) |
| **Zustand** | État global (auth, filtres) |
| **react-hot-toast** | Notifications UI |
| **Netlify** | Déploiement & hébergement |

---

## 🚀 Installation en local

### 1. Prérequis
- Node.js 20+
- Un projet Firebase existant (le tien est déjà en place)

### 2. Cloner et installer

```bash
# Installer les dépendances
npm install
```

### 3. Configuration Firebase

Copie le fichier d'exemple :
```bash
cp .env.local.example .env.local
```

Puis remplis `.env.local` avec les valeurs de ta console Firebase :
- Va sur [Firebase Console](https://console.firebase.google.com)
- Ton projet → Paramètres → Général → Tes apps → Config SDK
- Copie les valeurs dans `.env.local`

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

### 4. Lancer en développement

```bash
npm run dev
```

Ouvre http://localhost:3000

---

## 📁 Structure du projet

```
src/
├── app/                  # Pages (Next.js App Router)
│   ├── layout.tsx        # Layout racine (fonts, auth provider)
│   ├── page.tsx          # Redirection login/dashboard
│   ├── login/            # Page connexion
│   └── dashboard/        # Tableau de bord principal
│
├── components/
│   ├── layout/
│   │   ├── AuthProvider.tsx   # Initialisation Firebase Auth
│   │   ├── AppShell.tsx       # Layout protégé (sidebar + nav)
│   │   ├── Sidebar.tsx        # Navigation desktop
│   │   └── BottomNav.tsx      # Navigation mobile
│   └── ui/
│       └── index.tsx          # Composants réutilisables (badges, stats…)
│
├── lib/
│   ├── firebase.ts       # Config Firebase (app, auth, db, storage)
│   ├── firestore.ts      # Requêtes Firestore (subscribe, get, update…)
│   └── utils.ts          # Helpers (cn, formatDate, couleurs…)
│
├── store/
│   └── authStore.ts      # État auth global (Zustand)
│
└── types/
    └── index.ts          # Types TypeScript de toutes les collections
```

---

## 🌐 Déploiement sur Netlify

### Option 1 : Via l'interface Netlify (recommandé)

1. Pousse le code sur GitHub/GitLab
2. Va sur [Netlify](https://app.netlify.com) → "Add new site" → "Import from Git"
3. Sélectionne ton repo
4. Netlify détecte automatiquement Next.js (via `netlify.toml`)
5. **Ajoute les variables d'environnement** :
   - Site Settings → Environment Variables
   - Ajoute toutes les `NEXT_PUBLIC_FIREBASE_*` variables

### Option 2 : CLI Netlify

```bash
npm install -g netlify-cli
netlify login
netlify deploy --build
```

---

## 📊 Collections Firestore utilisées

| Collection | Description |
|------------|-------------|
| `usersapp` | Utilisateurs de l'app |
| `Operation` | Chantiers |
| `logements` | Logements liés aux chantiers |
| `planning` | Interventions / RDV |
| `batiment` | Bâtiments |
| `notifications` | Notifications utilisateur |
| `messagerie` | Discussions |
| `messages_messagerie` | Messages des discussions |
| `journal_interne` | Journal interne |
| `feuilles_heures` | Feuilles d'heures |
| `relances` | Relances |
| `acteurs_autre` | Autres acteurs des chantiers |

---

## 🔒 Rôles utilisateurs

| Rôle | Accès |
|------|-------|
| `SuperAdmin` | Tout |
| `Admin` | Gestion utilisateurs + acteurs |
| `Utilisateur` | Accès standard |

---

## 📋 Pages déjà migrées

- [x] **Login** — Connexion + reset mot de passe
- [x] **Dashboard** — Tableau de bord avec filtres logements/chantiers

## 📋 Pages à migrer (prochaines étapes)

- [ ] Accueil
- [ ] Détails logement / fiche logement
- [ ] Ajout / modification logement
- [ ] Détails chantier / fiche chantier
- [ ] Ajout chantier
- [ ] Détails intervention
- [ ] Journal interne
- [ ] Messagerie
- [ ] Notifications
- [ ] Feuilles d'heures
- [ ] Gestion utilisateurs
- [ ] Profil

---

## ⚠️ Notes importantes

- **Firebase reste inchangé** : toutes tes données Firestore, Storage et Auth sont réutilisées telles quelles.
- **Pas de migration de données** nécessaire : l'app lit directement les mêmes collections.
- Le fichier `.env.local` **ne doit jamais être commité** (il est dans `.gitignore`).

# Litrium

Hub personnel en style liquid glass : météo, agenda, alarmes, assistant IA (Gemini), amis et messages en direct, notes et rappels.

## Architecture

- **Front** : Vite + React + TypeScript (`src/`).
- **Comptes, données, messages en direct** : Supabase (Postgres + Auth + Realtime). Schéma et règles de sécurité :
  `supabase/migrations/0001_init.sql` (chaque personne ne voit que ses données ; messages seulement entre amis acceptés).
- **IA** : fonction serveur `api/ai.ts` (Vercel Function). La clé Gemini reste côté serveur ; seules les personnes
  connectées peuvent l'utiliser, avec une limite quotidienne (`AI_DAILY_LIMIT`, 60 par défaut).
- **Hébergement** : Vercel (`vercel.json`).

Sans variables Supabase, l'app tourne en **mode local** (données dans le navigateur, compte démo
`camille@exemple.fr` / `demo1234`) : pratique pour développer.

## Mise en ligne

1. **Supabase** (supabase.com) : nouveau projet → *SQL Editor* → coller et exécuter `supabase/migrations/0001_init.sql`.
   *Authentication → URL Configuration* : *Site URL* = l'adresse Vercel (ex. `https://litrium.vercel.app`),
   et ajouter `https://litrium.vercel.app/**` dans *Redirect URLs*.
2. **Vercel** (vercel.com) : *Add New → Project* → importer le dépôt GitHub `litrium`.
   *Environment Variables* :
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Supabase → Project Settings → API)
   - `GEMINI_API_KEY` (aistudio.google.com → Get API key)
   - facultatif : `AI_DAILY_LIMIT`, `GEMINI_MODEL`
   Puis *Deploy*.
3. **Google** (facultatif) : console.cloud.google.com → *APIs & Services → Credentials → OAuth client ID (Web)*.
   *Authorized redirect URI* : `https://<votre-projet>.supabase.co/auth/v1/callback`.
   Coller l'ID et le secret dans Supabase → *Authentication → Providers → Google*, puis mettre
   `VITE_GOOGLE_ENABLED=true` dans Vercel et redéployer.

## Développement

```bash
npm install
cp .env.example .env   # remplir si besoin
npm run dev            # http://localhost:5173
```

## Limites connues

- Les alarmes et rappels sonnent tant que Litrium est ouvert dans un onglet (une app mobile serait nécessaire sinon).
- Les e-mails (confirmation, mot de passe oublié) partent du service d'e-mail intégré de Supabase, limité à quelques
  envois par heure : pour un vrai lancement public, brancher un service d'e-mail (Supabase → Authentication → SMTP).
- Pas de connexion Apple : elle exige un nom de domaine et un compte Apple Developer.

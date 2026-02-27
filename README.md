# Strava Performance Dashboard

Dashboard personnel de performance running deploye sur Vercel.

## Stack

- **Frontend**: React 18 + Vite + Tailwind CSS + Recharts
- **Backend**: Vercel Serverless Functions (Python 3.11)
- **Database**: Turso (SQLite cloud) ou SQLite local
- **Auth**: OAuth 2.0 Strava
- **Cron**: Vercel Cron (sync quotidien 4h)

## Deploiement Vercel

1. Connecter le repo GitHub a Vercel
2. Configurer les variables d'environnement dans Vercel Dashboard:
   - `STRAVA_CLIENT_ID`
   - `STRAVA_CLIENT_SECRET`
   - `STRAVA_REDIRECT_URI` (ex: `https://votre-app.vercel.app/api/auth/callback`)
   - `TURSO_DATABASE_URL` (ex: `libsql://votre-db.turso.io`)
   - `TURSO_AUTH_TOKEN`
3. Deployer

## Turso (base de donnees)

```bash
# Installer Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Creer une base
turso db create strava-dashboard

# Recuperer l'URL
turso db show strava-dashboard --url

# Creer un token
turso db tokens create strava-dashboard
```

## Modules

- **Cockpit**: synthese, projections Riegel, alertes
- **Volume**: hebdo/mensuel/annuel, rolling 90j, multi-annees
- **Performance**: PR 5k/10k/semi/marathon, projections
- **Segments**: Local Legends, PR segments
- **Analyse**: stabilite allure, decouplage cardiaque, correlation volume/perf

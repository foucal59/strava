# Strava Performance Dashboard

Dashboard personnel de performance running base sur l'API Strava.

## Stack

- **Backend**: Python FastAPI + SQLite + APScheduler
- **Frontend**: React 18 + Vite + Tailwind CSS + Recharts
- **Auth**: OAuth 2.0 Strava

## Installation

### 1. Backend

```bash
cd backend
cp .env.example .env
# Editer .env avec vos credentials Strava
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

### 3. Configuration Strava

1. Aller sur https://www.strava.com/settings/api
2. Creer une application
3. Recuperer Client ID et Client Secret
4. Configurer le callback URL: `http://localhost:8000/auth/callback`
5. Renseigner dans `backend/.env`

## Modules

- **Cockpit**: synthese volume, projections Riegel, alertes
- **Volume**: kilometrage hebdo/mensuel/annuel, rolling 90j, multi-annees
- **Performance**: PR 5k/10k/semi/marathon, projections, evolution
- **Segments**: Local Legends, PR segments, carte thermique
- **Analyse**: stabilite allure, decouplage cardiaque, correlation volume/performance

## Sync quotidien

Le scheduler APScheduler lance un sync complet chaque jour a 4h.
Sync incremental: seules les nouvelles activites sont recuperees.
Snapshot Local Legends: etat quotidien enregistre pour historique.

## Rate Limits Strava

- 100 requetes / 15 min
- 1000 requetes / jour
- Delai minimum 1.2s entre requetes

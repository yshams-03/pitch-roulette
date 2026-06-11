# Pitch Roulette

Real-time football party game that runs on players' phones during a live match. No native app. No downloads. Just a shared URL.

## Stack

- **Frontend**: React + Vite + Tailwind CSS v4 + Zustand + Framer Motion
- **Backend**: FastAPI + Python 3.11
- **Database**: Supabase (PostgreSQL + Realtime)
- **Sports Data**: API-Football (api-sports.io)

## Project Structure

```
pitch-roulette/
├── frontend/          # React SPA (deploy to Vercel)
├── backend/           # FastAPI API (deploy to Railway/Render)
├── shared/            # Shared TypeScript types
├── supabase/          # Database schema SQL
└── README.md
```

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the SQL in `supabase/schema.sql` in the SQL Editor
3. Copy your project URL, anon key, and service role key

### 2. API-Football

1. Sign up at [api-sports.io](https://www.api-football.com/)
2. Copy your API key (free tier: 100 requests/day)

### 3. Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Edit .env with your keys

uvicorn main:app --reload --port 8000
```

### 4. Frontend

```bash
cd frontend
cp .env.example .env
# Edit .env with your keys

npm install
npm run dev
```

Open http://localhost:5173

## Environment Variables

### Frontend (`frontend/.env`)

```
VITE_BACKEND_URL=http://localhost:8000
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Backend (`backend/.env`)

```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
SPORTS_API_KEY=your_api_football_key
SPORTS_API_BASE=https://v3.football.api-sports.io
BIG_BALLS_API_KEY=your_big_balls_api_key_here
SPORTS_PROVIDER=auto
SECRET_KEY=generate_a_random_64_char_string_here
FRONTEND_URL=http://localhost:5173
```

## Deployment

### Backend (Railway / Render)

1. Connect your repo
2. Set root directory to `backend`
3. Add all backend environment variables
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Frontend (Vercel)

1. Connect your repo
2. Set root directory to `frontend`
3. Add environment variables:
   - `VITE_BACKEND_URL` → your Railway/Render backend URL
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

Update `FRONTEND_URL` in backend env to your Vercel domain.

## Game Flow

1. **LOBBY** — Host creates room, players join via 6-char code
2. **SCOUTING** — Teams assigned, tactical pitch scouting
3. **DRAFT_LOCKED** — Pick 3 fantasy players
4. **LIVE** — Flash bets, sabotage, chat during the match
5. **FULL_TIME** → **RESULTS** — Leaderboard and shareable card

## Host Controls

Hosts use `/host/:code` on a separate device to advance game states, trigger manual flash bets, and kick players.

## API Health Check

```
GET /health
```

## Sports API (dual provider)

Pitch Roulette uses **API-Football** first, then falls back to **Big Balls Sports Data** when rate-limited or unavailable.

1. API-Football key: [api-football.com](https://www.api-football.com/) → `SPORTS_API_KEY`
2. Big Balls (free tier): [bigballsdata.com/dashboard/keys](https://bigballsdata.com/dashboard/keys) → `BIG_BALLS_API_KEY`
3. Set `SPORTS_PROVIDER=bigballs` to use Big Balls only (recommended if API-Football quota is exhausted)

```bash
cd backend
python check_sports_api.py
```

**Note:** Big Balls does not provide per-match player ratings — fantasy rating sync still depends on API-Football when available.

## Testing

### API smoke tests (Section 2)

```bash
cd backend
.\venv\Scripts\Activate.ps1   # Windows
python test_api_smoke.py
```

Set `RATE_LIMIT_ENABLED=false` in `backend/.env` for local QA (restart uvicorn after changing).

### Browser E2E (Section 8)

Requires frontend (`npm run dev`) and backend (`uvicorn main:app --reload`) running.

```bash
cd frontend
npm install
npm run test:e2e
```

Uses system Chrome (`channel: 'chrome'`). If Playwright browser download fails due to SSL, install Google Chrome locally.

## License

MIT

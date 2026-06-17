# Pitch Roulette

World Cup prediction rooms with flash bets, fantasy draft, sabotage shop, and realtime multiplayer — built for the 2026 tournament and playable today via demo simulation.

**→ [Full documentation](./pitch-roulette/README.md)** — setup, migrations, env vars, testing, and API reference.

## Repository layout

| Path | Description |
|------|-------------|
| [`pitch-roulette/`](./pitch-roulette/) | Main application (React frontend + FastAPI backend) |
| [`.github/workflows/`](./.github/workflows/) | CI (pytest, Vitest) and nightly Playwright E2E |

## Quick start

```powershell
# Backend
cd pitch-roulette\backend
python -m venv venv; .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env   # add Supabase + API keys
uvicorn main:app --reload --port 8000

# Frontend (new terminal)
cd pitch-roulette\frontend
npm install; copy .env.example .env
npm run dev
```

Open http://localhost:5173/demo for a bot-filled practice match.

Before first run, apply Supabase migrations — see [pitch-roulette/README.md#database-migrations](./pitch-roulette/README.md#database-migrations).

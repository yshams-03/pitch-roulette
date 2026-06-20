# Production Launch Checklist

Run through this BEFORE sharing the URL with real users.

## Backend (Railway)
- [ ] GET /api/health → supabase_connected: true
- [ ] GET /api/standings/WC → returns groups with teams
- [ ] GET /api/matches/WC → returns fixtures
- [ ] CORS header present on OPTIONS request from Vercel origin

## Frontend (Vercel)
- [ ] https://pitch-roulette.vercel.app loads (not blank, not 404)
- [ ] Hard refresh: no "Failed to fetch" errors in DevTools console
- [ ] DevTools → Network: JS file calls Railway URL (not localhost)
- [ ] Supabase vars set in Vercel dashboard → Production environment

## Auth flow
- [ ] Sign up with new email → profile created, redirected to home
- [ ] Log in → session persists on refresh
- [ ] Log out → redirected to login, /profile requires re-login

## Core features
- [ ] Home page loads standings (Table tab)
- [ ] Home page loads fixtures (Fixtures tab)
- [ ] Leaderboard page loads
- [ ] Create group → invite code generated
- [ ] Join group via invite code

## Demo room (no live fixture needed)
- [ ] /demo → Enter demo match → lobby loads
- [ ] Start predictions → side reveal shows
- [ ] Submit prediction → waiting screen
- [ ] Lock → Start draft → draft page loads with players
- [ ] Pick 3 players → Go live → live page loads
- [ ] Flash bet appears (auto or inject via host panel)
- [ ] Answer flash bet → PC updates
- [ ] End match → results page shows PP + PC boards

## Production URL
- Backend: https://pitch-roulette-production.up.railway.app
- Frontend: https://pitch-roulette.vercel.app

#!/bin/bash
# Run after every production deploy to verify the stack
# Usage: BACKEND_URL=https://... FRONTEND_URL=https://... ./scripts/smoke-test.sh

BACKEND=${BACKEND_URL:-"https://pitch-roulette-production.up.railway.app"}
FRONTEND=${FRONTEND_URL:-"https://pitch-roulette.vercel.app"}

echo "🔍 Smoke testing production stack..."
echo "Backend: $BACKEND"
echo "Frontend: $FRONTEND"
echo ""

pass=0
fail=0

check() {
  local name=$1
  local url=$2
  local expected=$3
  local response=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$response" = "$expected" ]; then
    echo "✅ $name ($response)"
    ((pass++))
  else
    echo "❌ $name (expected $expected, got $response)"
    ((fail++))
  fi
}

check "Backend health" "$BACKEND/api/health" "200"
check "Backend standings" "$BACKEND/api/standings/WC" "200"
check "Backend matches" "$BACKEND/api/matches/WC" "200"
check "Frontend loads" "$FRONTEND" "200"
check "Frontend SPA routing" "$FRONTEND/auth/login" "200"
check "Frontend profile route" "$FRONTEND/profile" "200"
check "Frontend leaderboard" "$FRONTEND/leaderboard" "200"

echo ""
echo "Results: $pass passed, $fail failed"
[ $fail -eq 0 ] && echo "🎉 All checks passed!" || echo "⚠️ $fail checks failed"
exit $fail

# Pitch Roulette — automated deploy runner (see DEPLOY.md)
# Usage: .\scripts\deploy.ps1 [-SkipTests] [-VercelToken $env:VERCEL_TOKEN] [-RailwayToken $env:RAILWAY_TOKEN]
param(
    [switch]$SkipTests,
    [string]$VercelToken = $env:VERCEL_TOKEN,
    [string]$RailwayToken = $env:RAILWAY_TOKEN
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

Step "1/6 Pre-flight checks"
if (-not $SkipTests) {
    Push-Location $Backend
    & .\venv\Scripts\Activate.ps1
    pytest tests/ -q --tb=line
    if ($LASTEXITCODE -ne 0) { throw "Backend tests failed" }
    Pop-Location

    Push-Location $Frontend
    npm run test:unit --silent
    if ($LASTEXITCODE -ne 0) { throw "Frontend tests failed" }
    Pop-Location
}

Step "2/6 Migration checks"
Push-Location $Backend
& .\venv\Scripts\Activate.ps1
python -c @"
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path('.env'))
from database import get_supabase
db = get_supabase()
db.table('analytics_events').select('id').limit(1).execute()
print('analytics_events OK (007)')
try:
    db.table('predictions').select('pp_breakdown').limit(1).execute()
    print('pp_breakdown OK (008)')
except Exception as e:
    print('WARN: migration 008 not applied — run supabase/migrations/008_points_flash_schedule.sql')
"@
if ($LASTEXITCODE -ne 0) { throw "Migration 007 not applied. Run supabase/migrations/007_phase4_ops.sql" }
Pop-Location

Step "3/6 Build frontend"
Push-Location $Frontend
npm run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
Pop-Location

Step "4/6 Local backend health"
$healthUrl = $null
foreach ($port in @(8000, 8099)) {
    try {
        $h = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 5
        $healthUrl = "http://127.0.0.1:$port"
        Write-Host "Health ($healthUrl): version=$($h.version) supabase=$($h.supabase_connected)"
        break
    } catch { }
}
if (-not $healthUrl) {
    Write-Host "WARN: No backend on :8000 or :8099. Start with: cd backend; uvicorn main:app --port 8000" -ForegroundColor Yellow
}

Step "5/6 Deploy backend (Railway)"
if ($RailwayToken) {
    Push-Location $Backend
    npx --yes @railway/cli@latest up --detach --service backend 2>&1
    Pop-Location
} else {
    Write-Host "SKIP: Set RAILWAY_TOKEN or run 'railway login' + 'railway up' in pitch-roulette/backend" -ForegroundColor Yellow
}

Step "6/6 Deploy frontend (Vercel)"
Push-Location $Frontend
if ($VercelToken) {
    npx vercel deploy --prebuilt --prod --yes --token $VercelToken
} else {
    Write-Host "SKIP: Set VERCEL_TOKEN or run 'npx vercel login' then 'npx vercel --prod' in pitch-roulette/frontend" -ForegroundColor Yellow
}
Pop-Location

Write-Host "`nDeploy script finished. See DEPLOY.md post-deploy checklist." -ForegroundColor Green

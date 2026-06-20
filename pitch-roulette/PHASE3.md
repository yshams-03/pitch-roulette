# Pitch Roulette — Phase 3 Specification

**Status:** Features 2–5 implemented on `feat/phase3-sabotage`  
**Base:** Feature 1 merged (PR #2)  
**Priority order:** Pitch Chips → Sabotage → Sides → Draft → Cleanup

## Feature checklist

| # | Feature | Status |
|---|---------|--------|
| 1 | Pitch Chips (PC) currency | ✅ Merged (PR #2) |
| 2 | Sabotage shop | ✅ Done |
| 3 | Side assignment | ✅ Done |
| 4 | Fantasy draft | ✅ Done |
| 5 | Limitations cleanup | ✅ Done |
| 6 | PP skill system + flash bet schedule | ✅ Done |

## Schema migrations

| File | Purpose |
|------|---------|
| `003_phase3_pitch_chips.sql` | `session_pc`, `pc_transactions` |
| `004_phase3_sabotage.sql` | `sabotages` |
| `005_phase3_sides.sql` | `assigned_side`, `side_swap_used` |
| `006_phase3_draft.sql` | `DRAFTING` state, `draft_picks`, `draft_started_at` |
| `008_points_flash_schedule.sql` | `pp_breakdown`, flash bet `answer_key` / `match_minute`, `flash_bet_minutes` |

Run migrations **003 → 006 → 008** in order in Supabase SQL Editor.

## Points system (PP)

- **Predictions** (on room end): exact 3 PP, score-diff 2 PP, outcome 1 PP; early bonus (+0.5 / +0.25); streak multipliers (×1.2–×2.0 on base); underdog +1 PP when minority side wins and prediction correct.
- **Flash bets**: +0.5 PP per correct answer; +1 PP bonus on 3rd consecutive correct in same room.
- **Draft**: goal +1 PP, assist +0.5 PP, MOTM +1 PP, red card −0.5 PP (to drafter).

## Flash bet scheduler

- Fires on **match minute schedule** (`FLASH_BET_SCHEDULE`), not random ESPN events.
- Question chosen from **pools** with template fill (`{home_team}`, scores, etc.).
- **Demo rooms** use `DEMO_FLASH_BET_SCHEDULE` (compressed minutes).
- Idempotent via `flash_bet_minutes` — same minute never fires twice.
- **Auto-resolve** when answer key has a resolver; host can override.

## Critical rules

- PC never below 0 (server-side)
- MIRROR invisible to target in API/UI
- Go-live from CLOSED auto-skips draft (auto-assign) for E2E compat; use **Start draft** for full draft UX
- Underdog +20 PC on go-live when sides imbalanced

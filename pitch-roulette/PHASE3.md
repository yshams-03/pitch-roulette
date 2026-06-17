# Pitch Roulette — Phase 3 Specification

**Status:** In progress (Feature 1: Pitch Chips)  
**Base:** v3.0.0 on `main`  
**Priority order:** Pitch Chips → Sabotage → Side assignment → Fantasy draft → Limitations cleanup

See the full feature spec in the agent prompt (June 2026). This file tracks implementation status.

## Feature checklist

| # | Feature | Status |
|---|---------|--------|
| 1 | Pitch Chips (PC) currency | ✅ Core done (migration 003, PC wagering, UI) |
| 2 | Sabotage shop | ⏳ Pending |
| 3 | Side assignment | ⏳ Pending |
| 4 | Fantasy draft | ⏳ Pending |
| 5 | Limitations cleanup (bracket SVG, FULL_TIME auto, nightly E2E, host delete, branch protection) | ⏳ Pending |

## Schema migrations

| File | Purpose |
|------|---------|
| `supabase/migrations/003_phase3_pitch_chips.sql` | `session_pc`, `pc_transactions` |
| `004_phase3_sabotage.sql` | (planned) `sabotages` |
| `005_phase3_sides.sql` | (planned) `assigned_side`, `side_swap_used` |
| `006_phase3_draft.sql` | (planned) `DRAFTING` state, `draft_picks` |

## Critical rules

- Do not break Phase 1/2 — run `pytest` + `npm run test:unit` after each feature
- PC never below 0 (server-side validation)
- PP unchanged for predictions; flash bets award **+0.5 PP** on correct (skill), PC for wagering
- Sabotage MIRROR invisible to target (Feature 2)

## Out of scope (Phase 4)

Push notifications, monetization, share cards, global tournaments, spectator mode, voice chat, mobile app.

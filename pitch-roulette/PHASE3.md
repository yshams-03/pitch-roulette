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

## Schema migrations

| File | Purpose |
|------|---------|
| `003_phase3_pitch_chips.sql` | `session_pc`, `pc_transactions` |
| `004_phase3_sabotage.sql` | `sabotages` |
| `005_phase3_sides.sql` | `assigned_side`, `side_swap_used` |
| `006_phase3_draft.sql` | `DRAFTING` state, `draft_picks`, `draft_started_at` |

Run migrations **003 → 006** in order in Supabase SQL Editor.

## Critical rules

- PC never below 0 (server-side)
- MIRROR invisible to target in API/UI
- Go-live from CLOSED auto-skips draft (auto-assign) for E2E compat; use **Start draft** for full draft UX
- Underdog +20 PC on go-live when sides imbalanced

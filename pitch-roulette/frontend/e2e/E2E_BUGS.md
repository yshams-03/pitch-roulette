# E2E Known Gaps (Feature vs Test Spec)

Tests adapt to the current UI/API without modifying feature code. Documented gaps:

| Area | Spec expectation | Current behavior | Test approach |
|------|------------------|------------------|---------------|
| Host chat delete UI | 🗑️ on host panel | Delete API only; live chat shows "message removed" | API delete + live chat assertion |
| Draft Performance results | Section on results page | `draft-performance` tab on `RoomResultsPage` | API + UI |
| PC win/loss toasts | Realtime toast on `pc_transactions` | Not wired | PC verified via room snapshot API |
| FULL_TIME auto-end | Pipeline ends room within 40s | Needs `match_data.status=FINISHED` on LIVE room | Intentionally skipped; unit-tested |
| Side-colored live leaderboard | Blue/red borders | Not on `RoomLivePage` | Sides verified via API + badge |
| Leave group | User 2 leaves group | No leave UI in `GroupDetailPage` | Not tested |
| Signup creates account | Full signup flow | Email confirmation may block | Signup form render test only |
| `data-testid="realtime-indicator"` | Dedicated test id | Uses "🟢 Live" text | Text selector |
| `data-testid="room-code"` | Lobby code test id | Font-mono text without testid | URL / text assertions |

Fix these in a future feature PR, then tighten E2E assertions.

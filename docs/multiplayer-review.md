# Multiplayer review

## Findings and changes

| Area | Finding | Change |
| --- | --- | --- |
| Falling Blocks replay | A finished board remained attached to its round after leaving; Play reopened it while opponents were still playing. | Leaving releases the player, allows another round, and preserves the original result. Finishing the old round cannot remove the new session. |
| Round isolation | Inputs and exits identified only the player, so delayed commands could target a replay. | Commands and exits require the round ID; stale IDs are rejected. The client also ignores board states from a different round. |
| Overlapping lobbies | Starting one game left participants listed in another game's lobby until a later synchronization. | Starting a round removes its participants from the other lobbies immediately. |
| Falling Blocks start | The server accepted a multiplayer start with only one remaining player despite the disabled UI button. | The server requires two players for multiplayer; solo remains an explicit choice. |
| Additional equipment | Tic-Tac-Toe and chess used only the first placed board. | Tic-Tac-Toe uses a lobby per cabinet and starts the selected one. Chess exposes its saved matches at every chess board. Removed equipment closes its lobby. |
| Chess synchronization | A second connection did not receive the existing lobby or viewed match. Reconnecting required finding and opening the match again. | Session synchronization includes chess state. The browser reopens the selected saved match after reconnecting and returns to the chess lobby when it closes. |
| Chess in multiple tabs | Closing a shared view in one tab left another tab showing a board that no longer received moves. | Closing the selected match sends a close event to every session for that player. Open views follow the player's selected match; stale close commands cannot close another match. |
| Interaction feedback | Repeated clicks could send multiple starts or moves while awaiting a response. Chess setup closed before creation succeeded. | Starts and turn actions remain pending until their matching acknowledgement or error. Chess setup remains visible after a rejected creation. |
| Lobby focus | A reconnecting nearby player could replace the explicitly selected game panel with their profile. | An explicit selection stays active while its area remains available. Automatic selection still follows newly entered areas when no selection is pinned. |
| Return to lobby | Multiplayer choice, variant and settings reset between rounds. A finished Falling Blocks board still prompted for an active-game exit. | Lobby return remembers the last round's choices. Finished players can return directly while others continue. |

The server remains authoritative for moves, outcomes, clocks, gravity, attacks and results. Proximity still determines arcade participants. Tic-Tac-Toe disconnects forfeit on the final connection; Falling Blocks disconnects finish that board. Chess matches remain saved and clocks continue under the existing time-control rules.

## Performance

The repeatable traffic check starts a two-player Falling Blocks round and sends 120 alternating lateral inputs, with no simulated gravity. Counts include every recipient; bytes are serialized JSON payloads, excluding WebSocket framing.

| Measurement | Before | After |
| --- | ---: | ---: |
| Board messages | 120 | 120 |
| Standings messages | 240 | 0 |
| Total messages | 360 | 120 |
| Payload bytes | 345,960 | 135,960 |

This is **60.7% less payload and 66.7% fewer messages** in this scenario. Board responses remain immediate. Standings publish only when their contents change. The world also stops rebuilding game lobbies for routine gravity and attack updates.

Reduced client message processing and less queue pressure are expected benefits. No CPU, frame-time or network round-trip improvement is claimed. The elapsed microbenchmark samples were collected in a busy shared workspace and are unsuitable for a timing comparison. The browser check records request-to-acknowledgement timing with an explicitly injected delay in each direction; that is a responsiveness check, not a before/after latency benchmark.

### Further measurements worth doing

- Profile eight-player rounds with sustained soft drops and attacks. Pending attack countdowns still produce round updates every simulation tick; use the results to decide whether to send attack deadlines once and refresh standings less often.
- Measure client render time and socket queues over a real remote connection. If input round trips dominate Falling Blocks, assess local movement prediction with authoritative reconciliation separately from rules changes.
- Profile simultaneous bot and human games. Tic-Tac-Toe bot search runs on the server's main thread; move it to a worker if measured stalls delay other matches. Chess already searches in a separate process.
- Measure long rapid-chess sessions: clock broadcasts still contain the full match view and move history. A compact clock event is a focused next step if those payloads become significant.

## Verification

The server review suite passed 296 tests across 27 files. After the final shared-tab fix, the chess and real-WebSocket suites passed all 18 tests, including the additional regression. All 55 client multiplayer component and hook tests passed across nine files. Targeted lint, server and client type checks, the production client build and `git diff --check` passed. The build retains its existing large-chunk warning. Some earlier client test attempts timed out under concurrent workspace load; the final run used one worker and passed.

`apps/server/src/multiplayer-realtime.test.ts` uses authenticated, independent WebSocket clients against the real application with isolated memory persistence. It covers healthy readiness, multiplayer start races, Falling Blocks top-out and concurrent replay, stale commands, duplicate connections, final disconnects, all Tic-Tac-Toe variants, chess invitations, checkmate, cancellation and saved-result reopening.

`scripts/multiplayer-browser-check.ts` uses two isolated Edge browser contexts, the built client and the real application on an ephemeral port. It adds 80 ms of delay in each direction by default and exercises UI entry, turns, finishing, lobby return, replay and reconnection. It writes screenshots and a timing report to `artifacts/multiplayer`.

The final browser run passed Falling Blocks, all three Tic-Tac-Toe variants and chess with no JavaScript page errors. It also opened a second tab for one chess player and verified that closing it cleared the other tab's view. Classic Tic-Tac-Toe and chess reached played wins; Ultimate and Stacking finished by forfeit. Small-screen screenshots were checked at 390 × 844. The 22 acknowledged requests had a 192.8 ms median and 285 ms p95 round trip, including the injected 160 ms total delay; these are absolute observations, not latency gains.

```powershell
pnpm --filter @workhard/server exec vitest run src/games src/protocol.test.ts src/realtime.test.ts src/multiplayer-realtime.test.ts src/world/world-runtime.game.test.ts src/world/world-runtime.tic-tac-toe.test.ts src/world/world-runtime.falling-blocks.test.ts src/world/world-runtime.test.ts --maxWorkers=1 --testTimeout=30000
pnpm --filter @workhard/client build
pnpm --filter @workhard/server exec tsx ../../scripts/multiplayer-browser-check.ts
pnpm --filter @workhard/server exec tsx ../../scripts/multiplayer-traffic-check.ts
```

## Environment and limits

At the start of the review, the supplied running-state report was inaccurate: port 3001 refused HTTP connections while port 5173 served the client. A read-only database query and saved-workspace restoration succeeded. A later live check returned HTTP 200 from backend liveness and readiness (`database: true`), the client page and its authentication-session proxy. The services were not started or restarted as part of this review; other work was active in the shared workspace. The original crash stack was not available in the supplied log excerpt, so its cause is not established here. Integration and browser verification use a separately health-checked test application and do not modify the existing workspace data.

Real remote networks, eight-client browser load, physical mobile devices and restarting the deployed backend remain outside the verified scenarios. An in-progress arcade round is still not restored after a server restart. Ship the updated client and server together because arcade commands now require round IDs and Tic-Tac-Toe starts require the cabinet ID.

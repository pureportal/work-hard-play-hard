# Arcade

Game entry uses the asset's circular interaction radius on both the server and the canvas. Only the selected interaction has a thin, unfilled outline; idle equipment and people do not draw radius indicators. Build placement and selection still show equipment reach. The nearby action panel retains a selected area while it remains in range, selects newly entered areas, and offers previous/next buttons and a keyboard-accessible area selector. Meetings, doors, and nearby people participate in the same selection.

Game definitions identify equipment by asset type. Every placed Falling Blocks cabinet has its own lobby, keyed by its object ID. Starting a round includes that ID, so saved IDs and additional cabinets work without renaming layout objects. Multiplayer gathers participants from the selected cabinet; entering a round removes them from overlapping lobbies. Replays return to the same cabinet.

Falling Blocks offers solo and nearby multiplayer rounds. Tic-Tac-Toe offers Classic, Ultimate, and Stacking against a bot or another nearby player. Chess keeps its saved matches, clocks, invitations, promotion choices, draw claims, and resignation flow, and adds saved bot matches. Solo games offer replay; completed multiplayer games return to the lobby.

## Falling Blocks rules

The following tuning choices resolve unspecified behavior; they are implementation assumptions, not additional requested requirements. The player starting a round chooses one mode and the multiplayer attack target for everyone. Modes are separate, and solo replay retains the selected settings.

- **Classic:** preserves the existing level increase every eight cleared lines. Gravity starts at 665 ms per row, decreases by 55 ms per level, and stops decreasing at 140 ms.
- **Speed-up:** adds one level every 30 seconds of active play to the existing line-based progression. Solo pause freezes this timer.
- **Sudden death:** adds one solid, unremovable bottom row every 30 seconds of active play, starting at 30 seconds. Normal line clears leave this floor intact. Overflowing settled cells or pushing an active piece above the board ends that player's game.
- **Attacks:** clears use the table below and arrive after 3 seconds. Outgoing rows first cancel that player's pending incoming rows, oldest first; only the remainder is sent. Attack rows are clearable, with one server-selected gap shared by the rows in each attack, and appear above any hard floor.
- **Targeting:** Random chooses uniformly among other unfinished players in the same round. Fewest stones counts settled occupied cells, including garbage and hard rows, excluding active, ghost, held, and queued pieces. Ties are random. The target is chosen when the attack is queued. Attacks on finished or disconnected targets are discarded; attacks already sent by a finished player still arrive.

The server runs gravity, mode timers, target selection, and attack delivery. Round snapshots carry settings and pending attacks; each player receives their own authoritative board. Attack randomness is independent of the shared seven-bag piece sequence. The existing multiplayer pause restriction, disconnect-as-finish behavior, score-based winner, and score/statistics persistence remain in effect. Modes currently share the existing high-score table. Server restart does not restore an in-progress round, as before.

### Rotations and scoring

The engine uses square rotation boxes and SRS wall/floor kicks, including the I-piece kick table, in both directions. A T-spin requires the last successful piece movement to be a rotation and at least three occupied corners around the T's pivot. Two occupied front corners identify a full spin; otherwise it is a mini, except the fifth SRS kick promotes it to a full spin. Successful translation, gravity, hold, or rising rows removes rotation credit; blocked moves and a zero-distance hard drop preserve it. Pieces locking partly above the finite board top out.

All clear and special points use the level **before** the clear. Soft/hard drops separately add 1/2 points per cell moved, without a level multiplier.

| Clear | Base points × level | Base attack rows |
| --- | ---: | ---: |
| Single | 100 | 0 |
| Double | 300 | 1 |
| Triple | 500 | 2 |
| Four-line clear | 800 | 4 |
| Mini T-spin, no clear | 100 | 0 |
| Mini T-spin single | 200 | 0 |
| Mini T-spin double | 400 | 1 |
| T-spin, no clear | 400 | 0 |
| T-spin single | 800 | 2 |
| T-spin double | 1200 | 4 |
| T-spin triple | 1600 | 6 |

- Back-to-back four-line/spin clears multiply the base points by 1.5 and add one attack row. Non-clearing locks preserve the chain; ordinary single/double/triple clears break it. Zero-line spins neither start the chain nor receive its bonus.
- Consecutive clearing pieces receive `50 × combo × level`, with the first clear at combo 0. Any non-clear resets the combo. Extra attack rows for combo indices 0–11 are `0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5`, capped at 5 thereafter.
- Perfect clears add `800/1200/1800/2000 × level` for one/two/three/four lines; a back-to-back four-line perfect clear adds `3200 × level` instead. These bonuses add to the clear and combo points. A perfect clear sends 10 total attack rows before cancellation. Hard floors prevent perfect clears.

These are the chosen modern rules for this game; attack and perfect-clear tuning varies across other games. The review used the [official Tetris Effect movement and spin guide](https://www.tetriseffect.game/beginners-community-guide/) and [Basic Fun's published scoring manual](https://www.basicfun.com/wp-content/uploads/2025/06/09686_1L_IM.pdf). Existing seven-bag randomization, five-piece preview, hold, ghost, 500 ms lock delay, and 15 grounded lock resets remain. No variant-specific Zone or non-T spin scoring is introduced.

### Statistics and crown

Each completed player result saves ordinary singles/doubles/triples/four-line clears, full T-spins (including zero-line spins and clear-size breakdowns), minis, perfect clears, combo-bonus clears, and back-to-back-bonus clears. Spin clears are not also counted as ordinary clears. Totals and per-game averages are available for every member under **Specials** in the lobby. The denominator is measured completed games, including zero-special games, solo, multiplayer, and early exits. Older results have no measured counts and are excluded rather than treated as zero. Results are recorded once when the whole round ends; abandoned server sessions do not become completed games.

There is one persisted Falling Blocks crown across cabinets and modes. The first multiplayer winner earns it. Later winners take it only if its holder participated in that round; a successful defense retains it, solo never changes it, and absence leaves it with the holder. Current ownership is checked when results are recorded, including overlapping rounds. Winners still use score, then lines, level, completion order, and user ID as tie-breakers. Crown ownership starts with the first multiplayer result after this feature is enabled; past wins are not reconstructed.

### Controls

Gameplay buttons and key hints start hidden; the gamepad button toggles them. Keyboard controls remain active: arrows to move/soft drop, Up or X clockwise, Z counterclockwise, Space hard drop, C/Shift hold, and P solo pause. Touch buttons support press-and-hold movement/soft drop and simultaneous rotation. Release, pointer cancellation, lost capture, focus loss, hiding controls, pause, and exit stop repeats. Touch layouts use targets of at least 44 px and leave the board visible in portrait and landscape.

## Bots

Chess uses the pinned `stockfish@18.0.8` package's `stockfish-18-lite-single` WASM engine in a separate Node process. Searches are serialized per workspace and capped at ten seconds including startup. The server validates every returned move with chess.js. Full move history is sent through UCI, preserving repetition context. Late replies cannot modify completed matches. Engine failures expose an explicit retry, and shutdown cancels the process.

| Level | Stockfish skill | Maximum depth | Search time |
| --- | ---: | ---: | ---: |
| Easy | 0 | 2 | 150 ms |
| Medium | 5 | 8 | 400 ms |
| Hard | 20 | 16 | 900 ms |

These are relative difficulty levels, not Elo ratings. The lightweight engine avoids downloading chess engine binaries to clients. The package's postinstall only creates aliases to its full engine; the application addresses the lite engine directly and does not need that script.

Tic-Tac-Toe uses random legal moves on Easy and alpha-beta minimax on Medium and Hard. Hard Classic searches to the end and has an exhaustive no-loss test. Ultimate and Stacking use bounded iterative search and line evaluation. Search copies the actual rules engines, including covered Stacking pieces. Bot rounds do not write multiplayer statistics or coin rewards; bot identities are never added to workspace members.

## Research and engine distribution

- [Stockfish.js documentation and source](https://github.com/nmrugg/stockfish.js): engine build choices and Node support.
- [Stockfish strength controls](https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html#how-do-skill-level-and-uci-elo-work): skill settings deliberately select weaker moves.
- [Harvard CS50 minimax project](https://cs50.harvard.edu/ai/projects/0/tictactoe/): optimal Classic Tic-Tac-Toe play.
- Stockfish.js is GPLv3. Retain its [license](https://github.com/nmrugg/stockfish.js/blob/93c994592dcf3b4b21052ab925e9b534df9c0918/Copying.txt) and provide the [corresponding source and build instructions](https://github.com/nmrugg/stockfish.js/tree/93c994592dcf3b4b21052ab925e9b534df9c0918) when redistributing the engine, as required by that license. The engine is unmodified and remains an external server dependency.

## Verification

Run `pnpm e2e:arcade` for two-browser checks of overlap navigation, Falling Blocks solo isolation, all Tic-Tac-Toe variants and difficulties, multiplayer turns, Stockfish replies, saved match reopening, replay, and desktop/mobile captures. Screenshots are saved under `artifacts/arcade`.

Run `node scripts/falling-blocks-puppeteer-check.mjs` against the running development app to verify its saved Falling Blocks cabinets, controls, and desktop/mobile layouts. Screenshots are saved under `artifacts`.

Set `FALLING_BLOCKS_MODE` to `speed-up` or `sudden-death` for the browser check to select that mode and wait for its first timed progression. Server tests cover gravity intervals, persistent hard rows, delayed attacks, both targeting policies, overflow, and matching round/session state across connected players.

The server tests exercise all game-circle edges, real Stockfish replies, cancellation, restore/retry behavior, variant legality, and exhaustive Hard Classic play. The database migration test runs inside a transaction against temporary tables and checks that only the seeded Dash cabinet is removed. The decorative arcade asset remains available in the catalog.

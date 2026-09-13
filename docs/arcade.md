# Arcade

Game entry uses the asset's circular interaction radius on both the server and the canvas. Only the selected interaction has a thin, unfilled outline; idle equipment and people do not draw radius indicators. Build placement and selection still show equipment reach. The nearby action panel retains a selected area while it remains in range, selects newly entered areas, and offers previous/next buttons and a keyboard-accessible area selector. Meetings, doors, and nearby people participate in the same selection.

Game definitions identify equipment by asset type. Every placed Falling Blocks cabinet has its own lobby, keyed by its object ID. Starting a round includes that ID, so saved IDs and additional cabinets work without renaming layout objects. Multiplayer gathers participants from the selected cabinet; entering a round removes them from overlapping lobbies. Replays return to the same cabinet.

Falling Blocks offers solo and nearby multiplayer rounds. Tic-Tac-Toe offers Classic, Ultimate, and Stacking against a bot or another nearby player. Chess keeps its saved matches, clocks, invitations, promotion choices, draw claims, and resignation flow, and adds saved bot matches. Solo games offer replay; completed multiplayer games return to the lobby.

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

The server tests exercise all game-circle edges, real Stockfish replies, cancellation, restore/retry behavior, variant legality, and exhaustive Hard Classic play. The database migration test runs inside a transaction against temporary tables and checks that only the seeded Dash cabinet is removed. The decorative arcade asset remains available in the catalog.

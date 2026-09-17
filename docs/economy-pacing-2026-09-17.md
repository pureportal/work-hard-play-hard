# Coin earnings and pacing review — September 17, 2026

The catalogue already takes months to collect, but its expensive individual items were affordable within a few days. The changes reduce the shared daily game allowance from **200 to 100** and the consecutive daily bonuses from **50/60/70/80/90/100/150** to **10/15/20/25/30/35/50**. The welcome grant stays at **250**. Prices and individual game reward formulas stay unchanged.

This lowers sustained maximum income from 350 to 150 coins per day (57%). The welcome grant still buys a straight desk and office chair together; the mature daily bonus alone no longer buys a 70-coin chair, and one maximum earning day earns less than a 180-coin desk. These are balance choices against existing prices, not a prescribed completion deadline.

## Coin sources

| Source | Current payment and conditions |
| --- | --- |
| Welcome | 250 when a workspace member's economy account is created; repeated account initialization does not pay again. |
| Daily bonus | Manually claim in Build → Personal. 10, 15, 20, 25, 30, 35, then 50 on consecutive UTC days. Stays at 50; a missed day resets the next claim to 10. Signing in alone does not claim it. |
| Falling Blocks | Solo and multiplayer: 20 + 3 per cleared line, counting at most 20 lines, plus 40 for a multiplayer win. Nominal range 20–120; actual payment is clipped to the remaining shared allowance. All three modes and all cabinets use it. |
| Tic-Tac-Toe | All three human multiplayer variants: 60 for winning, 20 for losing or drawing. Bot matches pay nothing. |
| Personal item sale | One-third of the recorded purchase price, rounded down, after returning the item to inventory. Selling consumes that owned copy. A 70-coin chair returns 23, losing 47 overall. |
| Public funds | Start at zero and receive player donations, transfers from other public funds, public item sales, and paid construction refunds. Sales and refunds return one-third of recorded cost to the owning fund. These move or recover existing money; they do not pay into a player's wallet. Starter property without a receipt refunds zero. |

Chess, crowns/statistics, the gong, fortune dispenser, break wheel, confetti/bubbles, work objects, and meetings do not award coins. No other gameplay coin-credit path was found. Donations, resale, and demolition need no earning cap because they cannot create a profitable purchase/resale loop. Everyone uses the same paid construction quotes, including the CEO.

## Cap and repeatability

The previously reported **200-coin shared cap was correct before this change**. `WorkspaceStore.recordGameRound` sends both paying games to `EconomyStore.rewardGames`. The authoritative ledger counts positive game payments by user and UTC completion date, regardless of mode, opponent, cabinet, session, or floor. The cap is now 100; bonuses and sales do not consume it.

There is no timer that clears the allowance: each UTC date has its own ledger total. A game spanning midnight uses its completion date. Local midnight has no effect, unused allowance does not carry over, and rewards on either side of UTC midnight can arrive seconds apart. Restore rebuilds the same totals from persisted transactions. Spending or selling items does not reopen the allowance.

Immediate exits/forfeits currently earn the ordinary completion reward. Repeating them can reach the allowance quickly, but cannot exceed it. Switching games, reconnecting, changing request IDs, or replaying a completed round does not create a fresh allowance. Even a zero-coin round gets a receipt, so it cannot be reclaimed after midnight. Payout batches reject duplicate participants before applying any payment. Game results and completion timestamps originate on the server, not from a client-supplied score or date.

Saved payments are receipts, not orders to recalculate earnings at today's rates. Restore retains checks for ledger totals, unique operations, daily claim dates/streaks, ownership, and rewards matching server scores and nominal game amounts. It no longer requires historical payments to match the current daily schedule or cap. Thus an already-issued 200-coin game day remains intact and leaves no further game allowance that day; the following UTC day permits 100. No balances are rewritten or database migration required.

## Prices and estimates

The personal shop has **261 item types**, priced **25–1,100**, totalling **44,280** for one of each. The full public build catalogue has **294 types**, totalling **46,805**: it additionally includes 30 permanent flooring types (20–55 each) and three game tables (500 each). Tables are available through public construction even though personal-shop purchase is disabled. Variant changes do not require collecting another copy.

Construction charges **12 per 32-unit wall segment**, **40 per door**, and **60 per window**, with openings charged in addition to the wall. A placement-validated 384 × 384 room has 48 wall segments and one door: **616 coins**. Adding 36 wood flooring objects (64 × 64, 30 each), a desk (180), and chair (70) gives an actual `quoteProject` cost of **1,946**. Public construction and personal furnishings must be financed from their respective pools; a single contributor can supply that combined budget by donating the construction portion.

Assumptions: a new account, the welcome grant available, a claim every consecutive day, access to an installed game, no other spending, no sales, and one person financing each goal. Each row is an independent saving target. Day 1 includes the first daily claim and that day's games; “immediate” uses only the welcome grant. Buying earlier targets as well delays later purchases.

- **Casual:** two five-minute solo Falling Blocks rounds per day, five cleared lines each: 35 × 2 = 70 game coins. Sustained total falls from 220 to 120 per day.
- **Maximum:** enough rounds to exhaust the allowance every day. At the same five-line rate, six rounds/about 30 minutes reached 200 before; three rounds/about 15 minutes reach 100 now. Skilled wins or quick forfeits take less time. These durations are assumptions, not measured session data or enforced minimums.

| Independent target | Coins | Before: casual / maximum day | Now: casual / maximum day |
| --- | ---: | ---: | ---: |
| Straight desk + office chair | 250 | Immediate / immediate | Immediate / immediate |
| Pool | 500 | 2 / 1 | 3 / 3 |
| Executive desk | 640 | 3 / 2 | 5 / 4 |
| Crystal floor lamp, highest priced item | 1,100 | 6 / 4 | 9 / 7 |
| Three game tables | 1,500 | 8 / 5 | 12 / 10 |
| Furnished room described above | 1,946 | 10 / 7 | 16 / 13 |
| All six epic and two legendary items | 5,510 | 26 / 17 | 46 / 37 |
| One of every personal item | 44,280 | 203 / 128 | 369 / 295 |
| One of every buildable type | 46,805 | 214 / 135 | 390 / 312 |

Calculations sum the welcome grant, each day's scheduled bonus, and `min(daily game earnings, cap)` until the cost is covered. There is no finite coin-funded level/upgrade chain or purchasable floor unlock in the current implementation; collection and construction are the available spending goals, with repeated building/furnishing providing further uses for coins. Full-catalogue collection is an audit benchmark, not a required player objective.

Shared construction scales with contributors: four players donating every welcome grant and maximum daily earnings could fund all 294 types by day 78; ten could do so by day 31. This is separate from an individual's private collection. Multiple accounts can also contribute independently; this change does not impose a workspace-wide cap or establish that one account equals one human.

A fresh one-person workspace has no installed game table in its starting house. Saving the welcome grant and daily bonuses alone reaches the first 500-coin table on day **9** now, versus day **4** before; two members can pool their welcome grants immediately. The main table assumes existing game access. Missed claim days, unavailable opponents, absent cabinets, other purchases, and already-spent starting money all lengthen these estimates; an existing wealthy wallet can buy sooner.

## Verification

The targeted server suites cover full and partial caps, independent participants, all paying modes/variants, multiple cabinets, rapid forfeits, duplicate rounds, zero-value receipts, reconnect/restore, UTC/local midnight, month rollover, backdated attempts, bonus streaks and missed days, sales, and preservation of issued receipts. Chess checkmate/resignation and bot matches award no coins. Client tests exercise the updated first daily claim and wallet events. Server/shared type checks and lint were also run.

The room example was built with `LayoutPlan` placement validation and priced through the actual `quoteProject` implementation. Earnings projections were calculated from the catalogue and reward schedules. No development server was started. Live multiplayer, production PostgreSQL persistence, real player session lengths, and observed purchasing behavior were not exercised; this is an implementation-based balance review, not a telemetry study.

Sources: [reward constants and formulas](../packages/shared/src/economy.ts), [wallet and receipt handling](../apps/server/src/economy/economy-store.ts), [catalogue](../packages/shared/src/asset-catalog.json), [construction quotes](../apps/server/src/economy/project-quote.ts), [public funds](../apps/server/src/economy/public-economy-store.ts), [game settlement](../apps/server/src/store.ts), [starting house](../apps/server/src/world/starting-house.ts).

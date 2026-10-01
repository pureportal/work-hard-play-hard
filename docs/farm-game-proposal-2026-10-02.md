Farm game proposal — October 2, 2026

Build a small personal farm: buy and place seeds, water the beds, let crops grow while away, harvest coins, and plant the next batch. Offer 30-, 45-, and 60-minute crops so players choose a rhythm that fits their work. Keep each visit around one minute and leave ripe crops waiting until collected.

The [clickable concept](farm-concept/index.html) demonstrates the layout, purchases, watering, growth, collection, and a proposed earnings limit. Open the HTML directly in a browser; no server or installation is needed. Its wallet and clock are simulated and reset on reload. The drawings illustrate composition, not final game artwork. The controls below the farm advance the preview clock and are not proposed game controls.

This is an investigation and design proposal, not an implemented game. Prices, timings, limits, and estimates need playtesting. The earlier [TypeScript farm plan](typescript-farming-implementation-plan-2026-09-19.md) explores programmable robots. The current request supports a smaller manual game; a code editor and script runner are outside this release.

## First release

Start with six beds in a compact personal garden. Give access through a Farm activity entry without requiring shared room construction. An optional placed garden bed opens the same farm and displays its growth; placing more displays never creates additional production. Reuse the existing Garden bed artwork for that entrance, but keep ordinary decorative plants decorative.

Buying and planting are one action: choose a seed and an empty bed, see the price, then plant. Deduct coins only when planting succeeds. This satisfies buying seeds without adding a separate inventory and checkout. Plant all, Water all, and Harvest all keep a six-bed visit short. Require an explicit second action to replant so harvesting never spends money unexpectedly.

| Crop | Growth after first watering | Seed price | Normal harvest | Harvest with extra care | Net profit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Radish | 30 min | 2 coins | 3 coins | — | 1 coin |
| Carrot | 45 min | 3 coins | 5 coins | 6 coins | 2–3 coins |
| Tomato | 60 min | 5 coins | 8 coins | 9 coins | 3–4 coins |

These are proposed game values, not real crop growth times. All three crops should be usable immediately so the timing choice is useful from the start.

Planting leaves a bed waiting for water. The first watering starts its clock. After 30 minutes, carrots and tomatoes can receive one extra watering for one extra harvest coin. Radishes are already ripe at that point. Extra watering never reduces the duration; new upgrades should preserve the promised 30–60-minute rhythm. Water is free and unlimited in this release.

Once initially watered, crops grow offline. Missing extra care only loses the optional bonus. Mature crops neither die nor produce additional harvests while unattended. One planting produces one payment; harvesting leaves an empty bed. There is no need to replay offline ticks.

Give the first planting a single-use, short tutorial cycle so the player experiences a harvest before leaving. Persist its completion, give at most one net coin, and account for it in the production allowance. It is introductory content, not a recurring faster crop. At zero balance with no planted crops, a free radish seed starts a normal 30-minute recovery cycle that pays one coin; it reserves that coin from the same allowance. Server-check eligibility so repeated clicks, multiple displays, or accounts with uncollected crops cannot multiply this grant.

## Return rhythm

The incentive is a visible reward and a worthwhile next decision: collect income, tend a longer crop, choose the next crop, and progress toward something the player wants to buy.

| Time | Example with two beds of each crop | Why return |
| --- | --- | --- |
| 0 min | Plant and water six beds for 20 coins. | Choose a schedule and see the next harvest time. |
| 30 min | Collect two radishes for 6 coins; optionally care for carrots and tomatoes; replant radishes for 4. | Immediate payout plus a bonus on the longer crops. |
| 60 min | Collect two radishes, two carrots, and two tomatoes for 36 coins if the longer crops received care. | Net profit is 42 collected minus 24 spent = 18 coins across this example. |

Carrots are ready at minute 45, but waiting until minute 60 keeps this example to two return visits. Players who prefer 45-minute visits can plant carrots together. Encourage batches with a clear crop duration and bulk planting; avoid six unrelated deadlines. A ready-harvest count on the Farm entry is meaningful state. Show the earliest remaining harvest time when nothing is ready.

Add a small crop mastery track that unlocks planter designs, scarecrows, seed varieties, and garden decorations. Reward harvesting and caring, not simply opening the screen. Keep the next milestone within a few successful visits. Cosmetic customization gives the farm a purpose after its coin allowance is used.

Reminders should be opt-in after the player has seen their first useful harvest. Group ready beds into one reminder, suppress reminders while the farm is open, and respect quiet hours. Use the next grouped harvest as the default; an optional care reminder can target minute 30. Do not send a separate alert per bed or insist on exactly timed returns.

Closed-app browser reminders require a server scheduler, push subscription, and service worker; a tab timer is insufficient. Notification permission should be requested through an explicit user action. Desktop/Android notification support needs its own device checks. The current client has native packaging, but this investigation establishes no existing farm reminder delivery path. Sources: [MDN Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API), [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).

Short crop timers and these incentives make a 30–60-minute return plausible; they do not prove retention. Measure first planting, first harvest, successful return intervals during the player's active hours, useful actions per visit, and next-day return. Treat voluntary return as the goal. Do not introduce withering, lost streaks, emergency alerts, or countdown offers to force attendance.

## Features to add later

| Feature | Benefit | Recommendation |
| --- | --- | --- |
| Crop mastery and garden cosmetics | Gives repeat harvests a visible longer-term purpose. | First addition after the core loop works. |
| Irrigation | Removes the initial watering chore. | Earned upgrade; no automatic harvest or replanting. Keep extra care optional. |
| Produce orders | Makes choosing crops matter beyond duration. | Later: add produce storage and manual selling together. Do not automatically sell crops and also let the same produce fulfill paid orders. |
| Team garden | Shared progress toward a decoration or team objective. | Later: fixed contributions and rewards; no transferable produce at launch. |
| Friend watering | A pleasant reason to visit another person's farm. | Later: owner opt-in, one care bonus per crop cycle, no additional helper coin faucet. |
| Seasonal seeds and changing garden scenery | Creates novelty and collectible designs. | Cosmetic rotation first; show seeds long enough to fit ordinary schedules. |
| Chickens, beehives, and cooking | Gives additional production chains and identity. | After crop balance; each chain adds timers, resources, artwork, and settlement rules. |
| Farm robots and programming | Adds a deeper automation game. | Separate expansion using the existing TypeScript investigation. |

Hay Day's official documentation provides useful references for coin/XP orders and cooperative task checkpoints. Borrow the variety of goals rather than its full product economy. It provides no evidence that our players will return on a particular schedule. Sources: [Truck Orders](https://support.supercell.com/hay-day/en/articles/truck-orders-2-2.html), [Derby Tasks & Rewards](https://support.supercell.com/hay-day/en/articles/derby-tasks-2.html).

## Economy

The current game grants 250 welcome coins, daily rewards of 10–50 coins, and up to 100 coins per UTC day from scored games. Those constants are implemented in [economy.ts](../packages/shared/src/economy.ts). The existing Garden bed costs 140 coins in the [catalogue](../packages/shared/src/asset-catalog.json); it currently supplies artwork, not crop production. Do not require that purchase before a player can try farming.

Without a limit, six cared tomatoes yield 24 net coins per hour, or 192 over eight hourly harvests. Repeatedly buying beds would multiply income if ownership were the capacity rule. Recommend one farm per workspace member and six beds for the MVP, with a provisional allowance of 60 net profit issued per UTC planting day. Keep the existing scored-game allowance separate so farming does not consume rewards players expect from other games. This adds at most 60 net coins per issuance day to the economy, a material increase that needs validation against shop purchases.

Reserve a crop's maximum net profit at planting and persist its issuance day and reservation with the cycle. For example, a tomato costs 5 and reserves 4; collection returns 8 normally or 9 after care. Return the seed principal in full, record the actual net profit against that original day's budget, and release unused reserved profit. Budget use is actual profit plus outstanding reservations. Reject a new planting before charging if its full reservation does not fit; reduce batch quantity explicitly rather than silently clipping the future reward.

At the limit, explain the unavailable planting action and show when the next allowance opens. Existing plants still finish and pay the promised amount. Old crops keep their original budget day across midnight. Thus collection on a particular date can exceed 60 when old harvests are collected together; the limit controls issued profit, not the calendar date of wallet credit. Persist reservation summaries and cross-check them against crop receipts on restore. Do not prune outstanding cycles or their uncollected evidence at midnight.

Six tomatoes reserve 24 per batch: two full cared batches use 48, then three more tomatoes can use the final 12. Their minute-30 care and minute-60 harvest provide roughly six useful returns across three hours. Six radishes use 6 per half-hour batch and can fund ten batches. This exposes a real tradeoff: higher-value crops reach the cap sooner. The allowance should be tuned with return data; it cannot support coin-driven hourly visits indefinitely. Mastery can continue after the limit through a clearly separate practice planting with no coin price or payout, if testing shows that is desirable; that mode is outside the MVP.

Avoid trading, real-money boosts, automatic perpetual replanting, and extra production farms in the first release. They complicate inflation and abuse before the basic loop is proven. Every seed cost, actual payout, and projected bonus must be visible when it affects a planting or care decision.

## Presentation

Use a warm miniature garden inside the existing office style: wooden raised beds, dark soil that visibly changes when watered, distinct crop silhouettes, and small harvest movement. Keep cream panels and the existing violet action color; green belongs mainly in the garden. New crop models should use the established Blockbench-to-sprite pipeline rather than adding a runtime 3D engine.

The enlarged view has the garden on the left and the selected bed on the right. Empty beds show the seed picker; planted beds show their current action and remaining time. Display seed cost, duration, and harvest value where they help the decision. Hide irrelevant controls. Use Harvest all when multiple crops are ripe and Water all when any bed can be watered. The wallet is the existing coin balance, not a new farm currency.

For narrow screens, stack the garden above the selected bed and keep actions large enough for touch. Provide keyboard selection and labels for each bed. Pair color with crop shapes, a water icon, and action text so state is understandable without color. Respect reduced motion. The placed office display should show the garden and a ready state; keep detailed timers inside the farm rather than floating over every world object.

Needed artwork: a six-bed garden base, seed/sprout/growing/ripe states for three crops, dry and wet soil, seed icons, a watering effect, a harvest effect, and directional views for the office display. Existing furniture can decorate the scene, but does not supply the missing crop states. Track texture and frame costs before adding animals or dozens of variants.

## Implementation

React, PixiJS, Fastify, strict Zod command parsing, WebSockets, and MikroORM/PostgreSQL already exist. Relevant code: [client dependencies](../apps/client/package.json), [WorldCanvas](../apps/client/src/components/WorldCanvas.tsx), [protocol parsing](../apps/server/src/protocol.ts), [shared contracts](../packages/shared/src/index.ts), [economy store](../apps/server/src/economy/economy-store.ts), [persistence writer](../apps/server/src/app.ts), [workspace repository](../apps/server/src/persistence/postgresql-workspace-repository.ts), and [transaction constraints](../apps/server/src/persistence/entities/workspace-entities.ts).

| Location | Responsibility |
| --- | --- |
| New `packages/shared/src/farm.ts` | Typed crop catalogue, farm contracts, state derivation, durations, integer payout rules. |
| New `apps/server/src/farm/` | Plant/water/harvest validation, cycle receipts, allowance reservations, subscriptions, and command orchestration. |
| Existing economy module | Canonical seed debits and harvest credits with operation fingerprints and source cycle IDs. |
| Existing persistence module and migrations | Farm rows, cycles, receipts, budgets, constraints, loading and saving with the wallet. |
| New `apps/client/src/farm/` | Farm panel, Pixi crop rendering, seed selection, batch actions, and subscription state. |
| Existing asset generation scripts | Original crop models, directional sprites, animation/export metadata, and artwork checks. |

Persist one farm identity per member, fixed bed indexes, a revision, and crop cycle records. Each cycle needs its own ID, crop/rule version, paid seed cost, maximum profit, budget day, planting time, initial watering time, extra-care time, and eventual harvest receipt. Snapshot the financial terms so a later balance change does not alter an already purchased crop. Keep settled cycle evidence linked to its ledger transaction; clearing a bed must not delete that evidence.

Derive state as empty, waiting for initial water, growing, or ready. Set `readyAt = firstWateredAt + growthDuration`; extra care is valid only when `firstWateredAt + 30 minutes <= now < readyAt` for crops longer than 30 minutes. Reject repeat care. All timestamps and prices come from the server. Send `serverNow`, revision, and changed beds on mutations; the client draws countdowns and growth stages locally, then refreshes after reconnect or returning from the background.

Use bounded commands such as `farm.subscribe`, `farm.plant`, `farm.water`, and `farm.harvest`. Include a request ID, expected farm revision, and at most six distinct bed IDs. Resolve the user from the authenticated connection. Plant includes only a crop ID, never a price or reward. Reject stale revisions with a fresh snapshot and never repeat a spending command automatically. Scope subscriptions to the owner until visiting is explicitly added.

Do not put farms into the 50 ms world loop. Calculating readiness is constant work per requested bed and requires no running job per crop. Add a bounded due-time queue only if reminders or connected-client readiness events require it; discard notification work made stale by harvesting or a changed revision. A local countdown never authorizes a payout.

The important technical gate is persistence. The existing repository saves a whole-workspace snapshot in a database transaction, while `app.ts` serializes saves and marks mutable state dirty on failure. In-memory mutation plus a later save is not enough to establish an atomic, durable farm command.

For the MVP, keep farm state in the same canonical workspace persistence flow as its coin ledger. Add a commit coordinator shared by farm operations, other coin-changing operations, and the snapshot writer. Serialize conflicting economy mutations, prepare candidate farm/economy changes, persist their receipts and ledger together, then publish those aggregate changes and acknowledge success. A failed save leaves the previously committed farm and wallet unchanged. Preserve unrelated world changes arriving during the save; do not swap an entire stale workspace clone back into memory. A background snapshot must never overwrite newly committed economy rows. Establish this coordination before enabling paid planting; a second independent farm writer would require a larger persistence redesign.

Add `farm_seed_purchase` and `farm_harvest` to shared ledger kinds, database checks, restore validation, and account indexes together. An idempotency key such as `farm:harvest:<cycleId>` makes retries return the original result. Also fingerprint request contents so reusing a request ID with different beds fails. Farm evidence must validate farm credits directly; do not manufacture scored-game lines or wins to reuse `rewardGame`. Database uniqueness, transaction rollback, and revision checks must agree with the in-memory rules. Sources for the implementation mechanism: [MikroORM transactions](https://mikro-orm.io/docs/transactions), [PostgreSQL row locking](https://www.postgresql.org/docs/current/explicit-locking.html).

Deleting a member removes their farm under the same persistence transaction as account removal. Moving, storing, selling, or donating an optional office display changes that display only; personal production remains owned by the original member. Ordinary room access must not grant harvesting permission. A workspace starts without seeded example farms; create personal state on first use.

## Delivery and validation

| Stage | Deliverable | Exit condition |
| --- | --- | --- |
| Playable slice | One crop, six beds, manual and bulk controls, simulated time, first-pass artwork. | A new player completes plant → water → harvest and understands the next return time. |
| Authoritative economy | Three crops, server clock, farm persistence, reservations, receipts, commit coordination. | Concurrent requests, retries, restarts, and failed saves preserve crops and money exactly once. |
| Presentation and progression | Final crop art, office entrance/display, mobile layout, mastery/cosmetics. | Short visits work on keyboard and touch; office rendering remains responsive. |
| Retention pilot | Opt-in grouped reminders and analytics. | Actual return intervals and currency issuance justify the timings and allowance. |

Provisionally allow 3–5 engineering weeks for one experienced engineer, plus overlapping art/design work. Durable settlement coordination and the art pipeline are the largest uncertainties. Closed-app reminders add platform integration and testing; a programmable robot expansion has a substantially different scope. This is an estimate from the inspected architecture, not a delivery commitment.

Required implementation checks: exact ready/care boundaries, negative or forged prices, insufficient funds, repeated watering, duplicate harvest with different request IDs, request-key fingerprint conflicts, two tabs buying the last available seed budget, atomic batch rejection, offline growth, UTC rollover with old reservations, changed crop rules, display disposal, ownership checks, member deletion, account recovery grants, and database failure/restart at every settlement stage. Use actual PostgreSQL integration tests for constraints and transactions, not only an in-memory repository. Browser checks should cover touch, keyboard, live countdown updates, stale revisions, reduced motion, and reminder grouping. Check existing lint/typecheck/test/build and asset validation before production release.

Investigation verification: inspected the live repository architecture and earlier farm research, checked the cited primary documentation, and created the standalone concept. Preview verification results are recorded in [preview validation](farm-concept/validation.md). No application game, migration, notification delivery, production capacity test, player study, or real-money settlement was implemented or exercised. Deployment performance, the estimate, artwork costs, and actual 30–60-minute retention remain unverified.

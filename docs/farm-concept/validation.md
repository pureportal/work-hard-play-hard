Farm concept validation — October 2, 2026

The preview passed 34 browser assertions in installed Chrome using Playwright. Desktop was checked at 1280 × 900; mobile at an emulated 390 × 844 with reduced motion selected. The captured layouts were also visually inspected.

Checks cover seed debits, first-watering growth, exact 30/45/60-minute transitions, bonus care and repeat-care prevention, gross harvest payouts, empty beds after collection, issuance reservations, an oversized batch, a fully used allowance, insufficient funds, crops held across midnight, missed-care payouts, the next day's allowance, keyboard focus, mobile overflow/touch targets, and a complete mobile planting cycle. No browser runtime or console errors were observed. Mobile emulation is not a real Android device check.

JavaScript syntax checking and Oxlint passed. All 13 local links in the proposal resolve; whitespace checks passed for the new source and documentation files. Application regression suites were not run because application source, dependencies, and behavior were not changed.

Evidence: [browser results](../../artifacts/farm-concept-2026-10-02/checks.json), [desktop capture](../../artifacts/farm-concept-2026-10-02/desktop.png), [mobile capture](../../artifacts/farm-concept-2026-10-02/mobile.png), and [local check script](../../artifacts/farm-concept-2026-10-02/check.mjs). Generated evidence is in the repository's ignored `artifacts` directory; it is not part of the tracked proposal.

This concept uses simulated time and coins, loads directly from `index.html`, and makes no network requests. It contains no application integration, durable storage, account recovery grant, introductory accelerated crop, production notifications, or final crop artwork.

The browser checks exercise the concept's visible controls. They cannot establish correctness of the proposed server, PostgreSQL settlement, concurrency handling, real offline synchronization, or player retention.

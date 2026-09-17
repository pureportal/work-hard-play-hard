# Landing page review — 2026-09-18

## Design

Rebuilt the landing page around a warm cream, coral, sage and lilac palette, self-hosted Bricolage Grotesque and DM Sans, a large illustrated hero, real game screenshots, and short sections. The landing has one intentional brand palette, independent of the office application's theme.

Online research included [Playdate](https://play.date/), [Gather](https://www.gather.town/) and [Palia](https://palia.com/). The useful directions were playful product imagery, compact copy, strong typography and interaction that demonstrates the product. No third-party artwork or website copy was reused.

The image model generated a new office illustration using the existing office screenshot as a reference. The illustration is presented alongside an actual office screenshot and remains separate from all gameplay captures. Original game images and sprite sheets are unchanged.

- Office tour with three keyboard-accessible tabs: the shared space, whiteboard and building tools.
- Three real outfit previews with selectable styles and a changing stage.
- Actual Chess, Falling Blocks and Tic-Tac-Toe screenshots with full-size dialogs.
- Pointer parallax, floating game sprites and props, rotating accents, scroll reveals and restrained hover transitions.
- Motion pause/resume and automatic reduced-motion support, including changes to the operating-system preference while the page is open.
- Responsive image sources, lazy loading, explicit image dimensions and locally served fonts.
- Existing configurable office destination, release download and private-server requirement retained.

No animation library or runtime dependency was added. Production JavaScript is approximately 4.34 kB before gzip (1.72 kB gzipped). The 25 image derivatives, including full-size screenshots, total 798 KiB. The source PNGs and font license files are retained in the repository.

## Verification

- Landing TypeScript and Vite production build passed.
- Repository lint and Git whitespace checks passed.
- Image manifest verification passed for every derivative, including dimensions and source/output hashes.
- Playwright verified both the existing landing HTTP service on port 4174 and the production build through intercepted static-file responses.
- Each browser suite covered 1440×1000, 1920×1080, 1024×768, 800×1024, 390×844, 320×568 and 844×390, plus a mobile 2× pixel-density context.
- Checks include image loading, overflow, accessible control names and touch targets, keyboard tab navigation, outfit selection, all eight image links, dialog focus containment/restoration, Escape/backdrop/close dismissal, image error recovery, pause/resume, running animations, parallax, scroll reveals, reduced-motion preference changes, the skip link, download destination, office navigation with an isolated destination fixture, and screenshot links without JavaScript.
- Desktop, tablet, mobile and both alternate tour views were inspected visually. Iterations fixed tablet overflow from the decorative orbit, sprite placement at tablet sizes, mobile hero spacing, illustration edge blending and the narrow-screen heading decoration.

Captures and machine-readable browser results are under `artifacts/landing-redesign/live/` and `artifacts/landing-redesign/production/`.

Run from the repository root:

```sh
pnpm --filter @workhard/landing build
node scripts/static-landing-check.mjs
node scripts/landing/optimize-media.mjs --check
pnpm lint
```

To check the already running landing service in PowerShell:

```powershell
$env:LANDING_URL = 'http://127.0.0.1:4174'
node scripts/static-landing-check.mjs
```

## Limits

The configured Northstar web-client process had crashed, and port 5173 was serving another project. No processes were started, stopped or restarted. Fresh game captures instead used this workspace's newly compiled client with isolated in-memory API and WebSocket fixtures. This verifies real game rendering and gameplay interactions without changing persistent data.

Live landing-to-office navigation, production reverse-proxy routing, and authenticated backend sessions were not verified. The office destination still uses `VITE_CLIENT_URL`, defaulting to `/app/`; deployment must route that address to the office application. The browser navigation assertion uses an explicitly identified destination fixture.

Artwork provenance and capture commands are documented in `apps/landing/artwork/README.md`.

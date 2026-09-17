# Seating occlusion

Seated avatars draw after their furniture in the existing world depth group. An inverse alpha mask hides only the avatar pixels covered by nearer raised furniture. Names, reactions and status indicators remain outside the mask. Standing or being carried removes it; walking uses the existing floor-depth sort.

Masks are baked from the saved Blockbench models, using the artwork's camera, projection, scale and outlines. Named backrests, arms, bolsters, rails and bowl rims can occlude; cushions, bases and feet cannot. A fragment must be nearer than the individual seat's vertical plane and above the cushion clearance. A backrest's center must also be nearer, so a curved back cannot protrude through a forward-facing occupant. This handles all four rotations and the separate seat depths of long and corner sofas. The three-unit clearance excludes cushion piping. The depth buffer retains gaps between spindles and prevents hidden model surfaces from becoming occluders.

Each mask is clipped to the original artwork's alpha, cropped, deduplicated and packed into a shared atlas per design. Colors share the same geometry. Original PNGs and models are read only; the generator verifies all 93 original seating atlas hashes before and after baking. Lossless WebP copies use the existing image pipeline.

Run `pnpm assets:seating` to regenerate masks and delivery images. Blockbench's web editor and an installed Puppeteer browser are required for baking. `node scripts/world-assets/seating/check.mjs` checks every seat, rotation and material against the original pixels without opening a browser. New or edited seating geometry needs regenerated masks and a visual review, including any new names for raised model parts.

With the client already running, `pnpm e2e:seating` renders every seating design and rotation, every seat individually, occupied sofas, and characters walking in front and behind. Requests are intercepted with test data. Screenshots and pixel-comparison results go to `artifacts/seating/`. `scripts/characters/playwright-depth.ts` also checks avatar crossings and desks; component tests cover carried-player ordering and seat lifecycle changes.

This applies established 2D foreground/background occlusion to the existing Pixi renderer without duplicating colored furniture sprites:

- [Phaser's Monster Tamer RPG map layers](https://phaser.io/news/2025/10/monster-tamer-rpg-tutorial-S2E2)
- [Godot CanvasItem: Y sorting and Z order](https://docs.godotengine.org/en/stable/classes/class_canvasitem.html)
- [Unity sprite masks](https://docs.unity3d.com/6000.0/Documentation/Manual/sprite/mask/sprite-mask-reference.html)
- [PixiJS inverse masks](https://pixijs.com/8.x/guides/components/scene-objects)

The runtime remains a 2D renderer: the mask represents a seated sprite plane, not a 3D articulated character. Masks apply only while occupying the seat; walking collision and depth rules are unchanged.

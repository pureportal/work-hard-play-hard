# Seating artwork

Furniture uses a 45-degree camera with floor depth expanded by √2. Characters use a 10-degree camera and three-quarter side views to preserve their anime faces. Applying the character camera to bent legs made front-facing thighs appear straight and rear-facing feet hang toward the viewer. Centering every occupant in the interaction rectangle also left feet on top of deep cushions.

Seated lower-body and shoe layers now use the furniture's floor projection and cardinal directions, while retaining the character camera's depth coordinate for composition with clothing and hair. The upper body keeps its established rendering. The rig opens the knees slightly; floor seats use extended shins and level feet. A full-character 45-degree prototype was rejected because it obscured faces with hair and changed the established silhouette.

`apps/client/src/world-seat-layout.json` defines forward placement and the cushion surface correction in world units for all 31 seating assets. Placement follows each interaction's own direction, including the corner sofa. The renderer adds hip clearance and a small contact shadow. Gameplay positions, hit areas, reachability and world depth remain attached to the original interaction. Existing furniture occlusion masks still mask the complete seated artwork.

`forward` moves the hip toward the seat's front edge. `surface` is the distance from the furniture model's nominal seat height to its visible cushion top. `pose: "floor"` selects the floor-chair pose. New seating designs must have a layout entry; there is no generic placement for unreviewed furniture.

Generate the derived layers with `pnpm assets:characters:seated`. This uses the existing Blockbench geometry and animations and replaces only seated color/depth frames in delivery copies under `apps/client/public/characters/seated/`. Original character and furniture PNG files are unchanged. `pnpm assets:characters` includes this step. Run `pnpm assets:characters:check` to verify all 96 derived layers, frame bounds, depth data, and identical standing/walking/listening pixels.

Run `pnpm e2e:seating` against an already running client for every seating asset, rotation, interaction and full occupancy, plus walking in front and behind. Set `CHARACTER_SEAT_SCREENSHOTS` to choose the evidence directory and `CHARACTER_SEAT_APPEARANCE=ranger` to inspect the spiky-haired ranger. `node scripts/characters/seating-review-sheets.mjs <evidence-directory>` builds paginated contact sheets. These must be visually inspected; pixel and ordering assertions do not establish natural seating.

`node scripts/characters/blockbench/seated-review.mjs` composes all outfit sets in both seated poses and four directions using the client renderer. Add `--listening` to inspect seated listening frames.

The approach follows the separation of seat dimensions, facing and custom offsets documented for [Stardew Valley map seats](https://wiki.stardewvalley.net/Modding:Maps#Sitting_on_non-furniture_chairs), and the separate placement and pose controls demonstrated by [Starbound furniture authors](https://community.playstarbound.com/threads/animations-for-sitting.55323/). Those sources support treating contact position and pose independently. The selective leg projection is specific to this project's artwork.

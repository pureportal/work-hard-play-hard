# Asset generation options

Historical trials from before the [completed Blockbench migration](blockbench-migration.md). Use [world asset generation](world-assets.md) for the production pipeline.

Checked 14 September 2026. Both image generation and a free 3D workflow produced desk samples. For repeatable furniture production, use one editable 3D model per object and render its four directions. Blockbench is suitable for simple modeling; Blender is the stronger candidate for a shared lighting, outline and material setup. Modeling and art direction still take time, even when software and local rendering have no service fee.

## Practical trials

**Image generation:** the image-generation tool successfully redrew the existing standing desk using the desk atlas and avatar source as references. The result is a 1254 × 1254 RGBA sheet with four views and real transparency. It has visible edge artifacts and does not establish consistent camera geometry or production quality. No PixelLab generation was used. The tool did not report pricing or account limits, so this trial does not establish a free or unlimited image-generation allowance.

**Blockbench:** a new desk was constructed from 21 cuboids with six embedded material textures and rendered through Blockbench's web app, version 5.1.6. Four cardinal views use the same model, a 45-degree camera elevation, the same target and the same orthographic scale. The result is four 512 × 512 transparent PNGs plus a 1024 × 1024 contact sheet, ordered south, west, north, east. This is a simple geometry demonstration; its flat materials are not a finished match for the avatars. A Blockbench desktop installation was also found in `C:\Program Files\Blockbench`; the trial used the web app in an isolated browser.

Artifacts:

- [Image-generation sample](../artifacts/asset-generation-research/imagegen-standing-desk.png)
- [Blockbench four-view sample](../artifacts/asset-generation-research/blockbench-standing-desk.png)
- [Editable Blockbench model](../artifacts/asset-generation-research/standing-desk.bbmodel)
- [Reproducible Blockbench experiment](../artifacts/asset-generation-research/render-blockbench.mjs)
- [Verification results](../artifacts/asset-generation-research/blockbench-verification.json)

Regenerate the Blockbench experiment with `node artifacts/asset-generation-research/render-blockbench.mjs`. It requires the existing project dependencies and internet access to the Blockbench web app. It starts no development server. These artifacts are Git-ignored; include the directory when sharing this report.

## Free alternatives

| Tool | Cost and fit |
| --- | --- |
| [Blender](https://www.blender.org/about/license/) | Free and open source, including commercial artwork production. Best candidate for the final render setup and detailed or rounded objects. Its Python and command-line interfaces support automation. |
| [Blockbench](https://www.blockbench.net/) | Free and open source, with desktop and browser versions. Good for simple furniture, pixel textures and direct model editing. Transparent PNG export was demonstrated in this trial. |
| [MagicaVoxel](https://ephtracy.github.io/mv_main.html) | Free to use for any project; includes a voxel editor and renderer. A good option if a visibly voxel-based style is desired. I would favor polygon modeling for the smoother avatar style. |
| [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) | Free CC0 3D furniture assets that could reduce initial modeling work. Individual models and style suitability were not tested. |

Blender's [camera documentation](https://docs.blender.org/manual/en/latest/render/cameras.html) describes orthographic projection, and its [command-line documentation](https://docs.blender.org/manual/en/4.2/advanced/command_line/index.html) covers automated operation. Blender was not found on PATH or in the standard Blender Foundation installation directory; no Blender render was run. MagicaVoxel was researched, not tested.

## Fit with this project

The current manifests contain 74 assets and 222 designs. The client already consumes four PNG crops in south, west, north, east order for rotations 0, 90, 180, 270. The game can continue using 2D sprites produced from 3D models.

A production workflow would:

1. Model each object once, keeping a common physical scale and floor pivot.
2. Use a fixed elevated orthographic camera and lighting; rotate the object in 90-degree steps. Match the game's cardinal projection rather than choosing a diagonal isometric preset.
3. Render transparent PNGs for each material and direction, preserving scale and anchors when packing the atlas.
4. Review the results at actual world and catalog-preview sizes beside the avatars.

Two integration details need work before adopting these outputs. `scripts/world-assets/source-images.mjs` and the artwork checks currently require PixelLab source URLs; local renders need corresponding source provenance and import support. Separately, `apps/client/src/world-asset-artwork.ts` derives dimensions from rotated collision footprints and can stretch artwork. The [proportion review](asset-proportion-review-2026-09-14.md) documents those display issues. Consistent 3D source geometry alone will not fix the current display sizing.

## Verification and limits

The Blockbench experiment passed checks for four nonempty 512 × 512 images, transparent backgrounds, unclipped geometry and no browser page errors. The exported model reopened in a fresh browser page with all 21 cubes and six textures, with no missing face textures. Both generated contact sheets were visually inspected. The image-generation PNG's dimensions and alpha channel were inspected separately.

This work added this report and isolated experiment artifacts. No application code, public artwork, asset manifests or saved worlds were changed by this investigation. No game integration, complete catalog conversion or final style match was verified. Application tests and builds were not run because application files were not changed.

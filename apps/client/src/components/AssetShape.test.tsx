import { cleanup, render } from "@testing-library/react";
import { ASSET_CATALOG, ASSET_ROTATIONS, getAssetVariants, requireAssetDefinition } from "@workhard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { getWorldAssetArtwork } from "../world-asset-artwork";
import { getAssetPreviewPath, getOptimizedImagePath } from "../optimized-images";
import { AssetShape } from "./AssetShape";

afterEach(cleanup);

describe("AssetShape", () => {
  it.each(ASSET_CATALOG.assets)("shows every design and direction of $id", (asset) => {
    for (const variant of getAssetVariants(asset)) {
      for (const rotation of ASSET_ROTATIONS) {
        const { container, unmount } = render(<AssetShape asset={asset} variantId={variant.id} rotation={rotation} />);
        const artwork = getWorldAssetArtwork(asset, variant.id, rotation);
        const crop = container.querySelector(".asset-shape-artwork");
        expect(crop?.getAttribute("href")).toBe(getAssetPreviewPath(artwork.path, rotation));
        expect(crop?.getAttribute("href")).not.toBe(getOptimizedImagePath(artwork.path));
        for (const dimension of ["x", "y", "width", "height"] as const) expect(Number(crop?.getAttribute(dimension))).toBe(artwork.bounds[dimension]);
        expect(crop?.getAttribute("preserveAspectRatio")).toBe("none");
        expect(container.querySelector(".asset-shape")?.getAttribute("aria-hidden")).toBe("true");
        unmount();
      }
    }
  });

  it("changes both the selected material and directional crop on rerender", () => {
    const asset = requireAssetDefinition("equipment-bookshelf");
    const { container, rerender } = render(<AssetShape asset={asset} />);
    const front = container.querySelector("image")?.getAttribute("href");
    rerender(<AssetShape asset={asset} variantId="violet" rotation={90} />);
    expect(container.querySelector("image")?.getAttribute("href")).toBe(getAssetPreviewPath("/world-assets/equipment-bookshelf/violet.png", 90));
    expect(container.querySelector("image")?.getAttribute("href")).not.toBe(front);
  });
});

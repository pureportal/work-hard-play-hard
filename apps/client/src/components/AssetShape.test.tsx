import { cleanup, render } from "@testing-library/react";
import { ASSET_CATALOG, ASSET_ROTATIONS, getAssetVariants, requireAssetDefinition } from "@workhard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { getWorldAssetArtwork } from "../world-asset-artwork";
import { AssetShape } from "./AssetShape";

afterEach(cleanup);

describe("AssetShape", () => {
  it.each(ASSET_CATALOG.assets)("shows every design and direction of $id", (asset) => {
    for (const variant of getAssetVariants(asset)) {
      for (const rotation of ASSET_ROTATIONS) {
        const { container, unmount } = render(<AssetShape asset={asset} variantId={variant.id} rotation={rotation} />);
        const artwork = getWorldAssetArtwork(asset, variant.id, rotation);
        const crop = container.querySelector(".asset-shape-artwork");
        expect(container.querySelector("image")?.getAttribute("href")).toBe(artwork.path);
        expect(crop?.getAttribute("viewBox")).toBe([artwork.frame.x, artwork.frame.y, artwork.frame.width, artwork.frame.height].join(" "));
        expect(crop?.getAttribute("overflow")).toBe("hidden");
        expect(container.querySelector(".asset-shape")?.getAttribute("aria-hidden")).toBe("true");
        unmount();
      }
    }
  });

  it("changes both the selected material and directional crop on rerender", () => {
    const asset = requireAssetDefinition("equipment-bookshelf");
    const { container, rerender } = render(<AssetShape asset={asset} />);
    const front = container.querySelector(".asset-shape-artwork")?.getAttribute("viewBox");
    rerender(<AssetShape asset={asset} variantId="violet" rotation={90} />);
    expect(container.querySelector("image")?.getAttribute("href")).toBe("/world-assets/equipment-bookshelf/violet.png");
    expect(container.querySelector(".asset-shape-artwork")?.getAttribute("viewBox")).not.toBe(front);
  });
});

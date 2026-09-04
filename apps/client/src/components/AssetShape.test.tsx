import { cleanup, render } from "@testing-library/react";
import { ASSET_CATALOG, requireAssetDefinition } from "@workhard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { AssetShape } from "./AssetShape";

afterEach(cleanup);

describe("AssetShape", () => {
  it("renders every catalog asset with placed-object artwork", () => {
    const { container } = render(
      <>
        {ASSET_CATALOG.assets.map((asset) => (
          <span data-asset-id={asset.id} key={asset.id}><AssetShape asset={asset} /></span>
        ))}
      </>,
    );

    expect(container.querySelectorAll(".asset-shape")).toHaveLength(ASSET_CATALOG.assets.length);
    for (const asset of ASSET_CATALOG.assets) {
      const preview = container.querySelector(`[data-asset-id="${asset.id}"]`);
      expect(preview?.querySelector(".asset-shape-body, .asset-shape-floor-surface, .asset-shape-gong-artwork")).toBeTruthy();
    }
  });

  it("matches the bookshelf footprint, frame, and book colors", () => {
    const { container } = render(<AssetShape asset={requireAssetDefinition("equipment-bookshelf")} />);
    const preview = container.querySelector(".asset-shape");
    const books = [...container.querySelectorAll<SVGRectElement>(".asset-shape-book")];

    expect(preview?.getAttribute("viewBox")).toBe("-6 -6 92 44");
    expect(books).toHaveLength(6);
    expect(books.map((book) => book.getAttribute("fill"))).toEqual([
      "#d96f67",
      "#e2b458",
      "#6b91c8",
      "#71a47d",
      "#a77bc0",
      "#d96f67",
    ]);
    expect(container.querySelector(".asset-shape-bookshelf-details > rect")?.getAttribute("fill")).toBe("#252630");
  });

  it("rotates both the footprint and bookshelf contents", () => {
    const { container } = render(<AssetShape asset={requireAssetDefinition("equipment-bookshelf")} rotation={90} />);
    const firstBook = container.querySelector(".asset-shape-book");

    expect(container.querySelector(".asset-shape")?.getAttribute("viewBox")).toBe("-6 -6 44 92");
    expect(firstBook?.getAttribute("width")).toBe("20");
    expect(firstBook?.getAttribute("height")).toBe("7");
  });

  it("uses the scene-specific gong and Tetris artwork", () => {
    const { container, rerender } = render(<AssetShape asset={requireAssetDefinition("equipment-gong")} />);

    expect(container.querySelector(".asset-shape-gong-disc")).toBeTruthy();
    expect(container.querySelector(".asset-shape-gong-mallet")).toBeTruthy();
    expect(container.querySelector(".asset-shape-cell")).toBeNull();

    rerender(<AssetShape asset={requireAssetDefinition("equipment-tetris")} />);

    expect(container.querySelectorAll(".asset-shape-game-block")).toHaveLength(4);
    expect(container.querySelectorAll(".asset-shape-cell")).toHaveLength(42);
  });

  it("applies the selected design colors", () => {
    const { container } = render(
      <AssetShape asset={requireAssetDefinition("equipment-bookshelf")} variantId="violet" />,
    );
    const preview = container.querySelector<SVGSVGElement>(".asset-shape");

    expect(preview?.style.getPropertyValue("--asset-color")).toBe("#665a9a");
    expect(container.querySelector(".asset-shape-bookshelf-details > rect")?.getAttribute("fill")).toBe("#3e356a");
  });
});

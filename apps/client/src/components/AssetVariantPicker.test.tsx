import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { requireAssetDefinition } from "@workhard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { AssetVariantPicker } from "./AssetVariantPicker";

afterEach(cleanup);

function DesignPicker() {
  const [value, setValue] = useState("sage");
  return <AssetVariantPicker asset={requireAssetDefinition("desk-standing")} value={value} onChange={setValue} />;
}

describe("asset design keyboard selection", () => {
  it("moves focus and selection together, wraps, and keeps one tab stop", () => {
    render(<DesignPicker />);
    const sage = screen.getByRole("radio", { name: "Sage" });
    const oak = screen.getByRole("radio", { name: "Oak" });
    const navy = screen.getByRole("radio", { name: "Navy" });
    sage.focus();
    fireEvent.keyDown(sage, { key: "ArrowRight" });
    expect(document.activeElement).toBe(oak);
    expect(oak.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(oak, { key: "End" });
    expect(document.activeElement).toBe(navy);
    fireEvent.keyDown(navy, { key: "ArrowDown" });
    expect(document.activeElement).toBe(sage);
    fireEvent.keyDown(sage, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(navy);
    expect(screen.getAllByRole("radio").filter((radio) => radio.tabIndex === 0)).toEqual([navy]);
    fireEvent.keyDown(navy, { key: "Home" });
    expect(document.activeElement).toBe(sage);
    expect(sage.getAttribute("aria-checked")).toBe("true");
  });
});

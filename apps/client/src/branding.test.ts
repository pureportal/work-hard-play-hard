import { describe, expect, it } from "vitest";
import { contrastingTextColor } from "./branding";

describe("brand color contrast", () => {
  it("selects readable text for dark and light brand colors", () => {
    expect(contrastingTextColor("#6757e8")).toBe("#ffffff");
    expect(contrastingTextColor("#f2d94e")).toBe("#171821");
  });
});

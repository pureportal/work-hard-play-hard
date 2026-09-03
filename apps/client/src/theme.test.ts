import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyColorTheme, getInitialColorTheme } from "./theme";

describe("color theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the system preference until a theme is saved", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));

    expect(getInitialColorTheme()).toBe("dark");

    window.localStorage.setItem("northstar-color-theme", "light");
    expect(getInitialColorTheme()).toBe("light");
  });

  it("applies and persists the selected theme", () => {
    applyColorTheme("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("northstar-color-theme")).toBe("dark");
  });
});

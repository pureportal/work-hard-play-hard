import { vi } from "vitest";

vi.stubGlobal("ResizeObserver", vi.fn(function ResizeObserver() {
  return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
}));

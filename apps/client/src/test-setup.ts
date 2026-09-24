import { beforeEach, vi } from "vitest";

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); }) },
    close: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); }) },
  });
  vi.stubGlobal("ResizeObserver", vi.fn(function ResizeObserver() {
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  }));
  vi.stubGlobal("IntersectionObserver", vi.fn(function IntersectionObserver() {
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  }));
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  })));
});

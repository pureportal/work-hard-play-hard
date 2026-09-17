import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const origin = "https://office.example.test";
const entry = `${origin}/assets/index-old.js`;
const reload = vi.fn();
const fetchIndex = vi.fn<typeof fetch>();
let reloadUpdatedClient: typeof import("./client-update").reloadUpdatedClient;

function indexResponse(source = "/assets/index-new.js") {
  return new Response(`<script type="module" src="${source}"></script>`, { headers: { "content-type": "text/html" } });
}

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("PROD", true);
  vi.stubEnv("BASE_URL", "/");
  sessionStorage.clear();
  document.head.innerHTML = `<script type="module" src="${entry}"></script>`;
  reload.mockReset();
  fetchIndex.mockReset().mockResolvedValue(indexResponse());
  vi.stubGlobal("fetch", fetchIndex);
  vi.stubGlobal("location", { origin, protocol: "https:", href: `${origin}/?invite=example`, reload });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  ({ reloadUpdatedClient } = await import("./client-update"));
});

afterEach(() => {
  document.head.innerHTML = "";
  sessionStorage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("client update recovery", () => {
  it("never checks web deployments from an HTTPS Tauri document", async () => {
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    expect(await reloadUpdatedClient()).toBe(false);
    expect(fetchIndex).not.toHaveBeenCalled();
  });
  it("checks fresh HTML and reloads once when simultaneous asset failures find a different build", async () => {
    expect(await Promise.all([reloadUpdatedClient(), reloadUpdatedClient()])).toEqual([true, true]);
    expect(fetchIndex).toHaveBeenCalledTimes(1);
    expect(fetchIndex).toHaveBeenCalledWith(new URL(`${origin}/index.html`), { cache: "no-store", signal: expect.any(AbortSignal) });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not loop if a reload serves the same outdated document again", async () => {
    await reloadUpdatedClient();
    vi.resetModules();
    ({ reloadUpdatedClient } = await import("./client-update"));
    expect(await reloadUpdatedClient()).toBe(false);
    expect(fetchIndex).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("preserves the original failure when the latest build has the same entry", async () => {
    fetchIndex.mockResolvedValue(indexResponse(entry));
    expect(await reloadUpdatedClient()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it.each([
    () => new Response("Unavailable", { status: 503 }),
    () => new Response("{}", { headers: { "content-type": "application/json" } }),
    () => new Response("<html>Sign in</html>", { headers: { "content-type": "text/html" } }),
    () => indexResponse("https://another.example.test/assets/index.js"),
    () => Object.defineProperty(indexResponse(), "redirected", { value: true }),
  ])("does not reload for an invalid update response (%#)", async (response) => {
    fetchIndex.mockResolvedValue(response());
    expect(await reloadUpdatedClient()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("keeps recovery manual when the update check cannot reach the server", async () => {
    fetchIndex.mockRejectedValue(new TypeError("Network error"));
    expect(await reloadUpdatedClient()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it("keeps recovery manual when the reload guard cannot be persisted", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
    expect(await reloadUpdatedClient()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it("skips development and packaged application documents", async () => {
    vi.stubEnv("PROD", false);
    expect(await reloadUpdatedClient()).toBe(false);
    vi.stubEnv("PROD", true);
    vi.stubGlobal("location", { protocol: "tauri:" });
    expect(await reloadUpdatedClient()).toBe(false);
    expect(fetchIndex).not.toHaveBeenCalled();
  });
});

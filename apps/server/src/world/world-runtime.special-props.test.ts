import { SPECIAL_PROPS, SPECIAL_PROP_COOLDOWN_MS, getDefaultAssetVariantId, requireAssetDefinition, type ServerEvent } from "@workhard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestData } from "../testing/workspace-data.js";
import { WorkspaceStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

afterEach(() => vi.useRealTimers());

function setup(assetId = "special-confetti", near = true) {
  const store = new WorkspaceStore(createTestData());
  const layout = store.getLayout("floor-studio")!;
  layout.objects.push({ id: "toy", assetId, variantId: getDefaultAssetVariantId(requireAssetDefinition(assetId)), rotation: 90, floorId: layout.floorId, x: 448, y: 112 });
  const runtime = new WorldRuntime(store);
  if (near) runtime.restorePlayers(runtime.serializePlayers().map(player => ({ ...player, ...(["user-maya", "user-leo"].includes(player.userId) ? { x: 430, y: 152 } : {}) })));
  const events: ServerEvent[] = [];
  const peer = runtime.connect("user-maya", "floor-studio", event => events.push(event));
  return { runtime, events, peer, use: () => runtime.handleCommand(peer, { type: "interaction.use_prop", requestId: "use", objectId: "toy" }) };
}

describe("special prop interactions", () => {
  it.each(Object.keys(SPECIAL_PROPS))("uses %s and shares one outcome with people on the floor", assetId => {
    const { runtime, events, use } = setup(assetId);
    const nearby: ServerEvent[] = [], elsewhere: ServerEvent[] = [];
    runtime.connect("user-leo", "floor-studio", event => nearby.push(event));
    runtime.connect("user-noah", "floor-rooftop", event => elsewhere.push(event));
    use();
    const event = events.find(event => event.type === "interaction.prop_used");
    expect(event).toMatchObject({ type: "interaction.prop_used", use: { assetId, objectId: "toy", userId: "user-maya" } });
    expect(nearby).toContainEqual(event);
    expect(elsewhere.some(event => event.type === "interaction.prop_used")).toBe(false);
    if (event?.type === "interaction.prop_used") {
      expect(Boolean(event.use.result)).toBe(["special-fortune", "special-break-wheel"].includes(assetId));
      expect(event.use.cooldownUntil - event.use.usedAt).toBe(SPECIAL_PROP_COOLDOWN_MS);
    }
    runtime.stop();
  });

  it("shares the cooldown across users and reconnects, then allows another use", () => {
    vi.useFakeTimers();
    const { runtime, events, use } = setup();
    const other: ServerEvent[] = [];
    let peer = runtime.connect("user-leo", "floor-studio", event => other.push(event));
    use();
    runtime.disconnect(peer);
    peer = runtime.connect("user-leo", "floor-studio", event => other.push(event));
    runtime.handleCommand(peer, { type: "interaction.use_prop", requestId: "other", objectId: "toy" });
    expect(other.at(-1)).toMatchObject({ type: "command.error", code: "PROP_COOLDOWN" });
    vi.advanceTimersByTime(SPECIAL_PROP_COOLDOWN_MS);
    use();
    expect(events.filter(event => event.type === "interaction.prop_used")).toHaveLength(2);
    runtime.stop();
  });

  it("requires proximity and rejects ordinary furniture", () => {
    const distant = setup("special-bubbles", false);
    distant.use();
    expect(distant.events.at(-1)).toMatchObject({ type: "command.error", code: "PROP_TOO_FAR" });
    distant.runtime.stop();
    const ordinary = setup("equipment-gong");
    ordinary.use();
    expect(ordinary.events.at(-1)).toMatchObject({ type: "command.error", code: "PROP_NOT_FOUND" });
    ordinary.runtime.stop();
  });

  it("keeps effects out of meetings and rejects meeting participants using props", () => {
    const { runtime, events, peer, use } = setup();
    const other: ServerEvent[] = [];
    const otherPeer = runtime.connect("user-leo", "floor-studio", event => other.push(event));
    runtime.handleCommand(otherPeer, { type: "meeting.join", requestId: "join", meetingId: "meeting-product-crit" });
    use();
    expect(events.some(event => event.type === "interaction.prop_used")).toBe(true);
    expect(other.some(event => event.type === "interaction.prop_used")).toBe(false);
    runtime.handleCommand(peer, { type: "meeting.join", requestId: "join-self", meetingId: "meeting-product-crit" });
    use();
    expect(events.at(-1)).toMatchObject({ type: "command.error", code: "PROP_IN_MEETING" });
    runtime.stop();
  });
});

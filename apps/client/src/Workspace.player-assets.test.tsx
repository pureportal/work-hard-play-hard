import { createPublicEconomy } from "@workhard/shared";
import { createOrganisation } from "@workhard/shared";
import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetDefinition, BootstrapData, BuildProject, ClientCommand, ServerEvent, WorldSnapshot } from "@workhard/shared";
import type { ReactNode } from "react";
import { Workspace } from "./App";
import { ContextMenuProvider } from "./components/ContextMenu";
import { getServerOrigin } from "./server-url";
import type { WorldCanvasProps } from "./components/WorldCanvas";
import { createTestCorporateIdentity, createTestEconomy, createTestGameSettings, createTestKidnappingConfiguration } from "./test-fixtures";

const realtime = vi.hoisted(() => ({
  handler: undefined as ((event: ServerEvent) => void) | undefined,
  send: vi.fn<(command: ClientCommand) => boolean>(),
  snapshot: undefined as WorldSnapshot | undefined,
  connection: "online" as "online" | "offline",
}));

vi.mock("./hooks/useRealtime", () => ({
  useRealtime: ({ onEvent }: { onEvent: (event: ServerEvent) => void }) => {
    realtime.handler = onEvent;
    return { connection: realtime.connection, snapshot: realtime.snapshot, send: realtime.send };
  },
}));

vi.mock("./components/CharacterPreview", () => ({ CharacterPreview: () => null }));
vi.mock("./components/AssetShape", () => ({ AssetShape: () => null }));
vi.mock("./components/AssetBrowser", () => ({
  AssetBrowser: ({ assets, renderAsset, footer }: { assets: AssetDefinition[]; renderAsset: (asset: AssetDefinition) => ReactNode; footer?: ReactNode }) =>
    <>{assets.filter((asset) => asset.id === "chair-office" || asset.id === "light-floor").map(renderAsset)}{footer}</>,
}));

vi.mock("./components/WorldCanvasLoader", () => ({
  preloadWorldCanvas: vi.fn(),
  WorldCanvas: ({ editing, editingTool, editingAssetId, editingAssetVariantId, editingAssetRotation, onEdit, onPlacementBlocked, floor, focusTarget, selectedBuildItem, layout, onBuildItemSelect, onContextSelect }: WorldCanvasProps) => (
    <div data-testid="world" data-floor={floor.id} data-focus={JSON.stringify(focusTarget)} data-selected={selectedBuildItem?.id}
      data-tool={editingTool ?? ""} data-asset={editingAssetId} data-variant={editingAssetVariantId} data-rotation={editingAssetRotation}>
      {editing && layout.objects.map((object) => <button key={object.id} onClick={() => onBuildItemSelect({ type: "asset", id: object.id })}>Select {object.id}</button>)}
      {editing && layout.objects.map((object) => <button key={`context-${object.id}`} onClick={() => onContextSelect?.({ type: "build", item: { type: "asset", id: object.id } }, { x: 10, y: 10 })}>Context {object.id}</button>)}
      {editing && editingTool === "erase" && layout.objects.map((object) =>
        <button key={`erase-${object.id}`} onClick={() => onEdit({ tool: "item.remove", item: { type: "asset", id: object.id } })}>Erase {object.id}</button>)}
      {editing && editingTool === "asset" && (
        <>
          <button onClick={() => onEdit({ tool: "asset", assetId: editingAssetId, variantId: editingAssetVariantId, rotation: editingAssetRotation, position: { x: 32, y: 32 } })}>
            Place on canvas
          </button>
          <button onClick={() => onPlacementBlocked("Place it fully inside a room.")}>Place outside room</button>
        </>
      )}
    </div>
  ),
}));

beforeAll(async () => {
  await Promise.all([
    import("./components/PlayerBuildPanel"),
    import("./components/BuildPanel"),
    import("./components/economy/FundsPanel"),
    import("./components/economy/DonationPanel"),
  ]);
}, 60_000);

beforeEach(() => {
  localStorage.setItem(`game-guide:${getServerOrigin()}:player`, "seen");
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
  realtime.send.mockReset().mockReturnValue(true);
  realtime.connection = "online";
  realtime.snapshot = {
    type: "world.snapshot",
    tick: 1,
    floorId: "floor",
    layoutRevision: 1,
    players: [{
      userId: "player",
      floorId: "floor",
      x: 200,
      y: 200,
      facing: "down",
      availability: "available",
      connected: true,
    }],
  };
});

afterEach(cleanup);

describe("Workspace player assets", { timeout: 30000 }, () => {
  it("previews a personal purchase, confirms payment and retries an error without leaving the dialog", async () => {
    const data = workspace();
    data.economy.inventory = [];
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview Office chair" }, { timeout: 10000 }));
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "economy.purchase_asset" }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    expect(screen.getByRole("dialog", { name: "Place Office chair" })).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Place Office chair" }).textContent).toContain("Personal");
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "player_asset.purchase_place" }));
    fireEvent.click(screen.getByRole("button", { name: "Buy and place" }));
    fireEvent.click(screen.getByRole("button", { name: "Buy and place" }));
    const purchases = () => realtime.send.mock.calls.map(([command]) => command).filter((command) => command.type === "player_asset.purchase_place");
    expect(purchases()).toHaveLength(1);
    expect(purchases()[0]).toMatchObject({ assetId: "chair-office", position: { x: 32, y: 32 }, rotation: 0, variantId: "white" });
    act(() => realtime.handler?.({ type: "command.error", requestId: purchases()[0]!.requestId, code: "ASSET_PLACEMENT_BLOCKED", message: "Choose another spot." }));
    expect(within(screen.getByRole("dialog", { name: "Place Office chair" })).getByRole("alert").textContent).toBe("Choose another spot.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Place Office chair" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    fireEvent.click(screen.getByRole("button", { name: "Buy and place" }));
    expect(purchases()).toHaveLength(2);
    const economy = createTestEconomy();
    act(() => realtime.handler?.({ type: "economy.updated", requestId: purchases()[1]!.requestId, economy }));
    expect(screen.queryByRole("dialog", { name: "Place Office chair" })).toBeNull();
    expect(screen.getByTestId("world").getAttribute("data-tool")).toBe("");
  });

  it("uses a shared stored item and keeps direct application in the build panel", async () => {
    const data = workspace();
    data.publicEconomy.inventory = [{ id: "stored-chair", assetId: "chair-office", paid: 70, fundId: "workspace" }];
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.change(await screen.findByRole("combobox", { name: "Ownership" }), { target: { value: "shared" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview Office chair" }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    const edit = realtime.send.mock.calls.map(([command]) => command).find((command) => command.type === "project.edit")!;
    expect(edit).toMatchObject({ edit: { tool: "public_asset", publicAssetId: "stored-chair" } });
    const project: BuildProject = { id: "draft", fundId: "workspace", floorId: "floor", baseRevision: 1, baseLayout: data.layouts[0]!, layout: data.layouts[0]!, edits: 1,
      quote: { assetChanges: [], cost: 0, refund: 0, refunds: [], structural: false, destructive: false, requiresApproval: false, purchases: [], removedKeys: [], inventoryIds: ["stored-chair"] } };
    act(() => realtime.handler?.({ type: "project.preview", requestId: edit.requestId, project }));
    expect(screen.queryByRole("textbox", { name: "Project name" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
    const submit = realtime.send.mock.calls.map(([command]) => command).find((command) => command.type === "project.submit")!;
    act(() => realtime.handler?.({ type: "project.submitted", requestId: submit.requestId }));
    expect(screen.getByRole("complementary", { name: "Build" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Approvals" })).toBeNull();
  });

  it("keeps a newer draft when an earlier submission response is repeated", async () => {
    const data = workspace();
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.change(await screen.findByRole("combobox", { name: "Ownership" }), { target: { value: "shared" } });
    const project: BuildProject = { id: "first-draft", fundId: "workspace", floorId: "floor", baseRevision: 1,
      baseLayout: data.layouts[0]!, layout: data.layouts[0]!, edits: 1,
      quote: { assetChanges: [], cost: 0, refund: 0, refunds: [], structural: false, destructive: false,
        requiresApproval: false, purchases: [], removedKeys: [], inventoryIds: [] } };
    fireEvent.click(screen.getByRole("button", { name: "Preview Office chair" }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    const firstEdit = realtime.send.mock.calls.map(([command]) => command).filter((command) => command.type === "project.edit").at(-1)!;
    act(() => realtime.handler?.({ type: "project.preview", requestId: firstEdit.requestId, project }));
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
    const submission = realtime.send.mock.calls.map(([command]) => command).find((command) => command.type === "project.submit")!;
    act(() => realtime.handler?.({ type: "project.submitted", requestId: submission.requestId }));
    fireEvent.click(screen.getByRole("button", { name: "Preview Office chair" }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    const secondEdit = realtime.send.mock.calls.map(([command]) => command).filter((command) => command.type === "project.edit").at(-1)!;
    act(() => realtime.handler?.({ type: "project.preview", requestId: secondEdit.requestId, project: { ...project, id: "second-draft" } }));
    act(() => realtime.handler?.({ type: "project.submitted", requestId: submission.requestId, proposalId: "earlier-proposal" }));
    expect(screen.getByRole("complementary", { name: "Build" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
    expect(realtime.send.mock.calls.map(([command]) => command).filter((command) => command.type === "project.submit").at(-1))
      .toMatchObject({ draftId: "second-draft" });
  });

  it("waits for the submission result after receiving its economy update", async () => {
    const data = workspace();
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.change(await screen.findByRole("combobox", { name: "Ownership" }), { target: { value: "shared" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview Office chair" }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    const edit = realtime.send.mock.calls.map(([command]) => command).find((command) => command.type === "project.edit")!;
    const project: BuildProject = { id: "draft", fundId: "workspace", floorId: "floor", baseRevision: 1,
      baseLayout: data.layouts[0]!, layout: data.layouts[0]!, edits: 1,
      quote: { assetChanges: [], cost: 0, refund: 0, refunds: [], structural: false, destructive: false,
        requiresApproval: false, purchases: [], removedKeys: [], inventoryIds: [] } };
    act(() => realtime.handler?.({ type: "project.preview", requestId: edit.requestId, project }));
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
    const submission = realtime.send.mock.calls.map(([command]) => command).find((command) => command.type === "project.submit")!;
    act(() => realtime.handler?.({ type: "public_economy.updated", requestId: submission.requestId, economy: data.publicEconomy }));
    expect((screen.getByRole("button", { name: "Submitting…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Preview Office chair" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => realtime.handler?.({ type: "command.error", requestId: submission.requestId, code: "PROJECT_STALE", message: "Try again." }));
    expect((screen.getByRole("button", { name: "Apply changes" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
    const retry = realtime.send.mock.calls.map(([command]) => command).filter((command) => command.type === "project.submit").at(-1)!;
    act(() => realtime.handler?.({ type: "project.submitted", requestId: retry.requestId }));
    expect(screen.queryByRole("button", { name: "Apply changes" })).toBeNull();
  });

  it("clears a shared placement preview when another session consumes its stored item", async () => {
    const data = workspace();
    data.publicEconomy.inventory = [{ id: "stored-chair", assetId: "chair-office", paid: 70, fundId: "workspace" }];
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.change(await screen.findByRole("combobox", { name: "Ownership" }), { target: { value: "shared" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview Office chair" }));
    expect(screen.getByTestId("world").getAttribute("data-tool")).toBe("asset");
    act(() => realtime.handler?.({ type: "public_economy.updated", economy: { ...data.publicEconomy, inventory: [] } }));
    expect(screen.getByTestId("world").getAttribute("data-tool")).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Preview Office chair" }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "project.edit", edit: expect.objectContaining({ tool: "asset" }) }));
  });

  it.each(["shared", "personal"] as const)("starts a new %s furnishing draft after reconnecting during a proposal revision", async (ownership) => {
    const data = workspace();
    const room = data.layouts[0]!.rooms[0]!;
    delete room.ownerUserId;
    room.access = { mode: "open", assignedPersonIds: [], knockable: false };
    room.build = { mode: "open", assignedPersonIds: [] };
    const project: BuildProject = { id: "proposal-draft", fundId: "workspace", floorId: "floor", baseRevision: 1,
      baseLayout: data.layouts[0]!, layout: data.layouts[0]!, edits: 1,
      quote: { assetChanges: [], cost: 0, refund: 0, refunds: [], structural: false, destructive: false,
        requiresApproval: true, purchases: [], removedKeys: [], inventoryIds: [] } };
    data.publicEconomy.proposals = [{ id: "proposal", title: "Original draft", proposedBy: "player", fundId: "workspace",
      action: { kind: "project", project }, status: "open", electorate: ["player"], approvalRate: 51, required: 1,
      ballots: [], reserved: 0, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      organisationRevision: 0, policyRevision: 0 }];
    const props = { initialData: data, onSignOut: vi.fn(), onSessionExpired: vi.fn() };
    const { rerender } = render(<Workspace {...props} />);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Workspace" })).getByRole("button", { name: "Approvals" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit draft" }, { timeout: 10_000 }));
    expect((await screen.findByRole("textbox", { name: "Project name" }, { timeout: 10_000 }) as HTMLInputElement).value).toBe("Original draft");
    realtime.connection = "offline";
    rerender(<Workspace {...props} />);
    expect(screen.queryByRole("textbox", { name: "Project name" })).toBeNull();
    realtime.connection = "online";
    rerender(<Workspace {...props} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Ownership" }), { target: { value: ownership } });
    fireEvent.click(screen.getByRole("button", { name: ownership === "shared" ? "Preview Office chair" : "Preview Drum floor lamp" }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    if (ownership === "personal") fireEvent.click(screen.getByRole("button", { name: "Buy and add to draft" }));
    const command = realtime.send.mock.calls.map(([sent]) => sent).find((sent) =>
      sent.type === "project.edit" || sent.type === "player_asset.purchase_place");
    expect(command).toMatchObject({ type: ownership === "shared" ? "project.edit" : "player_asset.purchase_place" });
    expect(command).not.toHaveProperty("proposalId");
    expect(command).not.toHaveProperty("draftId");
    if (!command || !("requestId" in command)) throw new Error("Missing furnishing command");
    act(() => realtime.handler?.({ type: "project.preview", requestId: command.requestId, project: { ...project, id: "new-draft" } }));
    expect((screen.getByRole("textbox", { name: "Project name" }) as HTMLInputElement).value).toBe("");
  });

  it.each([0, 51])("adds personal purchases to a shared-room draft with an approval rate of %s", async (approvalRate) => {
    const data = workspace();
    data.economy.inventory = [];
    delete data.layouts[0]!.rooms[0]!.ownerUserId;
    data.layouts[0]!.rooms[0]!.access = { mode: "open", assignedPersonIds: [], knockable: false };
    data.layouts[0]!.rooms[0]!.build = { mode: "open", assignedPersonIds: [] };
    data.publicEconomy.approvalRates.building = approvalRate;
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview Office chair" }, { timeout: 10_000 }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    const dialog = screen.getByRole("dialog", { name: "Place Office chair" });
    expect(dialog.textContent).toContain(approvalRate ? "Adds to a draft for approval." : "Adds to your draft.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Buy and add to draft" }));
    const command = realtime.send.mock.calls.map(([sent]) => sent).find((sent) => sent.type === "player_asset.purchase_place")!;
    const project: BuildProject = { id: "draft", fundId: "workspace", floorId: "floor", baseRevision: 1,
      baseLayout: data.layouts[0]!, layout: data.layouts[0]!, edits: 1,
      quote: { assetChanges: [], cost: 0, refund: 0, refunds: [], structural: false, destructive: false,
        requiresApproval: approvalRate > 0, purchases: [], removedKeys: [], inventoryIds: [] } };
    act(() => {
      realtime.handler?.({ type: "project.preview", requestId: command.requestId, project });
      realtime.handler?.({ type: "economy.updated", requestId: command.requestId, economy: { ...data.economy, coinBalance: 180 } });
    });
    expect(screen.queryByRole("dialog", { name: "Place Office chair" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: approvalRate ? "Propose project" : "Apply changes" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "project.submit", draftId: project.id }));
  });

  it.each(["floor", "panel", "connection"] as const)("clears a purchase preview when its %s changes", async (context) => {
    const data = workspace();
    data.economy.inventory = [];
    data.floors.push({ ...data.floors[0]!, id: "upstairs", name: "Upstairs", level: 2 });
    data.layouts.push({ ...data.layouts[0]!, floorId: "upstairs", rooms: [], objects: [] });
    const props = { initialData: data, onSignOut: vi.fn(), onSessionExpired: vi.fn() };
    const { rerender } = render(<Workspace {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview Office chair" }, { timeout: 10_000 }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    expect(screen.getByRole("dialog", { name: "Place Office chair" })).toBeTruthy();
    if (context === "floor") act(() => realtime.handler?.({ type: "session.ready", userId: "player", floorId: "upstairs" }));
    else if (context === "panel") fireEvent.click(screen.getByRole("button", { name: "Close build tools" }));
    else { realtime.connection = "offline"; rerender(<Workspace {...props} />); }
    expect(screen.queryByRole("dialog", { name: "Place Office chair" })).toBeNull();
    expect(screen.getByTestId("world").getAttribute("data-tool")).toBe("");
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "player_asset.purchase_place" }));
  });

  it.each([false, true])("copies shared furniture with its design and uses stored copies: %s", async (useStored) => {
    const data = workspace();
    data.members[0]!.role = "owner";
    data.layouts[0]!.objects = [{ id: "shared-chair", floorId: "floor", assetId: "chair-office", x: 32, y: 32, variantId: "blue", rotation: 90 }];
    if (useStored) data.publicEconomy.inventory = [{ id: "stored-chair", assetId: "chair-office", fundId: "workspace", paid: 70 }];
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.change(await screen.findByRole("combobox", { name: "Ownership" }, { timeout: 5000 }), { target: { value: "shared" } });
    fireEvent.click(screen.getByRole("button", { name: "Select shared-chair" }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy" }));

    const world = screen.getByTestId("world");
    expect(world.getAttribute("data-selected")).toBeNull();
    expect(world.getAttribute("data-tool")).toBe("asset");
    expect(world.getAttribute("data-asset")).toBe("chair-office");
    expect(world.getAttribute("data-variant")).toBe("blue");
    expect(world.getAttribute("data-rotation")).toBe("90");
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "project.edit", edit: expect.objectContaining({
      tool: useStored ? "public_asset" : "asset", ...(useStored ? { publicAssetId: "stored-chair" } : { assetId: "chair-office" }), variantId: "blue", rotation: 90,
    }) }));
  });

  it("copies a placed personal asset using an unused inventory item", async () => {
    const data = workspace();
    data.economy.inventory = [
      { ...data.economy.inventory[0]!, id: "placed-chair", placement: { objectId: "my-chair", floorId: "floor", placedAt: "2026-09-02" } },
      { ...data.economy.inventory[0]!, id: "unused-chair" },
    ];
    data.layouts[0]!.objects = [{ id: "my-chair", floorId: "floor", assetId: "chair-office", x: 32, y: 32, variantId: "blue", rotation: 90, ownerUserId: "player", ownedAssetId: "placed-chair" }];
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(screen.getByRole("button", { name: "Select my-chair" }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy" }));

    const world = screen.getByTestId("world");
    expect(world.getAttribute("data-tool")).toBe("asset");
    expect(world.getAttribute("data-variant")).toBe("blue");
    expect(world.getAttribute("data-rotation")).toBe("90");
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "player_asset.place", ownedAssetId: "unused-chair", variantId: "blue", rotation: 90,
    }));
  });

  it("offers Copy in the canvas menu for a shared asset", async () => {
    const data = workspace();
    data.members[0]!.role = "owner";
    data.layouts[0]!.objects = [{ id: "shared-chair", floorId: "floor", assetId: "chair-office", x: 32, y: 32, variantId: "blue", rotation: 90 }];
    render(<ContextMenuProvider><Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} /></ContextMenuProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.change(await screen.findByRole("combobox", { name: "Ownership" }, { timeout: 5000 }), { target: { value: "shared" } });
    fireEvent.click(screen.getByRole("button", { name: "Context shared-chair" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy" }));
    expect(screen.getByTestId("world").getAttribute("data-tool")).toBe("asset");
    expect(screen.getByTestId("world").getAttribute("data-variant")).toBe("blue");
  });

  it("donates coins from Build and returns to personal inventory", async () => {
    const data = workspace();
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Shared funds/ }, { timeout: 5000 }));
    await screen.findByRole("dialog", { name: "Transfer to Shared" }, { timeout: 5000 });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Amount" }), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "economy.donate" }));
    const confirmButton = await screen.findByRole("button", { name: "Transfer coins" });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    const commands = realtime.send.mock.calls.map(([command]) => command)
      .filter((command): command is Extract<ClientCommand, { type: "economy.donate" }> => command.type === "economy.donate");
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ amount: 25, fundId: "workspace" });
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);
    act(() => realtime.handler?.({ type: "economy.updated", requestId: commands[0]!.requestId,
      economy: { ...data.economy, coinBalance: data.economy.coinBalance - 25 } }));
    expect(screen.queryByRole("dialog", { name: "Transfer 25 coins to Shared?" })).toBeNull();
    expect(screen.getAllByText("225").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Close transfer to shared" }));
    expect(await screen.findByRole("complementary", { name: "Build" })).toBeTruthy();
  });

  it("shows placement explanations in the timed notification without sending a command", async () => {
    render(<Workspace initialData={workspace()} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview Office chair" }, { timeout: 5000 }));
    realtime.send.mockClear();
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: "Place outside room" }));
      expect(screen.getByText("Place it fully inside a room.").getAttribute("role")).toBe("status");
      expect(realtime.send).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(2_000));
      fireEvent.click(screen.getByRole("button", { name: "Place outside room" }));
      act(() => vi.advanceTimersByTime(2_000));
      expect(screen.getByText("Place it fully inside a room.")).toBeTruthy();
      act(() => vi.advanceTimersByTime(800));
      expect(screen.queryByText("Place it fully inside a room.")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
      expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "player_asset.place" }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps other players' furniture out of personal storage", async () => {
    const data = workspace();
    data.members[0]!.role = "admin";
    data.members[0]!.permissions = ["manage_members"];
    data.layouts[0]!.objects = [{ id: "someone-elses-chair", floorId: "floor", assetId: "chair-office", x: 32, y: 32, variantId: "white", rotation: 0, ownerUserId: "another-user" }];
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.change(await screen.findByRole("combobox", { name: "Ownership" }, { timeout: 5000 }), { target: { value: "shared" } });
    fireEvent.click(screen.getByRole("button", { name: "Select someone-elses-chair" }));
    expect(screen.getByTestId("world").getAttribute("data-selected")).toBe("someone-elses-chair");
    expect(screen.queryByRole("button", { name: "Store" })).toBeNull();
  }, 15_000);

  it("preserves a working draft when returning from a proposal preview", async () => {
    const data = workspace();
    const room = data.layouts[0]!.rooms[0]!;
    delete room.ownerUserId;
    room.access = { mode: "open", assignedPersonIds: [], knockable: false };
    room.build = { mode: "open", assignedPersonIds: [] };
    const project: BuildProject = { id: "working-draft", fundId: "workspace", floorId: "floor", baseRevision: 1, baseLayout: data.layouts[0]!, edits: 1,
      layout: { ...data.layouts[0]!, revision: 2, objects: [{ id: "draft-chair", floorId: "floor", assetId: "chair-office", x: 32, y: 32,
        variantId: "white", rotation: 0, ownedAssetId: "owned-chair", ownerUserId: "player" }] },
      quote: { assetChanges: [], cost: 0, refund: 0, refunds: [], structural: false, destructive: false, requiresApproval: true, purchases: [], removedKeys: [], inventoryIds: [] } };
    data.publicEconomy.proposals = [{ id: "proposal", title: "Team proposal", proposedBy: "teammate", fundId: "workspace", action: { kind: "project", project: { ...project, id: "another-project" } },
      status: "open", electorate: ["player", "teammate"], approvalRate: 51, required: 2, ballots: [{ userId: "teammate", approve: true }], reserved: 0,
      createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), organisationRevision: 0, policyRevision: 0 }];
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview Office chair" }, { timeout: 5000 }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    const edit = realtime.send.mock.calls.map(([command]) => command).find((command) => command.type === "project.edit")!;
    act(() => realtime.handler?.({ type: "project.preview", requestId: edit.requestId, project }));
    fireEvent.change(screen.getByRole("textbox", { name: "Project name" }), { target: { value: "My workspace" } });
    fireEvent.click(within(screen.getByRole("navigation", { name: "Workspace" })).getByRole("button", { name: "Approvals" }));
    fireEvent.click(await screen.findByRole("button", { name: "View layout" }, { timeout: 5000 }));
    expect(JSON.parse(screen.getByTestId("world").getAttribute("data-focus")!)).toMatchObject({
      floorId: "floor", bounds: { x: 32, y: 32 },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Back to proposals" }, { timeout: 5000 }));
    fireEvent.click(await screen.findByRole("button", { name: "Close approvals" }, { timeout: 5000 }));
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    expect(await screen.findByRole("button", { name: "Propose project" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Project name" }) as HTMLInputElement).value).toBe("My workspace");
    fireEvent.click(screen.getByRole("button", { name: "Propose project" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "project.submit", draftId: "working-draft", title: "My workspace" }));
  }, 15_000);

  it.each([
    { action: "Sell Office chair for 30 coins", title: "Sell Office chair?", confirm: "Sell item", command: "economy.sell_asset" },
    { action: "Donate", title: "Donate Office chair?", confirm: "Donate item", command: "economy.donate_asset" },
  ])("confirms $command in the game before sending it", async ({ action, title, confirm, command }) => {
    render(<Workspace initialData={workspace()} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    const trigger = await screen.findByRole("button", { name: action === "Donate" ? "Donate Office chair" : action }, { timeout: 5000 });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: title })).toBeTruthy();
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: command }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: title })).toBeNull();
    expect(screen.getByRole("complementary", { name: "Build" })).toBeTruthy();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole("dialog", { name: title })).getByRole("button", { name: "Cancel" }));
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: command }));
    fireEvent.click(trigger);
    const confirmButton = within(screen.getByRole("dialog", { name: title })).getByRole("button", { name: confirm });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    const commands = realtime.send.mock.calls.map(([sent]) => sent)
      .filter((sent): sent is Extract<ClientCommand, { type: "economy.sell_asset" | "economy.donate_asset" }> => sent.type === command);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ type: command, ownedAssetId: "owned-chair" });
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);
    const economy = createTestEconomy();
    economy.inventory = [];
    act(() => realtime.handler?.({ type: "economy.updated", requestId: commands[0]!.requestId, economy }));
    expect(screen.queryByRole("dialog", { name: title })).toBeNull();
  });

  it("focuses personal placements across floors without moving the player and replays repeated focus", async () => {
    const data = workspace();
    data.floors.push({ ...data.floors[0]!, id: "upstairs", name: "Upstairs", level: 2 });
    data.layouts.push({ ...data.layouts[0]!, floorId: "upstairs", rooms: [], objects: [
      { id: "placed-chair", floorId: "upstairs", assetId: "chair-office", x: 32, y: 32, variantId: "white", rotation: 0, ownerUserId: "player" },
    ] });
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview Office chair" }, { timeout: 5000 }));
    fireEvent.click(screen.getByRole("button", { name: "Placed items" }));
    const focus = screen.getByRole("button", { name: "Focus Office chair in Upstairs" });
    fireEvent.click(focus);
    const world = screen.getByTestId("world");
    expect(world.getAttribute("data-floor")).toBe("upstairs");
    expect(world.getAttribute("data-selected")).toBe("placed-chair");
    expect(screen.queryByRole("button", { name: "Place on canvas" })).toBeNull();
    const firstFocus = JSON.parse(world.getAttribute("data-focus")!);
    expect(firstFocus).toMatchObject({ floorId: "upstairs", objectId: "placed-chair" });
    fireEvent.click(focus);
    expect(JSON.parse(world.getAttribute("data-focus")!).requestId).not.toBe(firstFocus.requestId);
    fireEvent.keyDown(document, { key: "r" });
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "player_asset.move" }));
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "movement.set_destination" }));
  });

  it("can cancel storage and movement, then store the focused item", async () => {
    const data = workspace();
    data.layouts[0]!.objects = [{ id: "chair", floorId: "floor", assetId: "chair-office", x: 32, y: 32, variantId: "white", rotation: 0, ownerUserId: "player" }];
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Placed items" }, { timeout: 10_000 }));
    fireEvent.click(screen.getByRole("button", { name: "Focus Office chair in Room, Floor" }));
    fireEvent.keyDown(window, { key: "m" });
    expect(screen.getByRole("button", { name: "Cancel move" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Move" })).toBeTruthy();
    expect(screen.getByTestId("world").getAttribute("data-selected")).toBe("chair");
    expect(screen.getByRole("button", { name: "Store" }).getAttribute("aria-keyshortcuts")).toBe("D");
    fireEvent.keyDown(window, { key: "d" });
    expect(screen.getByRole("dialog", { name: "Store item?" })).toBeTruthy();
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "player_asset.remove" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Store item?" })).toBeNull();
    expect(screen.getByTestId("world").getAttribute("data-selected")).toBe("chair");
    fireEvent.click(screen.getByRole("button", { name: "Store" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Store item?" })).getByRole("button", { name: "Store" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "player_asset.remove", objectId: "chair", baseRevision: 1 }));
    expect(screen.getByTestId("world").getAttribute("data-selected")).toBeNull();
  });

  it("exits placement and deselects without sending an edit", async () => {
    const data = workspace();
    data.layouts[0]!.objects = [{ id: "chair", floorId: "floor", assetId: "chair-office", x: 32, y: 32, variantId: "white", rotation: 0, ownerUserId: "player" }];
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview Office chair" }, { timeout: 10000 }));
    expect(screen.getByTestId("world").getAttribute("data-tool")).toBe("asset");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByTestId("world").getAttribute("data-tool")).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Select chair" }));
    expect(screen.getByTestId("world").getAttribute("data-selected")).toBe("chair");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByTestId("world").getAttribute("data-selected")).toBeNull();
    expect(screen.getByRole("complementary", { name: "Build" })).toBeTruthy();
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "player_asset.place" }));
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "player_asset.remove" }));
  });

  it("cancels erase and requires confirmation before removing an item", async () => {
    const data = workspace();
    data.economy.dailyReward.claimable = false;
    data.members[0]!.role = "admin";
    data.members[0]!.permissions = ["manage_members"];
    data.layouts[0]!.objects = [{ id: "shared-chair", floorId: "floor", assetId: "chair-office", x: 32, y: 32, variantId: "white", rotation: 0 }];
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.change(await screen.findByRole("combobox", { name: "Ownership" }, { timeout: 10_000 }), { target: { value: "shared" } });
    fireEvent.click(screen.getByRole("button", { name: "Structure" }));
    fireEvent.click(await screen.findByRole("button", { name: "Erase" }, { timeout: 10_000 }));
    expect(screen.getByTestId("world").getAttribute("data-tool")).toBe("erase");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByTestId("world").getAttribute("data-tool")).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Erase" }));
    fireEvent.click(screen.getByRole("button", { name: "Erase" }));
    expect(screen.getByTestId("world").getAttribute("data-tool")).toBe("");
    expect(screen.getByRole("complementary", { name: "Build" })).toBeTruthy();
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "project.edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Erase" }));
    fireEvent.click(screen.getByRole("button", { name: "Erase shared-chair" }));
    expect(screen.getByRole("dialog", { name: "Remove item?" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Remove item?" })).getByRole("button", { name: "Cancel" }));
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "project.edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Erase shared-chair" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Remove item?" })).getByRole("button", { name: "Remove" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "project.edit", edit: { tool: "item.remove", item: { type: "asset", id: "shared-chair" } } }));
  });

  it("opens Build for a non-builder and sends owned placement commands", async () => {
    render(<Workspace initialData={workspace()} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview Office chair" }, { timeout: 5000 }));
    const blueDesign = screen.getByRole("radio", { name: "Blue" });
    fireEvent.click(blueDesign);
    fireEvent.keyDown(blueDesign, { key: "r" });
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));

    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "player_asset.place",
      baseRevision: 1,
      ownedAssetId: "owned-chair",
      position: { x: 32, y: 32 },
      variantId: "blue",
      rotation: 90,
    }));
    expect(realtime.send.mock.calls.filter(([command]) => command.type === "player_asset.place")).toHaveLength(1);
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "layout.apply" }));
  });

  it("sends daily claims and catalog purchases through the authoritative economy API", async () => {
    render(<Workspace initialData={workspace()} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Daily bonus" }));
    fireEvent.click(await screen.findByRole("button", { name: "Claim 50 coins" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "economy.claim_daily" }));
    expect(screen.queryByRole("dialog", { name: "Daily bonus" })).toBeNull();

    const claim = realtime.send.mock.calls.map(([command]) => command).find((command) => command.type === "economy.claim_daily")!;
    const updatedEconomy = createTestEconomy();
    updatedEconomy.coinBalance = 300;
    updatedEconomy.dailyReward.claimable = false;
    updatedEconomy.recentTransactions = [{
      id: "daily",
      kind: "daily_bonus",
      amount: 50,
      balanceAfter: 300,
      createdAt: "2026-09-03T12:00:00.000Z",
    }];
    act(() => realtime.handler?.({
      type: "economy.updated",
      requestId: claim.requestId,
      economy: updatedEconomy,
      transaction: updatedEconomy.recentTransactions[0]!,
    }));
    expect(screen.getByText("Daily bonus: +50 coins.")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Workspace" }).querySelector<HTMLElement>(".nav-rail-items")!).getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview Drum floor lamp" }, { timeout: 5000 }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "player_asset.purchase_place" }));
    fireEvent.click(screen.getByRole("button", { name: "Buy and place" }));

    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "player_asset.purchase_place",
      assetId: "light-floor",
    }));
  });

  it("keeps a pending placement until its own layout conflict arrives", async () => {
    render(<Workspace initialData={workspace()} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview Office chair" }, { timeout: 10000 }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    const placement = realtime.send.mock.calls
      .map(([command]) => command)
      .find((command) => command.type === "player_asset.place")!;

    act(() => realtime.handler?.({ type: "layout.conflict", requestId: "another-request", revision: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    expect(realtime.send.mock.calls.filter(([command]) => command.type === "player_asset.place")).toHaveLength(1);

    act(() => realtime.handler?.({ type: "layout.conflict", requestId: placement.requestId, revision: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    expect(realtime.send.mock.calls.filter(([command]) => command.type === "player_asset.place")).toHaveLength(2);
  });

  it("stops placing an inventory instance that was placed in another session", async () => {
    render(<Workspace initialData={workspace()} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview Office chair" }, { timeout: 10000 }));
    expect(screen.getByRole("button", { name: "Place on canvas" })).toBeTruthy();

    const economy = createTestEconomy();
    economy.inventory = [{
      id: "owned-chair",
      assetId: "chair-office",
      purchasePrice: 90, acquiredAt: "2026-09-01T12:00:00.000Z",
      placement: {
        objectId: "placed-chair",
        floorId: "floor",
        placedAt: "2026-09-03T12:00:00.000Z",
      },
    }];
    act(() => realtime.handler?.({ type: "economy.updated", economy }));

    expect(screen.queryByRole("button", { name: "Place on canvas" })).toBeNull();
  });
});

function workspace(): BootstrapData {
  const economy = createTestEconomy();
  economy.inventory = [{
    id: "owned-chair",
    assetId: "chair-office",
    purchasePrice: 90, acquiredAt: "2026-09-01T12:00:00.000Z",
  }];
  return {
    currentUserId: "player",
    corporateIdentity: createTestCorporateIdentity(),
    organisation: createOrganisation(),
    publicEconomy: createPublicEconomy(),
    team: { id: "team", name: "Team", slug: "team", accent: "#000000" },
    office: { id: "office", teamId: "team", name: "Office" },
    floors: [{ id: "floor", officeId: "office", name: "Floor", level: 1, width: 256, height: 256, spawn: { x: 200, y: 200 }, background: "#ffffff" }],
    members: [{
      id: "player",
      name: "Player",
      initials: "PL", character: { ...DEFAULT_CHARACTER_APPEARANCE },
      email: "player@example.com",
      title: "",
      role: "member",
      permissions: [],
      color: "#123456",
      availability: "available",
      online: true,
      floorId: "floor",
      position: { x: 200, y: 200 },
    }],
    layouts: [{
      floorId: "floor",
      revision: 1,
      walls: [],
      openings: [],
      tiles: [],
      objects: [],
      rooms: [{
        id: "room", ownerUserId: "player",
        floorId: "floor",
        name: "Room",
        color: "#ffffff",
        capacity: 4,
        bounds: { x: 0, y: 0, width: 128, height: 128 },
        footprint: [{ x: 0, y: 0, width: 128, height: 128 }],
        boundary: [],
        doorIds: [],
        windowIds: [],
        privateEligible: true,
        access: { mode: "assigned", assignedPersonIds: ["player"], knockable: false },
        build: { mode: "assigned", assignedPersonIds: ["player"] },
      }],
    }],
    miniGames: [],
    scores: [],
    gameStatistics: [],
    economy,
    gameSettings: createTestGameSettings(),
    kidnapping: createTestKidnappingConfiguration(),
    invitations: [],
    meetings: [],
    conversations: [{ id: "team-chat", name: "Team", type: "team", unread: 0 }],
    messages: [],
  };
}

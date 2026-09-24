import { createTestData } from "../testing/workspace-data.js";
import { describe, expect, it } from "vitest";
import { detectLayoutRooms, getDefaultAssetVariantId, getPlayerAssetRoomError, requireAssetDefinition, roomAccessAllows, roomBuildAllows, type ClientCommand, type GameSettings, type OrganisationEdit, type ServerEvent } from "@workhard/shared";
import { WorkspaceStore } from "../store.js";
import { WorldRuntime } from "../world/world-runtime.js";
import { clientCommandSchema } from "../protocol.js";

function fixture() {
  const store = new WorkspaceStore(createTestData());
  store.updateFloorSpawn("floor-studio", { x: -64, y: -64 });
  const change = (edit: OrganisationEdit) => store.editOrganisation("user-maya", store.getOrganisation().revision, edit, true);
  change({ type: "unit.create", name: "Engineering", kind: "department", parentId: null });
  const unitId = store.getOrganisation().units.at(-1)!.id;
  change({ type: "unit.create", name: "Web", kind: "team", parentId: unitId });
  const childId = store.getOrganisation().units.at(-1)!.id;
  change({ type: "member.move", userId: "user-jonas", unitId, rank: "lead" });
  change({ type: "member.move", userId: "user-priya", unitId: childId, rank: "member" });
  const room = store.getRoom("room-product")!;
  store.updateRoomSettings(room.id, { name: room.name, color: room.color, organisationUnitId: unitId,
    access: { mode: "open", assignedPersonIds: [], knockable: false },
    build: { mode: "assigned", assignedPersonIds: [], unitGrants: [{ unitId, rank: "leads", descendants: true }] } });
  return { store, unitId, childId, room: store.getRoom(room.id)!, change };
}

describe("independent room permissions", () => {
  it("keeps an open room accessible while allowing only its lead to build", () => {
    const { store, room } = fixture();
    for (const id of ["user-maya", "user-jonas", "user-priya"]) expect(roomAccessAllows(room, id, store.getGameSettings(), store.getOrganisation())).toBe(true);
    expect(roomBuildAllows(room, "user-jonas", store.getGameSettings(), store.getOrganisation())).toBe(true);
    expect(roomBuildAllows(room, "user-priya", store.getGameSettings(), store.getOrganisation())).toBe(false);
    expect(roomBuildAllows(room, "user-maya", store.getGameSettings(), store.getOrganisation())).toBe(false);
  });

  it("resolves descendants, CEOs, individuals and entry restrictions independently", () => {
    const { store, room, unitId } = fixture();
    room.build = { mode: "assigned", assignedPersonIds: [], unitGrants: [{ unitId, rank: "members", descendants: false }] };
    const allows = (id: string) => roomBuildAllows(room, id, store.getGameSettings(), store.getOrganisation());
    expect(allows("user-priya")).toBe(false);
    room.build.unitGrants![0]!.descendants = true;
    expect(allows("user-priya")).toBe(true);
    room.build.ceos = true;
    expect(allows("user-maya")).toBe(true);
    room.access = { mode: "assigned", assignedPersonIds: ["user-jonas"], knockable: true };
    expect(allows("user-priya")).toBe(false);
    expect(allows("user-maya")).toBe(false);
    expect(allows("user-jonas")).toBe(true);
  });

  it("applies global defaults without overriding explicit room choices", () => {
    const { store, room } = fixture();
    const defaults: GameSettings = { roomAccess: { mode: "assigned", assignedPersonIds: ["user-priya"] }, roomBuild: { mode: "none", assignedPersonIds: [] } };
    for (const layout of store.getLayouts()) {
      for (const room of layout.rooms) room.access = { mode: "open", assignedPersonIds: [], knockable: false };
    }
    store.updateGameSettings(defaults);
    expect(roomBuildAllows(room, "user-jonas", defaults, store.getOrganisation())).toBe(true);
    room.build = { mode: "default", assignedPersonIds: [] };
    expect(roomBuildAllows(room, "user-jonas", defaults, store.getOrganisation())).toBe(false);
    room.access.mode = "default";
    expect(roomAccessAllows(room, "user-jonas", defaults, store.getOrganisation())).toBe(false);
    expect(roomAccessAllows(room, "user-priya", defaults, store.getOrganisation())).toBe(true);
  });

  it("preserves organisational grants through room detection and persistence", () => {
    const { store, room } = fixture();
    const detected = detectLayoutRooms(store.getLayout(room.floorId)!, store.getFloor(room.floorId)!);
    expect(detected.rooms.find((candidate) => candidate.id === room.id)).toMatchObject({ access: room.access, build: room.build, organisationUnitId: room.organisationUnitId });
    const next = new WorkspaceStore(createTestData());
    next.restoreMutableState(store.exportMutableState());
    expect(next.getOrganisation()).toEqual(store.getOrganisation());
    expect(next.getRoom(room.id)).toEqual(room);
  });

  it("blocks deletion of units referenced by rooms or defaults", () => {
    const { store, childId, change } = fixture();
    change({ type: "member.move", userId: "user-priya", unitId: null, rank: "member" });
    store.updateGameSettings({ roomAccess: { mode: "open", assignedPersonIds: [] }, roomBuild: { mode: "assigned", assignedPersonIds: [], unitGrants: [{ unitId: childId, rank: "leads", descendants: false }] } });
    expect(() => change({ type: "unit.delete", unitId: childId })).toThrow("ORGANISATION_UNIT_IN_USE");
  });

  it("checks the full asset footprint and never treats office build as a room grant", () => {
    const { store, room } = fixture();
    const object = { id: "test", floorId: room.floorId, assetId: "chair-office", variantId: getDefaultAssetVariantId(requireAssetDefinition("chair-office")), rotation: 0 as const, x: room.bounds.x + 32, y: room.bounds.y + 32 };
    expect(getPlayerAssetRoomError(store.getLayout(room.floorId)!, object, "user-maya", store.getGameSettings(), store.getOrganisation(), true)).toBe("ASSET_ROOM_FORBIDDEN");
    expect(getPlayerAssetRoomError(store.getLayout(room.floorId)!, object, "user-jonas", store.getGameSettings(), store.getOrganisation())).toBeUndefined();
  });
});

describe("permission command enforcement", () => {
  it("limits room build votes to builders and applies an owner's opted-in furnishing directly", () => {
    const { store, room } = fixture();
    store.updateRoomSettings(room.id, { ...room, build: { mode: "assigned", assignedPersonIds: ["user-jonas", "user-priya"] } });
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];
    const jonas = runtime.connect("user-jonas", room.floorId, (event) => events.push(event));
    const maya = runtime.connect("user-maya", room.floorId, (event) => events.push(event));
    const priya = runtime.connect("user-priya", room.floorId, (event) => events.push(event));
    const edit = (requestId: string, x: number) => {
      runtime.handleCommand(jonas, { type: "project.edit", requestId, fundId: "workspace", baseRevision: store.getLayout(room.floorId)!.revision,
        edit: { tool: "asset", assetId: "plant-floor", position: { x, y: 800 }, variantId: getDefaultAssetVariantId(requireAssetDefinition("plant-floor")), rotation: 0 } });
      const preview = events.findLast((event) => event.type === "project.preview" && event.requestId === requestId);
      if (preview?.type !== "project.preview") throw new Error(JSON.stringify(events.findLast((event) => event.type === "command.error")));
      return preview.project.id;
    };
    try {
      const first = edit("preview-vote", 400);
      runtime.handleCommand(jonas, { type: "project.submit", requestId: "submit-vote", draftId: first, title: "Room plant" });
      const proposal = store.getPublicEconomy().proposals[0]!;
      expect(proposal.electorate).toEqual(["user-jonas", "user-priya"]);
      expect(proposal.status).toBe("open");
      runtime.handleCommand(maya, { type: "public_economy.vote", requestId: "outside-vote", proposalId: proposal.id, approve: true });
      expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId: "outside-vote", code: "PROPOSAL_VOTE_FORBIDDEN" }));
      runtime.handleCommand(priya, { type: "public_economy.vote", requestId: "builder-vote", proposalId: proposal.id, approve: true });
      expect(store.publicEconomy.proposal(proposal.id).status).toBe("approved");

      store.updateRoomSettings(room.id, { ...room, ownerUserId: "user-jonas", ownerBuildApproval: "direct" });
      runtime.handleCommand(jonas, { type: "public_economy.execute", requestId: "stale-vote", proposalId: proposal.id });
      expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId: "stale-vote", code: "PROJECT_STALE" }));
      expect(store.publicEconomy.proposal(proposal.id).status).toBe("cancelled");
      store.donateMoney("user-maya", "workspace", 100, "room-build-fund");
      const second = edit("preview-direct", 448);
      runtime.handleCommand(jonas, { type: "project.submit", requestId: "submit-direct", draftId: second, title: "Own room plant" });
      expect(events).not.toContainEqual(expect.objectContaining({ type: "command.error", requestId: "submit-direct" }));
      expect(store.getPublicEconomy().proposals.at(-1)).toMatchObject({ status: "applied", approvalRate: 0, required: 0 });
      expect(store.getLayout(room.floorId)!.objects.some((object) => object.x === 448 && object.y === 800 && object.assetId === "plant-floor")).toBe(true);
    } finally { runtime.stop(); }
  });

  it("requires owner access for direct room building", () => {
    const { store, room } = fixture();
    expect(() => store.updateRoomSettings(room.id, { ...room, ownerUserId: "user-jonas", ownerBuildApproval: "direct",
      access: { mode: "none", assignedPersonIds: [], knockable: false } })).toThrow("PERSONAL_AREA_INVALID");
  });

  it("requires approval for room and global changes even for a lead", () => {
    const { store, room, unitId } = fixture();
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];
    const peer = runtime.connect("user-jonas", room.floorId, (event) => events.push(event));
    const send = (command: ClientCommand) => runtime.handleCommand(peer, clientCommandSchema.parse(command) as ClientCommand);
    try {
      send({ type: "room.update_settings", requestId: "save", baseRevision: store.getLayout(room.floorId)!.revision, roomId: room.id,
        settings: { name: "Team room", color: room.color, access: room.access, build: { mode: "none", assignedPersonIds: [] }, organisationUnitId: unitId } });
      expect(store.getRoom(room.id)?.name).toBe(room.name);
      expect(events.at(-1)).toMatchObject({ type: "command.error", code: "PROJECT_APPROVAL_REQUIRED" });
      send({ type: "room.update_settings", requestId: "steal", baseRevision: store.getLayout(room.floorId)!.revision, roomId: room.id,
        settings: { name: room.name, color: room.color, access: room.access } });
      expect(events.at(-1)).toMatchObject({ type: "command.error", code: "PROJECT_APPROVAL_REQUIRED" });
      send({ type: "room.update_settings", requestId: "other", baseRevision: store.getLayout(room.floorId)!.revision, roomId: "room-focus",
        settings: { name: "Taken", color: room.color, access: room.access } });
      expect(events.at(-1)).toMatchObject({ type: "command.error", code: "PROJECT_APPROVAL_REQUIRED" });
      send({ type: "game.settings_update", requestId: "defaults", settings: store.getGameSettings() });
      expect(events.at(-1)).toMatchObject({ type: "command.error", code: "PROJECT_APPROVAL_REQUIRED" });
    } finally { runtime.stop(); }
  });

  it("revokes entry immediately after an organisation move and keeps application roles independent", () => {
    const { store, unitId, childId, room } = fixture();
    store.updateRoomSettings(room.id, { name: room.name, color: room.color, build: room.build!, organisationUnitId: unitId,
      access: { mode: "assigned", assignedPersonIds: [], knockable: false, unitGrants: [{ unitId, rank: "members", descendants: true }] } });
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];
    const peer = runtime.connect("user-maya", room.floorId, (event) => events.push(event));
    runtime.handleCommand(peer, { type: "room.inspect_access", requestId: "inspect", userId: "user-priya" });
    const status = () => events.findLast((event) => event.type === "room.accessibility")?.accessibility.floors.flatMap((floor) => floor.rooms).find((candidate) => candidate.roomId === room.id)?.status;
    try {
      expect(status()).toBe("accessible");
      runtime.handleCommand(peer, { type: "public_economy.propose", requestId: "move", title: "Move member", action: { kind: "organisation", baseRevision: store.getOrganisation().revision, edit: { type: "member.move", userId: "user-priya", unitId: null, rank: "member" } } });
      const proposal = store.getPublicEconomy().proposals[0]!;
      for (const userId of proposal.electorate.filter((id) => id !== "user-maya").slice(0, proposal.required - 1)) {
        const voter = runtime.connect(userId, room.floorId, () => undefined);
        runtime.handleCommand(voter, { type: "public_economy.vote", requestId: crypto.randomUUID(), proposalId: proposal.id, approve: true });
      }
      runtime.handleCommand(peer, { type: "public_economy.execute", requestId: "apply", proposalId: proposal.id });
      expect(status()).toBe("restricted");
      store.updateMemberAccess("user-priya", "admin");
      expect(store.getOrganisation().assignments.some((assignment) => assignment.userId === "user-priya")).toBe(false);
      expect(store.getOrganisation().units.some((unit) => unit.id === childId)).toBe(true);
    } finally { runtime.stop(); }
  });
});

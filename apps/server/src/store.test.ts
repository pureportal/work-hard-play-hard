import { createTestData } from "./testing/workspace-data.js";
import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "./store.js";

describe("WorkspaceStore layout integrity", () => {
  it("does not revive superseded invitations when an overlapping delivery fails", () => {
    const store = new WorkspaceStore(createTestData());
    const original = store.issueInvitation("new@example.com", "admin");
    const first = store.issueInvitation("new@example.com", "member");
    const second = store.issueInvitation("new@example.com", "guest");
    store.rollbackInvitationIssue(first.invitation.id, first.supersededInvitationIds);
    expect(store.getInvitation(first.invitation.id)).toBeUndefined();
    expect(store.getInvitation(original.invitation.id)?.status).toBe("revoked");
    expect(store.getInvitation(second.invitation.id)?.status).toBe("pending");
    store.rollbackInvitationIssue(second.invitation.id, second.supersededInvitationIds);
    expect(store.getInvitation(first.invitation.id)).toBeUndefined();
    expect(store.getInvitation(original.invitation.id)?.status).toBe("revoked");
  });

  it("requires every layout replacement to advance exactly one revision", () => {
    const store = new WorkspaceStore(createTestData());
    const before = structuredClone(store.getLayout("floor-studio")!);

    expect(() => store.replaceLayout({ ...before, revision: before.revision + 2 })).toThrow("LAYOUT_REVISION_INVALID");
    expect(store.getLayout("floor-studio")).toEqual(before);
  });

  it("rejects asset designs that do not belong to their catalog asset", () => {
    const store = new WorkspaceStore(createTestData());
    const before = structuredClone(store.getLayout("floor-studio")!);
    before.revision += 1;
    before.objects[0]!.variantId = "unknown";

    expect(() => store.replaceLayout(before)).toThrow("LAYOUT_STATE_INVALID");
  });

  it("revises room access when a member is removed", () => {
    const store = new WorkspaceStore(createTestData());
    const studioRevision = store.getLayout("floor-studio")!.revision;
    const rooftopRevision = store.getLayout("floor-rooftop")!.revision;

    store.removeMember("user-priya");

    expect(store.getMember("user-priya")).toBeUndefined();
    expect(store.getRoom("room-focus")?.access.assignedPersonIds).toEqual(["user-maya"]);
    expect(store.getLayout("floor-studio")!.revision).toBe(studioRevision + 1);
    expect(store.getLayout("floor-rooftop")!.revision).toBe(rooftopRevision);
  });
});

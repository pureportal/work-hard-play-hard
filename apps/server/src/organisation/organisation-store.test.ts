import { createTestData } from "../testing/workspace-data.js";
import { describe, expect, it } from "vitest";
import { createOrganisation, type OrganisationEdit, type OrganisationState } from "@workhard/shared";
import { applyOrganisationEdit, validateOrganisation } from "./organisation-store.js";
import { WorkspaceStore } from "../store.js";
import { createInitialData } from "../initial-data.js";

const people = ["ceo", "lead", "member", "other", "unassigned", "second", "third"];
function organisation(): OrganisationState {
  return { ...createOrganisation("ceo"), units: [
    { id: "engineering", name: "Engineering", kind: "department", parentId: null },
    { id: "product", name: "Product", kind: "department", parentId: null },
    { id: "web", name: "Web", kind: "team", parentId: "engineering" },
  ], assignments: [
    { userId: "lead", unitId: "engineering", rank: "lead" },
    { userId: "member", unitId: "engineering", rank: "member" },
    { userId: "other", unitId: "product", rank: "lead" },
  ] };
}
const edit = (state: OrganisationState, actor: string, change: OrganisationEdit) => applyOrganisationEdit(state, people, actor, state.revision, change);

describe("organisation authority", () => {
  it("starts as an equal team without assigning CEO authority to the creator", () => {
    const store = new WorkspaceStore(createInitialData());
    store.addInitialMember({ id: "first", username: "first", email: "first@example.test" });
    store.addMember({ id: "next", username: "next", email: "next@example.test" });
    expect(store.getOrganisation().ceoIds).toEqual([]);
    expect(store.getPublicEconomy().funds[0]!.mode).toBe("equal");
    expect(store.getOrganisation().assignments).toEqual([]);
  });

  it("lets only CEOs assign unassigned people", () => {
    const state = organisation();
    const change: OrganisationEdit = { type: "member.move", userId: "unassigned", unitId: "engineering", rank: "member" };
    expect(() => edit(state, "lead", change)).toThrow("ORGANISATION_FORBIDDEN");
    expect(edit(state, "ceo", change).assignments).toContainEqual({ userId: "unassigned", unitId: "engineering", rank: "member" });
    expect(state.assignments).toHaveLength(3);
  });

  it("lets a lead create and rename subteams and appoint their leads", () => {
    let state = edit(organisation(), "lead", { type: "unit.create", name: "Mobile", kind: "team", parentId: "web" });
    const unit = state.units.at(-1)!;
    state = edit(state, "lead", { type: "unit.update", unitId: unit.id, name: "Apps", kind: "team" });
    state = edit(state, "lead", { type: "member.move", userId: "member", unitId: unit.id, rank: "lead" });
    expect(state.units.at(-1)?.name).toBe("Apps");
    expect(state.assignments.find((person) => person.userId === "member")).toEqual({ userId: "member", unitId: unit.id, rank: "lead" });
  });

  it.each<OrganisationEdit>([
    { type: "unit.create", name: "Root", kind: "department", parentId: null },
    { type: "unit.create", name: "Other", kind: "team", parentId: "product" },
    { type: "unit.move", unitId: "engineering", parentId: "web" },
    { type: "unit.move", unitId: "web", parentId: "product" },
    { type: "unit.update", unitId: "product", name: "Taken", kind: "team" },
    { type: "member.move", userId: "other", unitId: "engineering", rank: "member" },
    { type: "member.move", userId: "lead", unitId: "web", rank: "member" },
    { type: "member.move", userId: "member", unitId: "engineering", rank: "lead" },
    { type: "member.move", userId: "member", unitId: null, rank: "member" },
    { type: "ceo.promote", userId: "member" },
  ])("blocks changes beyond a lead's authority: %j", (change) => {
    expect(() => edit(organisation(), "lead", change)).toThrow("ORGANISATION_FORBIDDEN");
  });

  it("prevents cycles, stale writes, invalid references and deleting populated units", () => {
    const state = organisation();
    expect(() => edit(state, "ceo", { type: "unit.move", unitId: "engineering", parentId: "web" })).toThrow("ORGANISATION_CYCLE");
    expect(() => edit(state, "ceo", { type: "unit.delete", unitId: "engineering" })).toThrow("ORGANISATION_UNIT_NOT_EMPTY");
    expect(() => edit(state, "ceo", { type: "member.move", userId: "unassigned", unitId: "missing", rank: "member" })).toThrow("ORGANISATION_UNIT_NOT_FOUND");
    expect(() => applyOrganisationEdit(state, people, "ceo", 99, { type: "ceo.promote", userId: "second" })).toThrow("ORGANISATION_CONFLICT");
    expect(() => validateOrganisation({ ...state, ceoIds: [] }, people)).not.toThrow();
  });
});

describe("CEO removal votes", () => {
  function multipleCeos() {
    return edit(edit(organisation(), "ceo", { type: "ceo.promote", userId: "second" }), "ceo", { type: "ceo.promote", userId: "third" });
  }

  it("requires a recorded majority vote and moves a removed CEO to unassigned", () => {
    let state = multipleCeos();
    expect(state.ceoIds).toEqual(["ceo", "second", "third"]);
    expect(() => edit(state, "ceo", { type: "member.move", userId: "third", unitId: "web", rank: "member" })).toThrow("CEO_VOTE_REQUIRED");
    state = edit(state, "ceo", { type: "ceo.propose_removal", userId: "third" });
    const voteId = state.removalVotes[0]!.id;
    expect(state.ceoIds).toContain("third");
    expect(() => edit(state, "third", { type: "ceo.vote", voteId, approve: true })).toThrow("ORGANISATION_FORBIDDEN");
    state = edit(state, "ceo", { type: "ceo.vote", voteId, approve: true });
    expect(state.ceoIds).toContain("third");
    expect(() => edit(state, "ceo", { type: "ceo.vote", voteId, approve: true })).toThrow("CEO_ALREADY_VOTED");
    state = edit(state, "second", { type: "ceo.vote", voteId, approve: true });
    expect(state.ceoIds).toEqual(["ceo", "second"]);
    expect(state.assignments.some((person) => person.userId === "third")).toBe(false);
    expect(state.removalVotes[0]?.status).toBe("passed");
    expect(() => edit(state, "second", { type: "ceo.vote", voteId, approve: true })).toThrow("CEO_VOTE_CLOSED");
  });

  it("rejects votes that cannot pass and keeps a fixed electorate after promotion", () => {
    let state = edit(multipleCeos(), "ceo", { type: "ceo.propose_removal", userId: "third" });
    const voteId = state.removalVotes[0]!.id;
    state = edit(state, "ceo", { type: "ceo.promote", userId: "member" });
    expect(() => edit(state, "member", { type: "ceo.vote", voteId, approve: true })).toThrow("ORGANISATION_FORBIDDEN");
    state = edit(state, "second", { type: "ceo.vote", voteId, approve: false });
    expect(state.removalVotes[0]?.status).toBe("rejected");
    expect(state.ceoIds).toContain("third");
  });

  it("cancels other votes when their electorate changes and protects the final CEO", () => {
    let state = edit(multipleCeos(), "ceo", { type: "ceo.propose_removal", userId: "third" });
    state = edit(state, "third", { type: "ceo.propose_removal", userId: "ceo" });
    const voteId = state.removalVotes[0]!.id;
    state = edit(state, "ceo", { type: "ceo.vote", voteId, approve: true });
    state = edit(state, "second", { type: "ceo.vote", voteId, approve: true });
    expect(state.removalVotes[1]?.status).toBe("cancelled");
    const store = new WorkspaceStore(createTestData());
    expect(() => store.removeMember("user-maya")).toThrow("CEO_VOTE_REQUIRED");
    expect(() => edit(organisation(), "ceo", { type: "ceo.propose_removal", userId: "ceo" })).toThrow();
  });
});

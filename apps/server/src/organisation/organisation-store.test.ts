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

describe("organisation proposals", () => {
  it("starts as an equal team without assigning CEO authority to the creator", () => {
    const store = new WorkspaceStore(createInitialData());
    store.addInitialMember({ id: "first", username: "first", email: "first@example.test" });
    store.addMember({ id: "next", username: "next", email: "next@example.test" });
    expect(store.getOrganisation().ceoIds).toEqual([]);
    expect(store.getPublicEconomy().funds[0]!.mode).toBe("equal");
    expect(store.getOrganisation().assignments).toEqual([]);
  });

  it("prepares member assignments without changing the saved organisation", () => {
    const state = organisation();
    const change: OrganisationEdit = { type: "member.move", userId: "unassigned", unitId: "engineering", rank: "member" };
    expect(edit(state, "lead", change).assignments).toContainEqual({ userId: "unassigned", unitId: "engineering", rank: "member" });
    expect(state.assignments).toHaveLength(3);
  });

  it("prepares subteam creation, renaming and lead assignments", () => {
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
    { type: "unit.move", unitId: "web", parentId: "product" },
    { type: "unit.update", unitId: "product", name: "Taken", kind: "team" },
    { type: "member.move", userId: "other", unitId: "engineering", rank: "member" },
    { type: "member.move", userId: "lead", unitId: "web", rank: "member" },
    { type: "member.move", userId: "member", unitId: "engineering", rank: "lead" },
    { type: "member.move", userId: "member", unitId: null, rank: "member" },
    { type: "ceo.promote", userId: "member" },
  ])("allows members to propose changes throughout the organisation: %j", (change) => {
    expect(edit(organisation(), "member", change).revision).toBe(1);
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

describe("CEO removal", () => {
  it("prepares CEO removal while preserving the last CEO", () => {
    const state = edit(organisation(), "ceo", { type: "ceo.promote", userId: "second" });
    const next = edit(state, "member", { type: "ceo.remove", userId: "second" });
    expect(state.ceoIds).toEqual(["ceo", "second"]);
    expect(next.ceoIds).toEqual(["ceo"]);
    expect(() => edit(next, "member", { type: "ceo.remove", userId: "ceo" })).toThrow("CEO_LAST_REQUIRED");
  });
});

import { createOrganisation, type OrganisationState } from "@workhard/shared";

export function createTestOrganisation(firstUserId: string): OrganisationState {
  return {
    ...createOrganisation(firstUserId),
    ceoIds: [firstUserId, "user-noah", "user-sam"],
    units: [
      { id: "unit-product", name: "Product", kind: "department", parentId: null },
      { id: "unit-engineering", name: "Engineering", kind: "department", parentId: null },
      { id: "unit-design", name: "Design", kind: "team", parentId: "unit-product" },
      { id: "unit-research", name: "Research", kind: "team", parentId: "unit-design" },
      { id: "unit-platform", name: "Platform", kind: "team", parentId: "unit-engineering" },
      { id: "unit-web", name: "Web", kind: "team", parentId: "unit-platform" },
    ],
    assignments: [
      { userId: "user-leo", unitId: "unit-product", rank: "lead" },
      { userId: "user-amara", unitId: "unit-engineering", rank: "lead" },
      { userId: "user-priya", unitId: "unit-design", rank: "lead" },
      { userId: "user-aisha", unitId: "unit-research", rank: "member" },
      { userId: "user-elena", unitId: "unit-platform", rank: "lead" },
      { userId: "user-jonas", unitId: "unit-web", rank: "member" },
    ],
  };
}

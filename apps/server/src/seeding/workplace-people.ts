import {
  CHARACTER_FACES, CHARACTER_HAIRSTYLES, CHARACTER_OUTFITS, permissionsForMemberRole,
  type Availability, type Member, type MemberRole, type OrganisationState,
} from "@workhard/shared";

type Person = [username: string, name: string, title: string, role: MemberRole, unit: string | null,
  rank: "lead" | "member", upper: boolean, x: number, y: number, availability: Availability];

const people: Person[] = [
  ["rowan", "Rowan Ellis", "Managing Director", "owner", null, "lead", true, 400, 432, "available"],
  ["imani", "Imani Okafor", "Engineering Director", "admin", "engineering", "lead", true, 912, 432, "busy"],
  ["lucia", "Lucia Moretti", "Product Director", "member", "product", "lead", true, 1360, 464, "available"],
  ["soren", "Soren Lind", "Platform Lead", "member", "platform", "lead", false, 336, 304, "available"],
  ["mei", "Mei Tan", "Infrastructure Engineer", "member", "platform", "member", false, 544, 304, "busy"],
  ["dev", "Dev Shah", "Web Lead", "member", "web", "lead", false, 336, 464, "available"],
  ["rafael", "Rafael Costa", "Frontend Engineer", "member", "web", "member", false, 544, 448, "away"],
  ["yuki", "Yuki Mori", "Design Lead", "member", "design", "lead", false, 848, 304, "available"],
  ["ines", "Ines Duarte", "Product Designer", "member", "design", "member", false, 1072, 304, "busy"],
  ["ada", "Ada Mensah", "Research Lead", "member", "research", "lead", true, 848, 832, "dnd"],
  ["celia", "Celia Brooks", "User Researcher", "member", "research", "member", false, 848, 448, "available"],
  ["elise", "Elise Martin", "Operations Director", "admin", "operations", "lead", false, 896, 816, "available"],
  ["omar", "Omar Haddad", "Workplace Lead", "member", "workplace", "lead", false, 368, 944, "available"],
  ["nina", "Nina Petrov", "Customer Support Lead", "member", "support", "lead", false, 992, 592, "available"],
  ["felix", "Felix Weber", "Customer Support Specialist", "member", "support", "member", false, 1104, 848, "away"],
  ["tess", "Tess Morgan", "Workplace Consultant", "guest", "workplace", "member", false, 832, 944, "away"],
];

export function createWorkplacePeople(): { members: Member[]; organisation: OrganisationState } {
  const colors = ["#527b70", "#697fa7", "#ad7e71", "#8a79a4", "#a0834d", "#678d8e"];
  const members = people.map<Member>(([username, name, title, role, , , upper, x, y, availability], index) => {
    const outfit = CHARACTER_OUTFITS[index % CHARACTER_OUTFITS.length]!;
    return {
      id: `person-${username}`, name, initials: name.split(" ").map((part) => part[0]).join(""),
      email: `${username}@alder.example.test`, title, role, permissions: permissionsForMemberRole(role),
      color: colors[index % colors.length]!, availability, online: availability !== "away",
      floorId: upper ? "floor-retreat" : "floor-workplace", position: { x, y },
      character: { face: CHARACTER_FACES[index % CHARACTER_FACES.length]!,
        hairstyle: CHARACTER_HAIRSTYLES[index % CHARACTER_HAIRSTYLES.length]!, upperBody: outfit, lowerBody: outfit,
        shoes: outfit, headwear: index === 7 ? "beret" : "none" },
    };
  });
  const departments = [["engineering", "Engineering"], ["product", "Product"], ["operations", "Operations"]] as const;
  const teams = [["platform", "Platform", "engineering"], ["web", "Web", "engineering"],
    ["design", "Design", "product"], ["research", "Research", "product"],
    ["workplace", "Workplace", "operations"], ["support", "Customer Support", "operations"]] as const;
  return {
    members,
    organisation: {
      revision: 1, ceoIds: ["person-rowan"],
      units: [...departments.map(([id, name]) => ({ id: `unit-${id}`, name, kind: "department" as const, parentId: null })),
        ...teams.map(([id, name, parent]) => ({ id: `unit-${id}`, name, kind: "team" as const, parentId: `unit-${parent}` }))],
      assignments: people.flatMap(([username, , , , unit, rank]) => unit ? [{ userId: `person-${username}`, unitId: `unit-${unit}`, rank }] : []),
    },
  };
}

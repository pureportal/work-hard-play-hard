import { z } from "zod";

const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(60);
const kind = z.enum(["department", "team"]);
export const roomPermissionSchema = z.object({
  mode: z.enum(["default", "open", "assigned", "none"]),
  assignedPersonIds: z.array(id).max(500),
  unitGrants: z.array(z.object({ unitId: id, rank: z.enum(["members", "leads"]), descendants: z.boolean() }).strict()).max(500).optional(),
  ceos: z.boolean().optional(),
}).strict();

export const gameSettingsSchema = z.object({
  roomAccess: roomPermissionSchema.extend({ mode: z.enum(["open", "assigned", "none"]) }),
  roomBuild: roomPermissionSchema.extend({ mode: z.enum(["open", "assigned", "none"]) }),
}).strict();

export const organisationEditSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("unit.create"), name, kind, parentId: id.nullable() }).strict(),
  z.object({ type: z.literal("unit.update"), unitId: id, name, kind }).strict(),
  z.object({ type: z.literal("unit.move"), unitId: id, parentId: id.nullable() }).strict(),
  z.object({ type: z.literal("unit.delete"), unitId: id }).strict(),
  z.object({ type: z.literal("member.move"), userId: id, unitId: id.nullable(), rank: z.enum(["lead", "member"]) }).strict(),
  z.object({ type: z.literal("ceo.promote"), userId: id }).strict(),
  z.object({ type: z.literal("ceo.propose_removal"), userId: id }).strict(),
  z.object({ type: z.literal("ceo.vote"), voteId: id, approve: z.boolean() }).strict(),
]);

export const organisationStateSchema = z.object({
  revision: z.number().int().nonnegative(),
  ceoIds: z.array(id),
  units: z.array(z.object({ id, name, kind, parentId: id.nullable() }).strict()).max(500),
  assignments: z.array(z.object({ userId: id, unitId: id, rank: z.enum(["lead", "member"]) }).strict()),
  removalVotes: z.array(z.object({
    id, subjectId: id, proposedBy: id, electorate: z.array(id),
    ballots: z.array(z.object({ userId: id, approve: z.boolean() }).strict()),
    status: z.enum(["open", "passed", "rejected", "cancelled"]),
  }).strict()),
}).strict();

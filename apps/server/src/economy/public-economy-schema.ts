import { z } from "zod";
import { gameSettingsSchema, organisationEditSchema, roomSettingsSchema } from "../organisation/organisation-schema.js";

const id = z.string().min(1).max(100);
const money = z.number().int().min(0).max(2_000_000_000);
const mode = z.enum(["equal", "hierarchical"]);
export const publicActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fund.create"), unitId: id, mode }).strict(),
  z.object({ kind: z.literal("fund.transfer"), fromFundId: id, toFundId: id, amount: money.positive() }).strict(),
  z.object({ kind: z.literal("governance"), mode, ceoIds: z.array(id).max(500) }).strict(),
  z.object({ kind: z.literal("organisation"), baseRevision: z.number().int().nonnegative(), edit: organisationEditSchema }).strict(),
  z.object({ kind: z.literal("room.settings"), roomId: id, baseRevision: z.number().int().nonnegative(),
    settings: roomSettingsSchema }).strict(),
  z.object({ kind: z.literal("game.settings"), settings: gameSettingsSchema }).strict(),
  z.object({ kind: z.literal("kidnapping.settings"), settings: z.object({ enabled: z.boolean(),
    targetPolicy: z.object({ mode: z.enum(["allow_all", "allow_list", "block_list", "allow_none"]), userIds: z.array(id).max(100) }).strict(),
  }).strict() }).strict(),
  z.object({ kind: z.literal("asset.sell"), publicAssetId: id }).strict(),
]);

export function publicEconomyCommands(projectEdit: z.ZodType) {
  const requestId = z.string().min(1).max(80);
  const title = z.string().trim().min(1).max(80);
  return [
    z.object({ type: z.literal("economy.donate"), requestId, fundId: id, amount: money.positive() }).strict(),
    z.object({ type: z.literal("economy.sell_asset"), requestId, ownedAssetId: z.string().uuid() }).strict(),
    z.object({ type: z.literal("economy.donate_asset"), requestId, ownedAssetId: z.string().uuid(), fundId: id }).strict(),
    z.object({ type: z.literal("project.edit"), requestId, baseRevision: z.number().int().nonnegative(), fundId: id, draftId: z.string().uuid().optional(), edit: projectEdit }).strict(),
    z.object({ type: z.literal("project.submit"), requestId, draftId: z.string().uuid(), title }).strict(),
    z.object({ type: z.literal("public_economy.propose"), requestId, title, action: publicActionSchema }).strict(),
    z.object({ type: z.literal("public_economy.vote"), requestId, proposalId: z.string().uuid(), approve: z.boolean() }).strict(),
    z.object({ type: z.literal("public_economy.execute"), requestId, proposalId: z.string().uuid() }).strict(),
    z.object({ type: z.literal("public_economy.cancel"), requestId, proposalId: z.string().uuid() }).strict(),
  ] as const;
}

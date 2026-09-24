import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { APPROVAL_CASES, APPROVAL_UPGRADES } from "@workhard/shared";
import type { WorkspaceStore } from "../store.js";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), caseId: z.enum(APPROVAL_CASES.map((item) => item.id) as ["memo", "permit", "audit"]) }).strict(),
  z.object({ action: z.literal("collect") }).strict(),
  z.object({ action: z.literal("stamp") }).strict(),
  z.object({ action: z.literal("buy"), upgradeId: z.enum(APPROVAL_UPGRADES.map((item) => item.id) as ["stamp", "inbox", "clerk", "printer", "routing"]), expectedLevel: z.number().int().min(0).max(8) }).strict(),
]);

export function registerApprovalDeskRoutes(
  app: FastifyInstance,
  store: WorkspaceStore,
  authenticate: (request: FastifyRequest) => string | undefined,
  persist: () => Promise<void>,
): void {
  app.get("/v1/approval-desk", async (request, reply) => {
    const userId = authenticate(request);
    if (!userId) return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    return store.getApprovalDesk(userId);
  });

  app.post("/v1/approval-desk", async (request, reply) => {
    const userId = authenticate(request);
    if (!userId) return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    const parsed = actionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "APPROVAL_ACTION_INVALID", message: "Choose an action." });
    let result;
    try {
      const command = parsed.data;
      result = command.action === "start" ? { view: store.startApprovalCase(userId, command.caseId) }
        : command.action === "collect" ? store.collectApprovalCase(userId)
          : command.action === "stamp" ? { view: store.stampApprovalForm(userId) }
            : { view: store.buyApprovalUpgrade(userId, command.upgradeId, command.expectedLevel) };
    } catch (error) {
      const code = error instanceof Error ? error.message : "APPROVAL_ACTION_FAILED";
      const messages: Record<string, string> = {
        INSUFFICIENT_COINS: "You need more coins.",
        APPROVAL_CASE_NOT_READY: "This case is still processing.",
        APPROVAL_CASE_ACTIVE: "Collect your current case first.",
        APPROVAL_STAMP_WAIT: "Wait a moment before stamping again.",
        APPROVAL_UPGRADE_CHANGED: "Upgrade changed. Refresh progress and try again.",
        APPROVAL_UPGRADE_MAXED: "This upgrade is maxed.",
      };
      const message = messages[code] ?? "Action could not be completed.";
      return reply.code(code === "INSUFFICIENT_COINS" || code === "APPROVAL_CASE_ACTIVE" || code === "APPROVAL_CASE_NOT_READY" || code === "APPROVAL_STAMP_WAIT" ? 409 : 400)
        .send({ code, message });
    }
    await persist();
    return result;
  });
}

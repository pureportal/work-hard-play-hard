import type { FastifyInstance, FastifyRequest } from "fastify";
import type { GitHubAdminSettings } from "@workhard/shared";
import type { WorkspaceStore } from "../store.js";
import { githubAppSettingsSchema, resolveGitHubConfig, storeGitHubConfig } from "./github-config.js";
import type { GitHubAppSettingsRecord } from "./github-record.js";
import type { GitHubService } from "./github-service.js";

export function registerGitHubAdminRoutes(app: FastifyInstance, options: {
  store: WorkspaceStore; github: GitHubService; encryptionKey: Buffer | undefined;
  authenticate: (request: FastifyRequest) => string | undefined; persist: () => Promise<void>;
}): void {
  const view = (): GitHubAdminSettings => {
    const settings = options.store.getGitHubAppSettings();
    return {
      clientId: settings?.clientId ?? "", appSlug: settings?.appSlug ?? "", redirectUri: settings?.redirectUri ?? "",
      hasClientSecret: Boolean(settings?.encryptedClientSecret), encryptionReady: Boolean(options.encryptionKey),
      needsApply: Boolean(settings?.connectionsResetPending),
    };
  };
  let updating = false;
  let appliedSettings: GitHubAppSettingsRecord | null | undefined = options.store.getGitHubAppSettings();
  app.register(async (routes) => {
    routes.addHook("onRequest", async (request, reply) => {
      reply.header("cache-control", "no-store");
      const userId = options.authenticate(request);
      if (!userId) return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
      if (!options.store.canManageGlobalSettings(userId)) return reply.code(403).send({ code: "FORBIDDEN", message: "Server administrator access is required." });
    });
    routes.setErrorHandler((_error, request, reply) => {
      request.log.error({ code: "GITHUB_SETTINGS_FAILED" }, "GitHub settings could not be saved");
      return reply.code(500).send({ code: "GITHUB_SETTINGS_FAILED", message: "GitHub settings could not be saved. Try again." });
    });
    routes.get("/v1/admin/github", async () => view());
    routes.put("/v1/admin/github", { logLevel: "silent" }, async (request, reply) => {
      const parsed = githubAppSettingsSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ code: "GITHUB_SETTINGS_INVALID", message: parsed.error.issues[0]!.message });
      if (updating) return reply.code(409).send({ code: "SETTINGS_BUSY", message: "Settings are being saved. Try again." });
      const { clientId, clientSecret, appSlug, redirectUri } = parsed.data;
      if (clientId && !options.encryptionKey) {
        return reply.code(503).send({ code: "GITHUB_KEY_REQUIRED", message: "Set GITHUB_TOKEN_KEY on the server before saving GitHub settings." });
      }
      const previous = options.store.getGitHubAppSettings();
      if (clientId && !clientSecret && (clientId !== previous?.clientId || !previous.encryptedClientSecret)) {
        return reply.code(400).send({ code: "GITHUB_SECRET_REQUIRED", message: "Enter the client secret for this GitHub App." });
      }
      const settings: GitHubAppSettingsRecord = clientSecret
        ? storeGitHubConfig({ clientId, clientSecret, appSlug, redirectUri, encryptionKey: options.encryptionKey! })
        : { clientId, appSlug, redirectUri, encryptedClientSecret: clientId ? previous?.encryptedClientSecret ?? null : null, connectionsResetPending: false };
      updating = true;
      try {
        if (appliedSettings && appliedSettings.clientId === settings.clientId && appliedSettings.appSlug === settings.appSlug
          && appliedSettings.redirectUri === settings.redirectUri && appliedSettings.encryptedClientSecret === settings.encryptedClientSecret
          && !appliedSettings.connectionsResetPending) return view();
        const config = resolveGitHubConfig(settings, options.encryptionKey);
        options.store.updateGitHubAppSettings({ ...settings, connectionsResetPending: true });
        try { await options.persist(); }
        catch (error) { options.store.updateGitHubAppSettings(previous); throw error; }
        appliedSettings = undefined;
        try {
          await options.github.configure(config);
          options.store.updateGitHubAppSettings(settings);
          await options.persist();
          appliedSettings = settings;
        } catch {
          request.log.error({ code: "GITHUB_RESTART_FAILED" }, "GitHub configuration could not be applied");
          return reply.code(503).send({ code: "GITHUB_RESTART_FAILED", message: "Settings were saved, but GitHub could not finish applying them. Save again to retry." });
        }
        return view();
      } finally { updating = false; }
    });
  });
}

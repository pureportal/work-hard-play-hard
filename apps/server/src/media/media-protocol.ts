import { z } from "zod";

export const mediaSignalSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("description"), description: z.object({ type: z.enum(["offer", "answer"]), sdp: z.string().min(1).max(24_000) }).strict() }).strict(),
  z.object({ type: z.literal("candidate"), candidate: z.object({
    candidate: z.string().max(2048),
    sdpMid: z.string().max(32).nullable(),
    sdpMLineIndex: z.number().int().min(0).max(8).nullable(),
    usernameFragment: z.string().max(256).nullable().optional(),
  }).strict() }).strict(),
  z.object({ type: z.literal("restart") }).strict(),
]);

export const mediaIceServersSchema = z.array(z.object({
  urls: z.array(z.string().regex(/^turns?:[^\s]+$|^stuns?:[^\s]+$/)).min(1),
  username: z.string().optional(),
  credential: z.string().optional(),
}).strict().superRefine((server, context) => {
  if (server.urls.some((url) => /^turns?:/.test(url)) && (!server.username || !server.credential)) {
    context.addIssue({ code: "custom", message: "TURN servers require a username and credential." });
  }
})).max(8);

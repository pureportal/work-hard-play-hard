import { createApplication } from "./app.js";
import { createAuthenticationEmailDelivery } from "./auth/email-delivery.js";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";
const emailDelivery = createAuthenticationEmailDelivery();
const { app } = await createApplication({
  logger: true,
  ...(emailDelivery ? {
    deliverMagicLink: emailDelivery.deliverMagicLink,
    deliverInvitation: emailDelivery.deliverInvitation,
    deliverRegistrationLink: emailDelivery.deliverRegistrationLink,
    deliverPasswordReset: emailDelivery.deliverPasswordReset,
    deliverPasswordChanged: emailDelivery.deliverPasswordChanged,
  } : {}),
});

const close = async (): Promise<void> => {
  await app.close();
  process.exit(0);
};

process.once("SIGINT", () => {
  void close();
});
process.once("SIGTERM", () => {
  void close();
});

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

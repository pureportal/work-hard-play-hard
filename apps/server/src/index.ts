import { createApplication } from "./app.js";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";
const { app } = await createApplication({ logger: true });

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

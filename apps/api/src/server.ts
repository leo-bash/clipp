import { loadConfig } from "@shortfactory/config";
import { buildApp } from "./app.js";

const config = loadConfig();
const app = await buildApp(config);

const shutdown = async (signal: string): Promise<void> => {
  app.server.log.info({ signal }, "shutting down");
  await app.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.server.listen({ host: config.API_HOST, port: config.API_PORT });
  app.server.log.info({ port: config.API_PORT }, "api listening");
} catch (error) {
  app.server.log.error({ err: error }, "api failed to start");
  await app.close();
  process.exit(1);
}

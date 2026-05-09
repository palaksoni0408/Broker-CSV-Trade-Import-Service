import "dotenv/config";
import { buildApp } from "./app.js";

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
const HOST = process.env["HOST"] ?? "0.0.0.0";

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Swagger docs available at http://${HOST}:${PORT}/docs`);
  } catch (err) {
    app.log.error(err, "Failed to start server");
    process.exit(1);
  }
}

start();

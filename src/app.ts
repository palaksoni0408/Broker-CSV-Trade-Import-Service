import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { importRoute } from "./routes/import.route.js";

const MAX_FILE_SIZE_BYTES =
  parseInt(process.env["MAX_FILE_SIZE_MB"] ?? "10", 10) * 1024 * 1024;

/**
 * Builds and configures the Fastify application.
 *
 * Exported as a factory function (not a singleton) so tests can spin up
 * isolated instances without port conflicts.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env["LOG_LEVEL"] ?? "info",
    },
  });

  // ─── Plugins ────────────────────────────────────────────────────────────────

  await app.register(multipart, {
    limits: {
      fileSize: MAX_FILE_SIZE_BYTES,
      files: 1, // one file per request
    },
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Broker CSV Trade Import API",
        description:
          "Accepts broker CSV trade export files, auto-detects broker format, " +
          "normalizes trades to a unified schema, and returns structured JSON.",
        version: "1.0.0",
      },
      tags: [{ name: "Import", description: "Trade import endpoints" }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "full",
    },
  });

  // ─── Routes ─────────────────────────────────────────────────────────────────

  await app.register(importRoute);

  // Health check — useful for load balancers and monitoring
  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  return app;
}

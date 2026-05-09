import type { FastifyInstance } from "fastify";
import { ImportService } from "../services/import.service.js";

const importService = new ImportService();

/**
 * POST /import
 *
 * Accepts a CSV file via multipart/form-data (field name: "file").
 * Returns a structured JSON response with parsed trades and any skipped rows.
 *
 * Swagger docs are registered alongside the route for automatic API doc generation.
 */
export async function importRoute(app: FastifyInstance): Promise<void> {
  app.post(
    "/import",
    {
      schema: {
        tags: ["Import"],
        summary: "Import broker trade CSV",
        description:
          "Upload a broker CSV export. The broker format is auto-detected. " +
          "Invalid rows are skipped and reported in the errors array.",
        consumes: ["multipart/form-data"],
        response: {
          200: {
            description: "Import completed (may include skipped rows)",
            type: "object",
            properties: {
              broker: { type: "string", example: "zerodha" },
              summary: {
                type: "object",
                properties: {
                  total: { type: "number" },
                  valid: { type: "number" },
                  skipped: { type: "number" },
                },
              },
              trades: { type: "array", items: { type: "object", additionalProperties: true } },
              errors: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    row: { type: "number" },
                    reason: { type: "string" },
                  },
                },
              },
            },
          },
          400: {
            description: "Bad request — missing file, unsupported format, etc.",
            type: "object",
            properties: {
              error: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      // Retrieve the uploaded file from multipart form data
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({ error: "No file uploaded. Send a CSV via the 'file' field." });
      }

      const isCsvLike =
        data.mimetype.includes("csv") ||
        data.mimetype.includes("text") ||
        data.mimetype === "application/octet-stream";
      if (!isCsvLike) {
        return reply
          .status(400)
          .send({ error: `Unsupported file type: '${data.mimetype}'. Please upload a CSV file.` });
      }

      // Read the stream into a string — file sizes are small enough to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const csvText = Buffer.concat(chunks).toString("utf-8").trim();

      if (!csvText) {
        return reply.status(400).send({ error: "Uploaded file is empty." });
      }

      try {
        const result = await importService.importCsv(csvText);
        return reply.status(200).send(result);
      } catch (err) {
        // These are expected user-facing errors (unrecognized format, etc.)
        const message = err instanceof Error ? err.message : "Unexpected error during import.";
        request.log.warn({ err }, "Import failed");
        return reply.status(400).send({ error: message });
      }
    }
  );
}

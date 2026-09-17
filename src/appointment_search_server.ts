import { createServer } from "node:http";
import { z } from "zod";
import { InfraiError, InfraiHealthSearch } from "./infrai_health_search.js";
import { findPatientSafeNotices } from "./patient_safe_search.js";

const SearchBody = z.object({
  query: z.string().trim().min(3).max(500),
  channel: z.enum(["sms", "email", "portal"]),
  limit: z.number().int().min(1).max(10).default(5),
});
type SearchRequest = {
  query: string;
  channel: "sms" | "email" | "portal";
  limit: number;
};

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const search = new InfraiHealthSearch(apiKey, "appointment-operations");
const port = Number(process.env.PORT ?? 3000);

createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/search") {
    response.writeHead(404).end(JSON.stringify({ error: "Route not found" }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = SearchBody.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    ) as SearchRequest;
    const notices = await findPatientSafeNotices(search, input);
    response.writeHead(200).end(JSON.stringify({ notices }));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      response.writeHead(400).end(JSON.stringify({ error: "Invalid request body" }));
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status).end(JSON.stringify({ error: error.message, code: error.code }));
      return;
    }
    response.writeHead(500).end(JSON.stringify({ error: "Request failed" }));
  }
}).listen(port, () => console.log(`Appointment search listening on http://localhost:${port}`));

import type { ServerResponse } from "node:http";
import { getConfig } from "./config.ts";

type EventPayload = {
  type: string;
  data: unknown;
};

const clients = new Set<ServerResponse>();

export function addSseClient(response: ServerResponse): void {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Access-Control-Allow-Origin": getConfig().publicOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Device-Key, X-Request-Id",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  response.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  clients.add(response);
  response.on("close", () => clients.delete(response));
}

export function broadcast(type: string, data: unknown): void {
  const payload: EventPayload = { type, data };
  const frame = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    client.write(frame);
  }
}

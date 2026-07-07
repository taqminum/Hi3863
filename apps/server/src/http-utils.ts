import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getConfig } from "./config.ts";

export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function requestId(request: IncomingMessage): string {
  const header = request.headers["x-request-id"];
  return typeof header === "string" && header.trim() ? header : randomUUID();
}

export function sendJson(response: ServerResponse, status: number, data: unknown, id: string = randomUUID()): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": getConfig().publicOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Device-Key, X-Request-Id",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "X-Request-Id": id
  });
  response.end(JSON.stringify(data));
}

export function sendText(response: ServerResponse, status: number, contentType: string, data: string, id: string = randomUUID()): void {
  response.writeHead(status, {
    "Content-Type": `${contentType}; charset=utf-8`,
    "Access-Control-Allow-Origin": getConfig().publicOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Device-Key, X-Request-Id",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "X-Request-Id": id
  });
  response.end(data);
}

export async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

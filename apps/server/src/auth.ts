import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Role } from "./domain.ts";
import type { User } from "./types.ts";

const secret = process.env.JWT_SECRET ?? "dev-ws63-change-before-cloud-deploy";

export function hashPassword(password: string): string {
  return createHmac("sha256", secret).update(password).digest("hex");
}

export function verifyPassword(password: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashPassword(password));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function signToken(user: User): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      jti: randomUUID(),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12
    })
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string): User | null {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;
  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  if (signature !== expected) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as User & { exp: number; sub: string };
  if (data.exp < Math.floor(Date.now() / 1000)) return null;
  return {
    id: data.sub,
    username: data.username,
    displayName: data.displayName,
    role: data.role as Role
  };
}

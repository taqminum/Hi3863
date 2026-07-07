import type { Role } from "./domain.ts";

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
}

export interface SessionUser extends User {
  passwordHash: string;
}

export interface RequestContext {
  user: User | null;
}

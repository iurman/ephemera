// Shared types used across client and server

export type DropKind = "text" | "url";
export type UserRole = "owner" | "admin" | "user";
export type DropStatus = "active" | "expired" | "exhausted" | "revoked";

export interface User {
  id: string;
  displayName: string;
  role: UserRole;
  email?: string | null;
}

export interface Drop {
  id: string;
  token: string;
  ownerId: string | null;
  kind: DropKind;
  title: string;
  body: string;
  ttlMs: number;
  maxViews: number;
  usedViews: number;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  firstViewedAt: Date | null;
  lastViewedAt: Date | null;
  exhaustedAt: Date | null;
}

export interface DropListItem {
  id: string;
  token: string;
  title: string;
  kind: DropKind;
  maxViews: number;
  usedViews: number;
  expiresAt: Date;
  revokedAt: Date | null;
  firstViewedAt: Date | null;
  lastViewedAt: Date | null;
  exhaustedAt: Date | null;
  createdAt: Date;
  ownerId: string | null;
}

export interface CreateDropInput {
  title: string;
  body: string;
  ttlMs: number;
  maxViews: number;
  kind: DropKind;
}

// Pagination
export interface PaginationInput {
  cursor?: string;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// API Result types
export type Result<T = void> =
  | { ok: true } & T
  | { ok: false; error: string };

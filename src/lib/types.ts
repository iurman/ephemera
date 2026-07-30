// Shared types used across client and server

export type DropKind = "text" | "url" | "file";
export type UserRole = "owner" | "admin" | "user";
export type DropStatus = "active" | "expired" | "exhausted" | "revoked";

export interface User {
  id: string;
  displayName: string;
  role: UserRole;
  email?: string | null;
}

export interface DropListItem {
  id: string;
  token: string;
  title: string;
  kind: DropKind;
  encVersion: number;
  passwordProtected: boolean;
  maxViews: number;
  usedViews: number;
  expiresAt: Date;
  revokedAt: Date | null;
  firstViewedAt: Date | null;
  lastViewedAt: Date | null;
  exhaustedAt: Date | null;
  purgedAt: Date | null;
  createdAt: Date;
  ownerId: string | null;
}

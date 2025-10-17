# Ephemera — one-time / expiring “drops”

Tiny Next.js app to create **drops** (text or URL) that expire by time and/or after N views. Each view increments metrics. URL drops redirect; text drops render once. Admins/owners can mint one-time invite links for sign-ups.

## Features

- Create **Text** or **URL** drops
- Per-drop **TTL** (ms) and **max views**
- Auto-tracked metrics: `firstViewedAt`, `lastViewedAt`, `exhaustedAt`, `usedViews`
- Status badges: **Active**, **Expired**, **Exhausted**, **Revoked**
- Owner/Admin invite flow → `/signup?token=...`
- Dev-login for local testing
- Dashboard with **filters/search/sort** (Zustand), live timers, copy-link
- Session cookie (`sid`) + session table

## 🔧 Stack

- **Frontend:** Next.js App Router (15.x), React 18, TypeScript, Tailwind v4  
- **Data/Server:** Drizzle ORM, Postgres 16, **tRPC v11**, TanStack Query v5  
- **State:** Zustand (client UI filters/search/sort)  
- **Infra:** Docker + docker-compose (Node 22 + Postgres)

## Data model (Drizzle)

- **drops:** `id, token, ownerId, kind(text|url), title, body, ttlMs, maxViews, usedViews, createdAt, expiresAt, revokedAt, firstViewedAt, lastViewedAt, exhaustedAt`
- **views:** `id, dropId, viewedAt, ua, ip`
- **users:** `id, email?, displayName, role(owner|admin|user), passwordHash?, createdAt`
- **sessions:** `id, userId, createdAt, expiresAt`
- **invites:** `id, tokenHash, createdBy, createdAt, expiresAt, usedBy?, usedAt?, maxUses`

## Auth/session

- HttpOnly cookie: `sid=<sessionId>; Path=/; SameSite=Lax; Expires=…`  
  `Secure` is set in production.
- tRPC context reads `sid` → `ctx.user`
- Resolvers can push `Set-Cookie`; adapter returns them via `responseMeta`

### Flows

- **Bootstrap owner:** `auth.bootstrapOwner(displayName)`  
- **Dev login (local):** `/dev-login` → `/api/auth/dev-login` with `DEV_ADMIN_USER/PASS`
- **Create invite:** `auth.createInvite(expiresMinutes)` → `/signup?token=...` (owner/admin)
- **Consume invite:** `auth.consumeInvite(token, displayName, [password])`  
- **Logout:** `auth.logout()` clears session & cookie

## Routes

- `/` – minimal landing  
- `/dashboard` – create/revoke drops, live metrics, invites, sign out  
- `/d/[token]` – server route: **records view**, updates metrics, redirects (URL) or renders text  
- `/signup` – consumes invite token  
- `/dev-login` – local only (env-gated)  

## tRPC procedures (high level)

- `auth.me`, `auth.bootstrapOwner`, `auth.createInvite`, `auth.consumeInvite`, `auth.logout`  
- `drop.create`, `drop.list`, `drop.revoke`, `drop.consume` (atomic view+metrics)

> The tRPC client uses `fetch(..., { credentials: "include" })` so cookies round-trip. Mutations are POST.

## Quick start (Docker)

1. Create `.env.local` (see example below).
2. Start:
   ```bash
   docker compose up --build
   ```
3. Open http://localhost:3000  
   - **Bootstrap owner** on first run  
   - Or visit http://localhost:3000/dev-login for local admin

### Reset DB (dev only)

```bash
docker compose down -v
docker compose up --build
```

## Local env

Create **`.env.local`**:
```env
# Postgres (compose)
DATABASE_URL=postgres://postgres:postgres@db:5432/postgres

# Next
NODE_ENV=development

# Dev login (local only)
DEV_ADMIN_USER=admin
DEV_ADMIN_PASS=changeme
```

> Keep `.env.local` out of git (already in `.gitignore`). Commit a redacted `.env.example` if you like.

## Scripts

Common scripts (via `package.json`):

```bash
# run Next dev (if not using Docker)
npm run dev

# apply Drizzle migrations/schema
npm run drizzle:push
```

## Dashboard tips

- “Copy” button copies the public drop: `https://<host>/d/<token>`
- Filters/search/sort are **persisted** (Zustand) in local storage
- Live timer formatting:
  - `>5m`: `~Xm`
  - `1–5m`: `M:SS`
  - `<60s`: `Xs`

## Code map (handy files)

- `src/app/api/trpc/[...trpc]/route.ts` – tRPC adapter (reads cookie, sets `responseMeta`)
- `src/server/trpc/context.ts` – builds context (`user`, `sid`, `setCookies`)
- `src/server/trpc/routers/auth.ts` – auth flows (bootstrap, invite, signup, logout)
- `src/server/trpc/routers/drop.ts` – create/list/revoke/consume (+metrics)
- `src/server/db/schema.ts` – Drizzle models
- `src/server/db/client.ts` – Drizzle client
- `src/app/dashboard/page.tsx` – dashboard (tRPC client, Zustand filters)
- `src/app/d/[token]/page.tsx` – consume/redirect (server route)
- `src/app/dev-login/*` – local auth utilities
- `tailwind.config.ts`, `postcss.config.js`, `src/app/globals.css` – Tailwind v4 setup

## Production hardening checklist

- **Cookies:** set `Secure` behind HTTPS; consider `SameSite=Strict` for non-GET flows
- **Rate limit** auth routes; add **CSRF** token to mutations that change state
- **Indexes** (recommended):
  ```sql
  create index if not exists drops_token_idx on drops (token);
  create index if not exists views_dropid_viewedat_idx on views (drop_id, viewed_at desc);
  ```
- **Owner/admin tools** (optional): promote/demote, revoke sessions
- **Email/password login** (optional): wire `auth.loginWithPassword`

## Troubleshooting

- **“Unsupported GET for mutation”**  
  Ensure all mutations use `useMutation` and are not prefetched via GET; keep httpBatchLink defaults.
- **No stats line**  
  Confirm `drop.consume` updates `firstViewedAt/lastViewedAt/exhaustedAt` and `drop.list` selects those columns.
- **Cookies don’t stick**  
  Ensure tRPC client uses `credentials: "include"` and your backend sets `Set-Cookie` through `responseMeta`.

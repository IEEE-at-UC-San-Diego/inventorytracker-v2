# IEEE Project Space Inventory

Track parts in the project space: where they are, how many are left, and who
has what.

- **Find**: search parts and see exactly which drawer they're in.
- **Space**: each wall or table is a zone drawn front-on, so stacked organizers
  look stacked. Open a unit to see its drawers.
- **Drawers**: QR labels open a drawer page for quick take / check out / return
  on a phone.
- **Counted parts** (resistors, LEDs) are taken and used up. **Tracked parts**
  (Arduinos, tools) are checked out to a person and returned.
- **Officers** (Logto roles General Officer, Executive Officer, Administrator)
  can add parts, restock, recount, and edit the layout.

Built with TanStack Start, Convex, and Logto.

## Setup

1. **Logto**: create a _Single page app_ in the Logto console.
   - Redirect URI: `http://localhost:3000/callback` (plus your production URL)
   - Post sign-out redirect URI: `http://localhost:3000` (plus production)
   - The tenant must sign tokens with RSA. Check that
     `https://auth.ieeeatucsd.org/oidc/jwks` lists `"kty": "RSA"`.
2. **Convex**: run `npx convex dev` and pick or create the project. Then set the
   backend env vars it uses to validate Logto tokens:
   ```bash
   npx convex env set LOGTO_ENDPOINT https://auth.ieeeatucsd.org
   npx convex env set LOGTO_APP_ID <logto app id>
   ```
3. **App env**: copy `.env.example` to `.env.local` and fill in
   `VITE_LOGTO_APP_ID` (`npx convex dev` fills in the Convex values).
4. Run `npx convex dev` and `pnpm dev` side by side, then open
   http://localhost:3000.

## Deploy (Dokploy + self-hosted Convex)

`docker-compose.yml` runs the app, a self-hosted Convex backend and dashboard,
and a one-shot `convex-deploy` job that pushes `convex/` before the app starts.

1. In Dokploy, create a **Compose** service pointing at this repo.
2. Copy `.env.docker.example` into its Environment tab and fill it in. Leave
   `CONVEX_SELF_HOSTED_ADMIN_KEY` empty for now.
3. Add domains: `app` → 3000, `backend` → 3210 (`CONVEX_CLOUD_ORIGIN`),
   `backend` → 3211 (`CONVEX_SITE_ORIGIN`), `dashboard` → 6791.
4. Deploy. The Convex step is skipped because there is no admin key yet.
5. Generate the key with `docker exec <backend container> ./generate_admin_key.sh`,
   set `CONVEX_SELF_HOSTED_ADMIN_KEY`, and deploy again. Every deploy after this
   pushes the Convex functions and sets `LOGTO_ENDPOINT` / `LOGTO_APP_ID` on the
   backend. The same key logs you into the dashboard.
6. Add `https://<app domain>/callback` and `https://<app domain>` to the Logto
   app's redirect URIs.

The `VITE_*` values are baked into the client bundle at build time, so changing
a domain or the Logto app means a rebuild (any Dokploy redeploy does that).

## How auth works

The browser signs in with Logto and passes the Logto ID token to Convex, which
verifies it against Logto's JWKS (`convex/auth.config.ts`). Every Convex
function reads the user from `ctx.auth`; nothing trusts identity sent by the
client. Officer checks read the `roles` claim (requested with the `roles` scope).

## Scripts

```bash
pnpm dev            # app on :3000
pnpm build          # production build (Nitro, outputs to .output/)
pnpm lint
pnpm intent list    # local TanStack skills for agents
```

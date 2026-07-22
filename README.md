# PartyKit Multiplayer Chat

An anonymous, temporary multiplayer chat built as two independent Cloudflare components:

- a Nuxt 4 client-rendered SPA hosted with Workers Static Assets;
- an in-memory PartyKit server deployed in cloud-prem mode to a Cloudflare account.

Rooms have no database or durable history. The last Participant leaving clears the Room lifetime.

## Requirements

- Node.js 22 or newer
- pnpm 10.32.1 (the version declared in `package.json`)
- Chromium for Playwright (`pnpm exec playwright install chromium` when it is not already installed)
- A Cloudflare account and scoped API token only when deploying

Install dependencies:

```sh
pnpm install
```

## Local development

Run PartyKit in one terminal:

```sh
pnpm dev:party
```

Run Nuxt in another:

```sh
NUXT_PUBLIC_PARTY_KIT_HOST=127.0.0.1:1999 pnpm dev
```

Open `http://localhost:3000`. Local PartyKit accepts loopback origins when `FRONTEND_ORIGIN` is unset. `NUXT_PUBLIC_PARTY_KIT_HOST` is a host and optional port, without an `http://` or `https://` prefix.

## Verification

The release gate is:

```sh
pnpm typecheck
pnpm test:unit
pnpm test:e2e
pnpm test:live
pnpm test:deploy
pnpm generate
pnpm deploy:frontend:dry-run
```

The suites cover the framework-independent Room rules, Nuxt entry flows, the generated application against a real local PartyKit server, and Workers Static Assets SPA routing. `pnpm test:deploy` generates the site, starts local Wrangler, and verifies both `/` and a direct `/rooms/<uuid>` navigation.

`pnpm generate` is the single frontend build command. It runs `nuxt generate` and writes ignored deployment output to `.output/public`.

Preview that output with the production assets routing configuration:

```sh
pnpm generate
pnpm preview:frontend
```

The preview listens on `http://127.0.0.1:8787` by default. Pass another Wrangler port when needed, for example `pnpm preview:frontend --port 8790`.

## Configuration

The generated frontend reads `NUXT_PUBLIC_PARTY_KIT_HOST` at generation time. A production build must set it to the deployed PartyKit host:

```sh
NUXT_PUBLIC_PARTY_KIT_HOST="$PARTYKIT_HOST" pnpm generate
```

The PartyKit server reads `FRONTEND_ORIGIN` at runtime and accepts production WebSocket upgrades only from that exact origin. Supply it during deployment with PartyKit's `--var` option.

Keep these values in the operator shell or a secret manager:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `PARTYKIT_DOMAIN`, such as `chat-api.example.com`
- `PARTYKIT_HOST`, normally the same hostname used by the PartyKit deployment
- `FRONTEND_ORIGIN`, such as `https://chat.example.com`

`.env`, `.env.*`, `.wrangler`, `.partykit`, generated output, account IDs, tokens, and environment-specific endpoints are excluded from version control. Do not add production values to `nuxt.config.ts`, `partykit.json`, or `wrangler.jsonc`.

## Deploy PartyKit

PartyKit is deployed separately in cloud-prem mode. Confirm the target Cloudflare account, custom domain, frontend origin, and intended Worker change before running this consequential command:

```sh
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
pnpm deploy:partykit --domain "$PARTYKIT_DOMAIN" --var FRONTEND_ORIGIN="$FRONTEND_ORIGIN"
```

The script runs `partykit deploy`; `--domain` selects cloud-prem deployment to the configured Cloudflare account, and `--var` supplies the allowed production origin without committing it. Record the resulting PartyKit endpoint in the release notes or secret/configuration system, not in this repository.

To diagnose the backend:

- confirm `CLOUDFLARE_ACCOUNT_ID` selects the intended account;
- confirm the API token has the required Workers permissions;
- check that `FRONTEND_ORIGIN` exactly matches the browser's origin, including scheme and any non-default port;
- use `pnpm exec partykit tail --name partykit-multiplayer-chat` for live service logs;
- reproduce protocol behavior locally with `pnpm test:unit` and `pnpm test:live`.

## Deploy the frontend

The frontend is an assets-only Worker configured by `wrangler.jsonc`. Its asset directory is `.output/public`, and `not_found_handling` is `single-page-application` so shared Room URLs load the Nuxt shell.

First validate the exact production build without changing Cloudflare state:

```sh
NUXT_PUBLIC_PARTY_KIT_HOST="$PARTYKIT_HOST" pnpm deploy:frontend:dry-run
```

After confirming the Cloudflare account, PartyKit host, Worker name, and intended asset change, deploy:

```sh
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
NUXT_PUBLIC_PARTY_KIT_HOST="$PARTYKIT_HOST" \
pnpm deploy:frontend
```

The deploy script regenerates the application before `wrangler deploy`, so the PartyKit hostname is baked into the shipped client. Record Wrangler's resulting frontend endpoint outside version control, then ensure it is the same origin supplied as `FRONTEND_ORIGIN` on the PartyKit deployment.

To diagnose the frontend:

- run `pnpm test:deploy` to reproduce Cloudflare SPA routing locally;
- run `pnpm deploy:frontend:dry-run` to validate asset discovery and Wrangler configuration;
- inspect the generated client for the intended PartyKit hostname after setting `NUXT_PUBLIC_PARTY_KIT_HOST`;
- confirm a direct `/rooms/<uuid>` browser navigation returns HTTP 200;
- use `pnpm exec wrangler tail partykit-multiplayer-chat-frontend` for deployed Worker logs and `pnpm exec wrangler deployments list --name partykit-multiplayer-chat-frontend` for deployment history.

Frontend and PartyKit deployments are deliberately independent. A real deployment is never part of the automated verification gate and must always be explicitly confirmed by the account operator.

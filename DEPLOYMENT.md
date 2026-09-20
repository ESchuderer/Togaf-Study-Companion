# Deployment

[Project overview](README.md). Keep internal datasets and deployment settings under the ignored `private/` directory. Only datasets and embedded images are included in authenticated deployments.

## GitHub Pages: simple single-device use

The included `.github/workflows/pages.yml` builds on pushes to `main`. In repository Settings, Pages, choose **GitHub Actions** as the source. The workflow sets the repository subpath and uploads only `dist`. [Official GitHub Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

You can also run `npm run build` and serve `dist` on any static host. A free Cloudflare Pages project uses build command `npm run build`, output `dist`, `NODE_VERSION=24`, and `ASTRO_BASE=/`. This option is still device-local. [Cloudflare Astro guide](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/). The Free plan currently allows 500 builds per month and 25 MiB per asset. [Official limits](https://developers.cloudflare.com/pages/platform/limits/).

## Cloudflare: synchronized private use

This mode reuses the authenticated Worker and D1 database. All assets, internal sets and APIs require an allowed GitHub account. Accounts have separate results, personal datasets and switches. GitHub sign-in requests no repository access. [GitHub OAuth flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [Worker asset authentication](https://developers.cloudflare.com/workers/static-assets/binding/#run_worker_first).

For the already-configured owner instance, run from this project root:

```sh
npm run deploy
```

The command rebuilds `dist-cloud`, validates and includes `private/private-datasets/all-private-questions.json`, and uploads it to the configured Worker. Existing D1 progress and OAuth secrets are preserved. Other private files remain local; nothing in `private/` is committed.

Banks can share a `dataset` group ID and `datasetTitle` (for example, `personal-practice` and `Personal practice`). These values supply the labels and switches in My data; keep your own names in the private JSON. Omit both fields for independent banks. Use stable bank IDs to preserve saved results. GitHub Pages builds contain only the included generated sets.

For your own instance:

1. Copy `wrangler.example.jsonc` to `private/wrangler.jsonc`; fill in your Worker name, D1 database ID, HTTPS origin, GitHub OAuth client ID and allowed numeric GitHub user IDs. Keep `run_worker_first: true`.
2. Run `npx wrangler login`, then create D1 with `npx wrangler d1 create YOUR_DATABASE`. [D1 setup](https://developers.cloudflare.com/d1/get-started/).
3. Register a GitHub OAuth app with callback `https://YOUR_SITE/auth/callback`. Store its secret with `npx wrangler secret put GITHUB_CLIENT_SECRET --config private/wrangler.jsonc`. [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
4. Apply the additive schema: `npx wrangler d1 execute YOUR_DATABASE --remote --file cloud/schema.sql --config private/wrangler.jsonc`. Repeat after schema updates. Back up existing data first with `npx wrangler d1 export YOUR_DATABASE --remote --output private/account-backup.sql --config private/wrangler.jsonc`.
5. Put your internal import file at the path above, or use `{"version":1,"banks":[]}` if you have no internal sets. Run `npm run build:cloud`, `npm run test:cloud`, then `npm run deploy`.
6. Sign in on two devices with the same allowed account. Finish a practice session, confirm **Synced to your account**, then check its history on the other device.

Workers and D1 offer free tiers subject to their quotas; no paid features are required by this app. Check current [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) before deploying. The default `workers.dev` address needs no domain purchase. [Workers subdomains](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

## Your own host: synchronized private use

The Node host serves the same authenticated API and private frontend, storing account data in SQLite. No Cloudflare service is required.

1. Install Node 24, run `npm ci`, and provision your ignored `private/` directory on the host.
2. Copy `host.env.example` to `private/host.env` and set `SITE_ORIGIN` to your public HTTPS origin, plus the GitHub OAuth client ID, secret and allowed numeric user IDs. Use `SITE_ORIGIN/auth/callback` as the OAuth callback.
3. Run `npm run build:cloud`, then `npm run start:host`. The backend creates or updates `private/progress.sqlite` using the additive schema.
4. Put an HTTPS reverse proxy in front of `127.0.0.1:3000`, forwarding requests to this Node process. Serve all routes through it; do not expose `dist-cloud` as a separate public static directory. Secure session cookies require HTTPS. Configure your service manager to restart the process when needed.
5. Back up `private/` securely. For a consistent SQLite file backup, stop the host before copying the database and its WAL files, then restart it. Keep secrets and backups readable only by the host operator.

Dataset and history downloads contain private material. On every deployment, only allowed accounts can access the shared internal sets. The hosting administrator can access stored account data; this is access control, not administrator-blind encryption.

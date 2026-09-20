# TOGAF study companion

Foundation and Practitioner practice with explanations, statistics and backups.

- **GitHub Pages:** simple, single-device use with local storage.
- **Cloudflare or your own host:** sign in to sync progress, sets and preferences across devices.

Use Node 24:

```sh
npm ci
npm run dev
```

`npm test` runs the checks. `npm run deploy` updates a configured Cloudflare instance. See [deployment setup](DEPLOYMENT.md) for GitHub Pages, Cloudflare and self-hosting.

Manage generated and private question sets in **My data**. I keep questions from paid practice exams in `private/`; those questions aren't included in this repository.

The Git-ignored `private/` directory holds internal datasets and deployment settings. Cloudflare deployments automatically include your configured question sets and images. Back up this directory separately.

Statistics use full-length sessions: **40 questions for Part 1, 8 for Part 2**, in study or exam mode. Combined readiness follows the weaker part.

[Cheat sheet](public/TOGAF-CHEAT-SHEET-EN.pdf) · [TOGAF certification](https://www.opengroup.org/certifications/togaf)
